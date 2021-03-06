import { Buffer } from 'https://deno.land/std/node/buffer.ts'
import { EventEmitter } from 'https://deno.land/std/node/events.ts'
import { Duplex } from './std-node-stream.ts'

export class Socket extends Duplex {
  #connection?: Deno.Conn

  constructor(options?: SocketConstructorOpts) {
    super()
    console.log('todo: net.Socket', options)
    // setTimeout(() => {}, 3000)
  }
  // // Extended base methods
  // write(buffer: Uint8Array | string, cb?: (err?: Error) => void): boolean;
  // write(str: Uint8Array | string, encoding?: BufferEncoding, cb?: (err?: Error) => void): boolean;

  // connect(port: number, host: string, connectionListener?: () => void): this;
  // connect(port: number, connectionListener?: () => void): this;
  // connect(path: string, connectionListener?: () => void): this;

  connect(options: SocketConnectOpts, connectionListener?: () => void): this {
    if (!('host' in options)) {
      throw new Error('host missing')
    }

    console.log('todo: net.Socket.connect', options)

    if (this.write !== Socket.prototype.write)
      this.write = Socket.prototype.write

    // if (this.destroyed) {
    //   this._handle = null;
    //   this._peername = null;
    //   this._sockname =s null;
    // }
    if (typeof connectionListener === 'function') {
      this.once('connect', connectionListener)
    }
    this.connecting = true
    this.writable = true

    setTimeout(() =>
      Deno.connect({
        hostname: options?.host,
        port: Number(options?.port),
      }).then(async conn => {
        this.#connection = conn
        this.connecting = false
        this.emit('connect')
        this.emit('ready')

        const i = setInterval(() => {
          const ok = new Uint8Array(32)
          conn.read(ok).then(len => {
            console.log('read', ok)
          })
          // console.log('reading', ok)
        }, 1000)

        console.log('todo: net.connect.connected', conn.read(new Uint8Array(0)))
        // await Promise.all([Deno.copy(conn, this), Deno.copy(this, conn)]);
      })
    )

    return this
  }

  // setEncoding(encoding?: BufferEncoding): this;
  // pause(): this;
  // resume(): this;
  // setTimeout(timeout: number, callback?: () => void): this;
  // setNoDelay(noDelay?: boolean): this;
  // setKeepAlive(enable?: boolean, initialDelay?: number): this;
  // address(): AddressInfo | string;
  // unref(): this;
  // ref(): this;

  // readonly bufferSize: number;
  // readonly bytesRead: number;
  // readonly bytesWritten: number;
  /*readonly*/ connecting: boolean = false
  // readonly destroyed: boolean;
  // readonly localAddress: string;
  // readonly localPort: number;
  // readonly remoteAddress?: string;
  // readonly remoteFamily?: string;
  // readonly remotePort?: number;
  /* override because readonly*/ writable: boolean = false

  read(len: number): Uint8Array {
    console.log('todo: net.Socket.read', len)
    const buf = new Uint8Array(len)
    this.#connection?.read(buf) || buf
    return buf
    // return super.read(len)
    // return new Uint8Array(8)
  }
  // write(buffer: Uint8Array | string, cb?: (err?: Error) => void): boolean;
  // write(str: Uint8Array | string, encoding?: BufferEncoding, cb?: (err?: Error) => void): boolean;
  write(str: Uint8Array): boolean {
    console.log('  ok: net.Socket.write', str)
    this.#connection?.write(str)
    return super.write(str)
  }
  end(): boolean {
    console.log('todo: net.Socket.end')
    return false
  }
  [Symbol.asyncIterator](): AsyncIterableIterator<any> {
    console.log('todo: net.Socket.asyncIterator')
    return false as any
  }
}

export interface AddressInfo {
  address: string
  family: string
  port: number
}

export class Server extends EventEmitter {
  #listener?: (socket: Socket) => void

  constructor(connectionListener?: (socket: Socket) => void) {
    super()
    console.log('todo: net.Server')
    this.#listener = connectionListener
  }

  unref() {
    console.log('todo: net.Server.unref')
  }

  close() {
    console.log('todo: net.Server.close')
  }
  address(): AddressInfo {
    console.log('todo: net.Server.address')
    return ({} as unknown) as AddressInfo
  }

  // listen(port?: number, hostname?: string, backlog?: number, listeningListener?: () => void): this;
  // listen(port?: number, hostname?: string, listeningListener?: () => void): this;
  // listen(port?: number, backlog?: number, listeningListener?: () => void): this;
  // listen(port?: number, listeningListener?: () => void): this;
  // listen(path: string, backlog?: number, listeningListener?: () => void): this;
  // listen(path: string, listeningListener?: () => void): this;
  listen(options?: ListenOptions, listeningListener?: () => void): this {
    console.log('todo: net.Server.listen')
    return this
  }
  // listen(handle: any, backlog?: number, listeningListener?: () => void): this;
  // listen(handle: any, listeningListener?: () => void): this;
  // close(callback?: (err?: Error) => void): this;
  // address(): AddressInfo | string | null;
  // getConnections(cb: (error: Error | null, count: number) => void): void;
  // ref(): this;
  // unref(): this;
  // maxConnections: number;
  // connections: number;
  // listening: boolean;

  // /**
  //  * events.EventEmitter
  //  *   1. close
  //  *   2. connection
  //  *   3. error
  //  *   4. listening
  //  */
  // addListener(event: string, listener: (...args: any[]) => void): this;
  // addListener(event: "close", listener: () => void): this;
  // addListener(event: "connection", listener: (socket: Socket) => void): this;
  // addListener(event: "error", listener: (err: Error) => void): this;
  // addListener(event: "listening", listener: () => void): this;

  // emit(event: string | symbol, ...args: any[]): boolean;
  // emit(event: "close"): boolean;
  // emit(event: "connection", socket: Socket): boolean;
  // emit(event: "error", err: Error): boolean;
  // emit(event: "listening"): boolean;

  // on(event: string, listener: (...args: any[]) => void): this;
  // on(event: "close", listener: () => void): this;
  // on(event: "connection", listener: (socket: Socket) => void): this;
  // on(event: "error", listener: (err: Error) => void): this;
  // on(event: "listening", listener: () => void): this;

  // once(event: string, listener: (...args: any[]) => void): this;
  // once(event: "close", listener: () => void): this;
  // once(event: "connection", listener: (socket: Socket) => void): this;
  // once(event: "error", listener: (err: Error) => void): this;
  // once(event: "listening", listener: () => void): this;

  // prependListener(event: string, listener: (...args: any[]) => void): this;
  // prependListener(event: "close", listener: () => void): this;
  // prependListener(event: "connection", listener: (socket: Socket) => void): this;
  // prependListener(event: "error", listener: (err: Error) => void): this;
  // prependListener(event: "listening", listener: () => void): this;

  // prependOnceListener(event: string, listener: (...args: any[]) => void): this;
  // prependOnceListener(event: "close", listener: () => void): this;
  // prependOnceListener(event: "connection", listener: (socket: Socket) => void): this;
  // prependOnceListener(event: "error", listener: (err: Error) => void): this;
  // prependOnceListener(event: "listening", listener: () => void): this;
}

// Types

export type LookupFunction = (
  hostname: string,
  options: any /*dns.LookupOneOptions*/,
  callback: (
    err: any /*NodeJS.ErrnoException | null*/,
    address: string,
    family: number
  ) => void
) => void

export interface AddressInfo {
  address: string
  family: string
  port: number
}

export interface SocketConstructorOpts {
  fd?: number
  allowHalfOpen?: boolean
  readable?: boolean
  writable?: boolean
}

export interface OnReadOpts {
  buffer: Uint8Array | (() => Uint8Array)
  /**
   * This function is called for every chunk of incoming data.
   * Two arguments are passed to it: the number of bytes written to buffer and a reference to buffer.
   * Return false from this function to implicitly pause() the socket.
   */
  callback(bytesWritten: number, buf: Uint8Array): boolean
}

export interface ConnectOpts {
  /**
   * If specified, incoming data is stored in a single buffer and passed to the supplied callback when data arrives on the socket.
   * Note: this will cause the streaming functionality to not provide any data, however events like 'error', 'end', and 'close' will
   * still be emitted as normal and methods like pause() and resume() will also behave as expected.
   */
  onread?: OnReadOpts
}

export interface TcpSocketConnectOpts extends ConnectOpts {
  port: number
  host?: string
  localAddress?: string
  localPort?: number
  hints?: number
  family?: number
  lookup?: LookupFunction
}

export interface IpcSocketConnectOpts extends ConnectOpts {
  path: string
}

export type SocketConnectOpts = TcpSocketConnectOpts | IpcSocketConnectOpts

export interface ListenOptions {
  port?: number
  host?: string
  backlog?: number
  path?: string
  exclusive?: boolean
  readableAll?: boolean
  writableAll?: boolean
  /**
   * @default false
   */
  ipv6Only?: boolean
}

export interface TcpNetConnectOpts
  extends TcpSocketConnectOpts,
    SocketConstructorOpts {
  timeout?: number
}

export interface IpcNetConnectOpts
  extends IpcSocketConnectOpts,
    SocketConstructorOpts {
  timeout?: number
}

export type NetConnectOpts = TcpNetConnectOpts | IpcNetConnectOpts

export function createServer(
  connectionListener?: (socket: Socket) => void
): Server {
  console.log('todo: net.createServer')
  return new Server(console.log)
}
// export function createServer(options?: { allowHalfOpen?: boolean, pauseOnConnect?: boolean }, connectionListener?: (socket: Socket) => void): Server;
export function connect(
  options: NetConnectOpts,
  connectionListener?: () => void
): Socket {
  const socket = new Socket(options)

  if (options.timeout) {
    // socket.setTimeout(options.timeout);
  }

  return socket.connect(options)
}
// export function connect(port: number, host?: string, connectionListener?: () => void): Socket;
// export function connect(path: string, connectionListener?: () => void): Socket;
// export function createConnection(options: NetConnectOpts, connectionListener?: () => void): Socket;
// export function createConnection(port: number, host?: string, connectionListener?: () => void): Socket;
// export function createConnection(path: string, connectionListener?: () => void): Socket;
// export function isIP(input: string): number;
export function isIPv4(input: string): boolean {
  return true
}
export function isIPv6(input: string): boolean {
  return false
}
