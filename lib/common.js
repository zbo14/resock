const isPositiveInteger = x => Number.isInteger(x) && x > 0
const isWholeNumber = x => Number.isInteger(x) && x >= 0
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = {
  isPositiveInteger,
  isWholeNumber,
  sleep
}
