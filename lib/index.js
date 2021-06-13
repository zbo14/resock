const EventEmitter = require('events')
const tls = require('tls')
const util = require('util')
const pem = require('pem')
const common = require('./common')
const Socket = require('./socket')

const DEFAULT_DIAL_TIMEOUT = 10e3

const createCertificate = util.promisify(pem.createCertificate)

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
 * Creates socket bound to local port and connects to remote server.
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
 * Creates socket bound to local port and establishes connection to remote peer.
 * Note: remote peer must also dial us for connection to be established.
 *
 * @param  {Number}  localPort
 * @param  {Number}  remotePort
 * @param  {String}  remoteAddress
 * @param  {Object}  [options]
 * @param  {Number}  [options.retries]
 * @param  {Number}  [options.retryDelay]
 * @param  {Boolean} [options.secure = false]
 * @param  {Number}  [options.timeout = 10e3]
 *
 * @return {Promise<Object>}
 */
const dial = async (localPort, remotePort, remoteAddress, {
  retries,
  retryDelay,
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

  let { sock, isServer } = await Promise.race([
    accept(localPort, remotePort, remoteAddress)
      .then(sock => ({ sock, isServer: true })),

    connect(localPort, remotePort, remoteAddress, { retries, retryDelay })
      .then(sock => ({ sock, isServer: false })),

    new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Dial timeout')), timeout)
    })
  ])

  if (!secure) return { sock, isServer, secure }

  let cert = null
  let key = null

  if (isServer) {
    const result = await createCertificate({
      keyBitsize: 3072,
      selfSigned: true
    })

    cert = result.certificate
    key = result.serviceKey
  }

  sock = new tls.TLSSocket(sock, {
    cert,
    key,
    isServer,
    rejectUnauthorized: false
  })

  await EventEmitter.once(sock, 'secureConnect')

  return { sock, cert, key, isServer, secure }
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
