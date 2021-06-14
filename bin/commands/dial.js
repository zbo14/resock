const readline = require('readline')
const { dial } = require('../../lib')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const question = prompt => new Promise(resolve => {
  rl.question(prompt, resolve)
})

module.exports = async () => {
  const secure = (process.env.secure || '').trim().toLowerCase() === 'true'
  const [localPort, remoteAddress, remotePort = localPort] = process.argv.slice(3)
  const sock = await dial(+localPort, +remotePort, remoteAddress, { secure })

  console.log('Established connection!')
  console.log('You can now send messages to peer')

  sock
    .setEncoding('utf8')
    .on('close', () => {
      console.warn('Socket closed')
      process.exit()
    })
    .on('data', chunk => console.log('Message from peer:', chunk))
    .on('error', console.error)

  while (true) {
    const msg = (await question('')).trim()
    msg && sock.write(msg)
  }
}
