const DummyOracle = artifacts.require('./DummyOracle')
const StablePriceOracle = artifacts.require('./StablePriceOracle')

const { expect } = require('chai')

const price1LetterPerSeconds = 0
const price2LetterPerSeconds = 5
const price3LetterPerSeconds = 4
const price4LetterPerSeconds = 3
const price5LetterPerSeconds = 2
const price6LetterPerSeconds = 1

contract('StablePriceOracle', function (accounts) {
  let priceOracle

  before(async () => {
    // Dummy oracle with 1 WBT == 10 USD
    var dummyOracle = await DummyOracle.new(1000000000n)
    priceOracle = await StablePriceOracle.new(dummyOracle.address, [
      price1LetterPerSeconds,
      price2LetterPerSeconds,
      price3LetterPerSeconds,
      price4LetterPerSeconds,
      price5LetterPerSeconds,
      price6LetterPerSeconds,
    ])
  })

  it('should return correct prices', async () => {
    expect(parseInt((await priceOracle.price('foo', 0, 3600)).base)).to.equal(
      1440,
    )
    expect(parseInt((await priceOracle.price('quux', 0, 3600)).base)).to.equal(
      1080,
    )
    expect(parseInt((await priceOracle.price('fubar', 0, 3600)).base)).to.equal(
      720,
    )
    expect(
      parseInt((await priceOracle.price('foobie', 0, 3600)).base),
    ).to.equal(360)
  })

  it('should work with larger values', async () => {
    const dummyOracle2 = await DummyOracle.new(1000000000n)
    const priceOracle2 = await StablePriceOracle.new(dummyOracle2.address, [
      price1LetterPerSeconds,
      price2LetterPerSeconds,
      1000000000000000000n, // 1 USD per second!
      price4LetterPerSeconds,
      price5LetterPerSeconds,
      price6LetterPerSeconds,
    ])
    expect((await priceOracle2.price('foo', 0, 86400))[0].toString()).to.equal(
      '8640000000000000000000',
    )
  })
})
