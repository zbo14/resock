const common = require('./common')
const Socket = require('./socket')

const DEFAULT_DIAL_TIMEOUT = 10e3

const accept = async (localPort, remotePort, remoteAddress, options) => {
  const event = options.secure ? 'secureConnection' : 'connection'
  const server = await listen(localPort, options)

  const sock = await new Promise((resolve, reject) => {
    server
      .on(event, sock => {
        sock.remoteAddress === remoteAddress &&
        sock.remotePort === remotePort &&
        resolve(sock)
      })
      .once('error', reject)
  })

  server.close()

  return sock
}

/**
 * Creates socket bound to local port and connects to remote server.
 *
 * @param  {Number} localPort
 * @param  {Number} remotePort
 * @param  {String} remoteAddress
 * @param  {Object} [options]
 *
 * @return {Promise<net.Socket>}
 */
const connect = (localPort, remotePort, remoteAddress, options) => {
  const sock = new Socket(localPort)

  return sock.connect(remotePort, remoteAddress, options)
}

/**
 * Creates socket bound to local port and establishes connection to remote peer.
 * Note: remote peer must also dial for connection to be established.
 *
 * @param  {Number}  localPort
 * @param  {Number}  remotePort
 * @param  {String}  remoteAddress
 * @param  {Object}  [options]
 * @param  {Boolean} [options.secure = false]
 * @param  {Number}  [options.timeout = 10e3]
 *
 * @return {Promise<Object>}
 */
const dial = async (localPort, remotePort, remoteAddress, {
  secure = false,
  timeout = DEFAULT_DIAL_TIMEOUT
} = {}) => {
  if (typeof secure !== 'boolean') {
    throw new Error('options.secure must be a boolean')
  }

  if (!common.isWholeNumber(timeout)) {
    throw new Error('options.timeout must be a whole number')
  }

  timeout = timeout || DEFAULT_DIAL_TIMEOUT

  const sock = await Promise.race([
    accept(localPort, remotePort, remoteAddress, { secure }),
    connect(localPort, remotePort, remoteAddress, { secure }),

    new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Dial timeout')), timeout)
    })
  ])

  return sock
}

/**
 * Binds socket to local port and listens for connections.
 *
 * @param  {Number} localPort
 *
 * @return {Promise<net.Server|tls.Server>}
 */
const listen = (localPort, options) => {
  const sock = new Socket(localPort)

  return sock.listen(options)
}

module.exports = {
  connect,
  dial,
  listen,
  Socket
}
