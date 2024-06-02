const { BigNumber } = require('bignumber.js')

function calculateRentPricePerSecondInAttoUSD(amountInUSD) {
  const amountInUSDBigNumber = BigNumber(amountInUSD)
  const secondsInYear = BigNumber(365 * 24 * 60 * 60)

  const attoUSD = amountInUSDBigNumber.multipliedBy(1e18)
  const rentPricePerSecond = attoUSD.dividedBy(secondsInYear)

  return rentPricePerSecond.toFixed(0).toString()
}

module.exports = {
  calculateRentPricePerSecondInAttoUSD,
}
