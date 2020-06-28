import { Context, Handler } from "./context";
import net from "net";
import { ID, Table } from "./kademlia";
import nacl from "tweetnacl";
import { getAvailableAddress, splitHostPort } from "./net";
import { IPv4, IPv6 } from "ipaddr.js";
import {
  DataPacket,
  FindNodeRequest,
  FindNodeResponse,
  HandshakePacket,
  Opcode,
  ServiceRequestPacket,
  ServiceResponsePacket,
} from "./packet";
import events from "events";
import { clientHandshake, serverHandshake, Session } from "./session";
import hash from "object-hash";
import { Provider } from "./provider";

const debug = require("debug")("flatend");

export interface NodeOptions {
  // A reachable, public address which peers may reach you on.
  // The format of the address must be [host]:[port].
  publicAddr?: string;

  // A list of [host]:[port] addresses which this node will bind a listener
  // against to accept new Flatend nodes.
  bindAddrs?: string[];

  // A list of addresses to nodes to initially reach out
  // for/bootstrap from first.
  addrs?: string[];

  // An Ed25519 secret key. A secret key must be provided to allow for
  // peers to reach you. A secret key may be generated by calling
  // 'flatend.generateSecretKey()'.
  secretKey?: Uint8Array;

  // A mapping of service names to their respective handlers.
  services?: { [key: string]: Handler };
}

export class Node {
  services = new Map<string, Set<Provider>>();
  clients = new Map<string, Provider>();
  servers = new Set<net.Server>();
  conns = new Set<net.Socket>();
  table = new Table();

  id?: ID;
  keys?: nacl.SignKeyPair;
  handlers: { [key: string]: Handler } = {};
  _shutdown = false;

  public static async start(opts: NodeOptions): Promise<Node> {
    const node = new Node();

    if (opts.services) node.handlers = opts.services;

    if (opts.secretKey) {
      node.keys = nacl.sign.keyPair.fromSecretKey(opts.secretKey);

      debug(`Public Key: ${Buffer.from(node.keys.publicKey).toString("hex")}`);

      const bindAddrs = opts.bindAddrs ?? [];
      if (bindAddrs.length === 0) {
        if (opts.publicAddr) {
          bindAddrs.push(opts.publicAddr);
        } else {
          const { host, port } = await getAvailableAddress();
          bindAddrs.push(host + ":" + port);
        }
      }

      let publicHost: IPv4 | IPv6;
      let publicPort: number;

      if (opts.publicAddr) {
        const { host, port } = splitHostPort(opts.publicAddr);
        publicHost = host;
        publicPort = port;
      } else {
        const { host, port } = splitHostPort(bindAddrs[0]);
        publicHost = host;
        publicPort = port;
      }

      node.id = new ID(node.keys.publicKey, publicHost, publicPort);
      node.table = new Table(node.id.publicKey);

      const promises = [];

      for (const bindAddr of bindAddrs) {
        const { host, port } = splitHostPort(bindAddr);
        promises.push(node.listen({ host: host.toString(), port }));
      }

      await Promise.all(promises);
    }

    if (opts.addrs) {
      const promises = [];

      for (const addr of opts.addrs) {
        const { host, port } = splitHostPort(addr);
        promises.push(node.connect({ host: host.toString(), port: port }));
      }

      await Promise.all(promises);
      await node.bootstrap();
    }

    return node;
  }

  async bootstrap() {
    const pub = this.id?.publicKey ?? Buffer.alloc(nacl.sign.publicKeyLength);
    const visited = new Set<string>();

    let queue: ID[] = this.table.closestTo(pub, this.table.cap);
    if (queue.length === 0) return;

    for (const id of queue) {
      visited.add(Buffer.from(id.publicKey).toString("hex"));
    }

    const closest: ID[] = [];

    while (queue.length > 0) {
      const next: ID[] = [];

      await Promise.all(
        queue.map(async (id) => {
          const { host, port } = splitHostPort(id.addr);

          try {
            const client = await this.connect({ host: host.toString(), port });

            const res = FindNodeResponse.decode(
              await client.request(
                Buffer.concat([
                  Buffer.of(Opcode.FindNodeRequest),
                  new FindNodeRequest(pub).encode(),
                ])
              )
            )[0];

            res.closest = res.closest.filter((id) => {
              return !visited.has(Buffer.from(id.publicKey).toString("hex"));
            });

            closest.push(...res.closest);
            next.push(...res.closest);
          } catch (err) {
            // ignore
          }
        })
      );

      queue = next;
    }

    debug(`Discovered ${closest.length} peer(s).`);
  }

  /**
   * Shuts down all active connections and listeners on this node. After shutting
   * down a node, it may not be reused. \
   */
  async shutdown() {
    if (this._shutdown) throw new Error("Node is shut down.");

    this._shutdown = true;

    const promises = [];

    for (const conn of this.conns) {
      promises.push(events.once(conn, "close"));
      conn.end();
    }

    for (const server of this.servers) {
      promises.push(events.once(server, "close"));
      server.close();
    }

    await Promise.all(promises);
  }

  /**
   * Provides a list of nodes that provide either one of the many specified services.
   *
   * @param services List of services.
   */
  providersFor(services: string[]): Provider[] {
    const map = this._providers(services).reduce(
      (map: Map<string, Provider>, provider: Provider) =>
        provider.id?.publicKey
          ? map.set(hash(provider.id.publicKey), provider)
          : map,
      new Map<string, Provider>()
    );

    return [...map.values()];
  }

  _providers(services: string[]): Provider[] {
    const providers: Provider[] = [];
    for (const service of services) {
      const entries = this.services.get(service);
      if (!entries) continue;
      providers.push(...entries);
    }
    return providers;
  }

  /**
   * Request one of any available nodes to provide one of the many specified services. A request header
   * may be attached to the request sent out to a designated node, along with a body.
   *
   * @param services List of services.
   * @param headers Request headers.
   * @param body The request body. Must not be null/undefined.
   */
  async push(
    services: string[],
    headers: { [key: string]: string },
    body: AsyncIterable<Buffer>
  ) {
    if (this._shutdown) throw new Error("Node is shut down.");

    const providers = this._providers(services);

    for (const provider of providers) {
      return await provider.push(services, headers, body);
    }

    throw new Error(
      `No nodes were able to process your request for service(s): [${services.join(
        ", "
      )}]`
    );
  }

  /**
   * Start listening for Flatend nodes at a specified IP family/host/port.
   *
   * @param opts IP family/host/port.
   */
  async listen(opts: net.ListenOptions) {
    if (this._shutdown) throw new Error("Node is shut down.");

    const server = net.createServer(async (conn) => {
      this.conns.add(conn);

      setImmediate(async () => {
        await events.once(conn, "close");
        this.conns.delete(conn);
      });

      try {
        const secret = await serverHandshake(conn);
        const session = new Session(secret);

        const provider = new Provider(conn, session, false);
        setImmediate(() => this.read(provider));
      } catch (err) {
        debug("Error from incoming node:", err);
        conn.end();
      }
    });

    server.listen(opts);

    await events.once(server, "listening");

    this.servers.add(server);

    setImmediate(async () => {
      await events.once(server, "close");
      this.servers.delete(server);
    });

    const info = (<net.AddressInfo>server.address())!;

    debug(`Listening for Flatend nodes on '${info.address}:${info.port}'.`);
  }

  /**
   * Connect to a Flatend node and ask and keep track of the services it provides.
   *
   * @param opts Flatend node IP family/host/port.
   */
  async connect(opts: net.NetConnectOpts) {
    if (this._shutdown) throw new Error("Node is shut down.");

    let provider = this.clients.get(hash(opts));

    if (!provider) {
      const conn = net.connect(opts);
      await events.once(conn, "connect");

      this.conns.add(conn);

      setImmediate(async () => {
        await events.once(conn, "close");
        this.clients.delete(hash(opts));
        this.conns.delete(conn);
      });

      try {
        const secret = await clientHandshake(conn);
        const session = new Session(secret);

        provider = new Provider(conn, session, true);
        this.clients.set(hash(opts), provider);

        setImmediate(() => this.read(provider!));

        const handshake = new HandshakePacket(
          this.id,
          [...Object.keys(this.handlers)],
          undefined
        );
        if (this.keys)
          handshake.signature = nacl.sign.detached(
            handshake.payload,
            this.keys.secretKey
          );

        const response = await provider.request(
          Buffer.concat([Buffer.of(Opcode.Handshake), handshake.encode()])
        );
        const packet = HandshakePacket.decode(response)[0];

        provider.handshaked = true;

        if (packet.id && packet.signature) {
          if (
            !nacl.sign.detached.verify(
              packet.payload,
              packet.signature,
              packet.id.publicKey
            )
          ) {
            throw new Error(`Handshake packet signature is malformed.`);
          }
          provider.id = packet.id;
          this.table.update(provider.id);
        }

        debug(
          `You have connected to '${
            provider.addr
          }'. Services: [${packet.services.join(", ")}]`
        );

        for (const service of packet.services) {
          provider.services.add(service);

          let providers = this.services.get(service);
          if (!providers) {
            providers = new Set<Provider>();
            this.services.set(service, providers);
          }
          providers.add(provider);
        }

        setImmediate(async () => {
          await events.once(provider!.sock, "end");

          debug(
            `'${
              provider!.addr
            }' has disconnected from you. Services: [${packet.services.join(
              ", "
            )}]`
          );

          if (provider!.id) {
            this.table.delete(provider!.id.publicKey);
          }

          for (const service of packet.services) {
            let providers = this.services.get(service)!;
            if (!providers) continue;

            providers.delete(provider!);
            if (providers.size === 0) this.services.delete(service);
          }
        });

        setImmediate(async () => {
          await events.once(provider!.sock, "end");

          if (this._shutdown) return;

          let count = 8;

          const reconnect = async () => {
            if (this._shutdown) return;

            if (count-- === 0) {
              debug(
                `Tried 8 times reconnecting to ${provider!.addr}. Giving up.`
              );
              return;
            }

            debug(
              `Trying to reconnect to '${provider!.addr}'. Sleeping for 500ms.`
            );

            try {
              await this.connect(opts);
            } catch (err) {
              setTimeout(reconnect, 500);
            }
          };

          setTimeout(reconnect, 500);
        });
      } catch (err) {
        conn.end();
        throw err;
      }
    }

    return provider;
  }

  async read(provider: Provider) {
    try {
      await this._read(provider);
    } catch (err) {
      debug("Provider had shut down with an error:", err);
    }

    provider.sock.end();
  }

  async _read(provider: Provider) {
    for await (const { seq, opcode, frame } of provider.read()) {
      await this._handle(provider, seq, opcode, frame);
    }
  }

  async _handle(
    provider: Provider,
    seq: number,
    opcode: number,
    frame: Buffer
  ) {
    switch (opcode) {
      case Opcode.Handshake: {
        if (provider.handshaked) {
          throw new Error("Provider attempted to handshake twice.");
        }
        provider.handshaked = true;

        const packet = HandshakePacket.decode(frame)[0];
        if (packet.id && packet.signature) {
          if (
            !nacl.sign.detached.verify(
              packet.payload,
              packet.signature,
              packet.id.publicKey
            )
          ) {
            throw new Error(`Handshake packet signature is malformed.`);
          }
          provider.id = packet.id;
          this.table.update(provider.id);
        }

        debug(
          `'${
            provider.addr
          }' has connected to you. Services: [${packet.services.join(", ")}]`
        );

        for (const service of packet.services) {
          provider.services.add(service);

          let providers = this.services.get(service);
          if (!providers) {
            providers = new Set<Provider>();
            this.services.set(service, providers);
          }
          providers.add(provider);
        }

        setImmediate(async () => {
          await events.once(provider.sock, "end");

          debug(
            `'${
              provider.addr
            }' has disconnected from you. Services: [${packet.services.join(
              ", "
            )}]`
          );

          if (provider.id) {
            this.table.delete(provider.id.publicKey);
          }

          for (const service of packet.services) {
            let providers = this.services.get(service)!;
            if (!providers) continue;

            providers.delete(provider);
            if (providers.size === 0) this.services.delete(service);
          }
        });

        const response = new HandshakePacket(
          this.id,
          [...Object.keys(this.handlers)],
          undefined
        );
        if (this.keys)
          response.signature = nacl.sign.detached(
            response.payload,
            this.keys.secretKey
          );

        await provider.write(provider.rpc.message(seq, response.encode()));

        return;
      }
      case Opcode.ServiceRequest: {
        const packet = ServiceRequestPacket.decode(frame)[0];
        const stream = provider.streams.register(packet.id);

        const service = packet.services.find(
          (service) => service in this.handlers
        );
        if (!service) {
          const payload = new ServiceResponsePacket(
            packet.id,
            false,
            {}
          ).encode();
          await provider.write(
            provider.rpc.message(
              0,
              Buffer.concat([Buffer.of(Opcode.ServiceResponse), payload])
            )
          );
        } else {
          const ctx = new Context(provider, stream, packet.headers);
          const handler = this.handlers[service];

          setImmediate(async () => {
            try {
              await handler(ctx);
            } catch (err) {
              if (!ctx.writableEnded) {
                ctx.json({ error: err?.message ?? "Internal server error." });
              }
            }
          });
        }

        return;
      }
      case Opcode.ServiceResponse: {
        const packet = ServiceResponsePacket.decode(frame)[0];
        const stream = provider.streams.get(packet.id);
        if (!stream) {
          throw new Error(
            `Got response headers for stream ID ${packet.id} which is not registered.`
          );
        }
        provider.streams.pull(stream, packet.handled, packet.headers);
        return;
      }
      case Opcode.Data: {
        const packet = DataPacket.decode(frame)[0];
        const stream = provider.streams.get(packet.id);
        if (!stream) {
          throw new Error(
            `Got data for stream ID ${packet.id} which is not registered, or has ended.`
          );
        }
        provider.streams.recv(stream, packet.data);
        return;
      }
      case Opcode.FindNodeRequest: {
        const packet = FindNodeRequest.decode(frame)[0];
        const response = new FindNodeResponse(
          this.table.closestTo(packet.target, this.table.cap)
        );
        await provider.write(provider.rpc.message(seq, response.encode()));
      }
    }
  }
}

/**
 * Generates an Ed25519 secret key for a node.
 */
export function generateSecretKey(): Buffer {
  return Buffer.from(nacl.sign.keyPair().secretKey);
}

export function* chunkBuffer(buf: Buffer, size: number) {
  while (buf.byteLength > 0) {
    size = size > buf.byteLength ? buf.byteLength : size;
    yield buf.slice(0, size);
    buf = buf.slice(size);
  }
}
