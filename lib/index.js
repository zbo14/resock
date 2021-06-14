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
 * @param  {Object} [options]
 *
 * @return {Promise<net.Socket>}
 */
const connect = (localPort, remotePort, remoteAddress, options) => {
  const sock = new Socket(localPort)

  return sock.connect(remotePort, remoteAddress, options)
}

const sendTheirContact = sock => {
  const contactString = sock.address().family === 'IPv6'
    ? `[${sock.remoteAddress}]:${sock.remotePort}`
    : sock.remoteAddress + ':' + sock.remotePort

  const contact = Buffer.from(contactString)
  const prefix = Buffer.from([contact.byteLength])
  const msg = Buffer.concat([prefix, contact])

  sock.write(msg)

  return contactString
}

const receiveMyContact = sock => {
  let data = Buffer.alloc(0)
  let length = 0

  return new Promise((resolve, reject) => {
    const handleData = chunk => {
      data = Buffer.concat([data, chunk])

      if (!length && data.byteLength >= 1) {
        length = data[0]
      }

      if (length && data.byteLength - 1 >= length) {
        const contact = data.slice(1, 1 + length).toString()
        resolve(contact)
        sock.removeListener('data', handleData)
      }
    }

    sock
      .on('data', handleData)
      .once('error', reject)
  })
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
 * @return {Promise<net.Socket|tls.TLSSocket>}
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
    accept(localPort, remotePort, remoteAddress),
    connect(localPort, remotePort, remoteAddress),

    new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Dial timeout')), timeout)
    })
  ])

  if (!secure) return sock

  const promise = receiveMyContact(sock)
  const theirContact = sendTheirContact(sock)
  const myContact = await promise
  const isServer = myContact > theirContact

  let tlsSock

  if (isServer) {
    const { certificate: cert, serviceKey: key } = await createCertificate({
      keyBitsize: 3072,
      selfSigned: true
    })

    tlsSock = new tls.TLSSocket(sock, { cert, key, isServer })
  } else {
    tlsSock = new tls.TLSSocket(sock)
    setTimeout(() => tlsSock.write(''), 3e3)
  }

  return tlsSock
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
