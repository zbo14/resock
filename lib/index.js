const common = require('./common')
const Socket = require('./socket')

const DEFAULT_DIAL_TIMEOUT = 10e3

const accept = async (localPort, remotePort, remoteAddress) => {
  const server = await listen(localPort)

  const sock = await new Promise((resolve, reject) => {
    server
      .on('connection', sock => {
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
 * Binds socket to local port and connects to remote server.
 *
 * @param  {Number} localPort
 * @param  {Number} remotePort
 * @param  {String} remoteAddress
 *
 * @return {Promise<net.Socket>}
 */
const connect = (localPort, remotePort, remoteAddress) => {
  const sock = new Socket(localPort)

  return sock.connect(remotePort, remoteAddress)
}

/**
 * Binds sockets to local port and establishes connection to remote peer.
 *
 * @param  {Number} localPort
 * @param  {Number} remotePort
 * @param  {String} remoteAddress
 * @param  {Object} [options]
 * @param  {Number} [options.timeout = 10e3]
 *
 * @return {Promise<net.Socket>}
 */
const dial = async (localPort, remotePort, remoteAddress, {
  timeout = DEFAULT_DIAL_TIMEOUT
} = {}) => {
  if (!common.isWholeNumber(timeout)) {
    throw new Error('options.timeout must be a whole number')
  }

  timeout = timeout || DEFAULT_DIAL_TIMEOUT

  const sock = await Promise.race([
    accept(localPort, remotePort, remoteAddress),
    connect(localPort, remotePort, remoteAddress),

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
 * @return {Promise<net.Server>}
 */
const listen = localPort => {
  const sock = new Socket(localPort)

  return sock.listen()
}

module.exports = {
  connect,
  dial,
  listen,
  Socket
}
