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

const sendTheirContact = sock => {
  const contact = sock.address().family === 'IPv6'
    ? `[${sock.remoteAddress}]:${sock.remotePort}`
    : sock.remoteAddress + ':' + sock.remotePort

  const msg = Buffer.concat([
    Buffer.from([contact.byteLength]),
    Buffer.from(contact)
  ])

  sock.write(msg)

  return contact
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

  const [serverSock, clientSock] = await Promise.race([
    Promise.all([
      accept(localPort, remotePort, remoteAddress),
      connect(localPort, remotePort, remoteAddress, { retries, retryDelay })
    ]),

    new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Dial timeout')), timeout)
    })
  ])

  const promise = receiveMyContact(clientSock)
  const theirContact = sendTheirContact(serverSock)
  const myContact = await promise
  const isServer = myContact > theirContact

  console.log({ isServer, myContact, theirContact })

  let sock = isServer ? serverSock : clientSock

  isServer && clientSock.end()

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
