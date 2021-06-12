#!/usr/bin/env node

'use strict'

const commands = require('./commands')

const main = async () => {
  const cmd = (process.argv[2] || '').trim().toLowerCase()

  if (!cmd) {
    throw new Error('Please specify command')
  }

  switch (cmd) {
    case 'dial':
      await commands[cmd]()
      return

    default:
      throw new Error('Unrecognized command: ' + cmd)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
