const isPositiveInteger = x => Number.isInteger(x) && x > 0
const isWholeNumber = x => Number.isInteger(x) && x >= 0

module.exports = {
  isPositiveInteger,
  isWholeNumber
}
