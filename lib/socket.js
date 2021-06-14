const EventEmitter = require('events')
const net = require('net')
const tls = require('tls')
const util = require('util')
const pem = require('pem')
const addon = require('bindings')('resock')
const common = require('./common')

const DEFAULT_CONNECT_TIMEOUT = 10e3
const DEFAULT_RETRIES = 10
const DEFAULT_RETRY_DELAY = 1e3

const createCertificate = util.promisify(pem.createCertificate)

/**
 * Wrapper class around net.Socket / tls.TLSSocket that allows port reuse.
 */
class Socket {
  /**
   * @param  {Number} localPort
   */
  constructor (localPort) {
    if (!common.isPositiveInteger(localPort)) {
      throw new Error('localPort must be a positive integer')
    }

    const fd = this.fd = addon.bindSocket(localPort)
    this.localPort = localPort
    this.sock = new net.Socket({ fd, readable: true, writable: true })
  }

  /**
   * Returns another socket bound to the same local port.
   *
   * @return {Socket}
   */
  clone () {
    return new Socket(this.localPort)
  }

  /**
   * Destroys the underlying socket.
   */
  destroy () {
    this.sock.destroy()
  }

  /**
   * Connect to a remote server.
   *
   * @param  {Number}  remotePort
   * @param  {String}  remoteAddress
   * @param  {Object}  [options]
   * @param  {Number}  [options.retries = 3]
   * @param  {Number}  [options.retryDelay = 500]
   * @param  {Boolean} [options.secure = false]
   * @param  {Number}  [options.timeout = 10e3]
   *
   * @return {Promise<net.Socket|tls.TLSSocket>}
   */
  async connect (remotePort, remoteAddress, {
    retries = DEFAULT_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY,
    secure = false,
    timeout = DEFAULT_CONNECT_TIMEOUT
  } = {}) {
    if (!common.isWholeNumber(retries)) {
      throw new Error('options.retries must be a whole number')
    }

    if (!common.isWholeNumber(retryDelay)) {
      throw new Error('options.retryDelay must be a whole number')
    }

    if (typeof secure !== 'boolean') {
      throw new Error('Expected options.secure to be a boolean')
    }

    if (!common.isWholeNumber(timeout)) {
      throw new Error('options.timeout must be a whole number')
    }

    timeout = timeout || DEFAULT_CONNECT_TIMEOUT

    const promise1 = new Promise((resolve, reject) => {
      this.sock.on('error', err => {
        err.code === 'ENOTCONN' || reject(err)
      })

      if (secure) {
        this.sock = tls.connect({ socket: this.sock })
      } else {
        this.sock.connect(remotePort, remoteAddress)
      }

      this.sock.once(secure ? 'secureConnect' : 'connect', resolve)
    })

    const promise2 = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Connect timeout')), timeout)
    })

    try {
      await Promise.race([promise1, promise2])
    } catch (err) {
      if (!retries) throw err

      --retries

      await this.connect(remotePort, remoteAddress, {
        retries,
        retryDelay,
        secure,
        timeout
      })
    }

    return this.sock
  }

  /**
   * Start listening for incoming connections.
   *
   * @param {Object}  [options = {}]
   * @param {Boolean} [options.secure = false]
   *
   * @return {Promise<net.Server|tls.Server>}
   */
  async listen ({ secure = false } = {}) {
    if (typeof secure !== 'boolean') {
      throw new Error('Expected options.secure to be a boolean')
    }

    let server

    if (secure) {
      const { certificate: cert, serviceKey: key } = await createCertificate({
        keyBitsize: 3072,
        selfSigned: true
      })

      server = tls.createServer({ cert, key })
    } else {
      server = net.createServer()
    }

    const promise = EventEmitter.once(server, 'listening')

    server.listen(this.sock)

    await promise

    return server
  }
}

module.exports = Socket
