const addon = require('bindings')('resock')
const EventEmitter = require('events')
const net = require('net')
const common = require('./common')

const DEFAULT_CONNECT_TIMEOUT = 10e3
const DEFAULT_RETRIES = 3
const DEFAULT_RETRY_DELAY = 500

/**
 * Wrapper class around net.Socket that allows port reuse.
 *
 * @extends EventEmitter
 */
class Socket extends EventEmitter {
  /**
   * @param  {Number} localPort
   */
  constructor (localPort) {
    if (!common.isPositiveInteger(localPort)) {
      throw new Error('localPort must be a positive integer')
    }

    super()

    const fd = this.fd = addon.bindSocket(localPort)
    this.localPort = localPort
    this.sock = new net.Socket({ fd, readable: true, writable: true })

    this.sock
      .on('close', this.emit.bind(this, 'close'))
      .on('connect', this.emit.bind(this, 'connect'))
      .on('data', this.emit.bind(this, 'data'))
      .on('error', err => {
        err.code === 'ENOTCONN' || this.emit('error', err)
      })
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
   * @param  {Number} remotePort
   * @param  {String} remoteAddress
   * @param  {Object} [options]
   * @param  {Number} [options.retries = 3]
   * @param  {Number} [options.retryDelay = 500]
   * @param  {Number} [options.timeout = 10e3]
   *
   * @return {Promise} resolves net.Socket
   */
  async connect (remotePort, remoteAddress, {
    retries = DEFAULT_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY,
    timeout = DEFAULT_CONNECT_TIMEOUT
  } = {}) {
    if (!common.isWholeNumber(retries)) {
      throw new Error('options.retries must be a whole number')
    }

    if (!common.isWholeNumber(retryDelay)) {
      throw new Error('options.retryDelay must be a whole number')
    }

    if (!common.isWholeNumber(timeout)) {
      throw new Error('options.timeout must be a whole number')
    }

    timeout = timeout || DEFAULT_CONNECT_TIMEOUT

    const promise1 = EventEmitter.once(this, 'connect')

    const promise2 = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Connect timeout')), timeout)
    })

    this.sock.connect(remotePort, remoteAddress)

    try {
      await Promise.race([promise1, promise2])
    } catch (err) {
      if (!retries) throw err

      --retries

      await this.connect(remotePort, remoteAddress, {
        retries,
        retryDelay,
        timeout
      })
    }

    return this.sock
  }

  /**
   * Start listening for incoming connections.
   *
   * @return {Promise} resolves net.Server
   */
  async listen () {
    const server = net.createServer()
    const promise = EventEmitter.once(server, 'listening')

    server.listen(this.sock)

    await promise

    return server
  }
}

module.exports = Socket
