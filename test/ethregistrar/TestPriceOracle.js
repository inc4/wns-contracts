const { expect } = require('chai')
const { ethers } = require('hardhat')
const {
  contracts: { deploy },
} = require('../test-utils')

describe('PriceOracle', () => {
  let priceOracle
  let owner
  let operator
  let otherAccount

  beforeEach(async () => {
    ;[owner, operator, otherAccount] = await ethers.getSigners()
    priceOracle = await deploy('PriceOracle', 1000, operator.address)
  })

  describe('Deployment', () => {
    it('Should set the right initial price', async () => {
      expect(await priceOracle.latestAnswer()).to.equal(1000)
    })

    it('Should set the right operator', async () => {
      await expect(priceOracle.connect(operator).setUSDPrice(2000)).to.not.be
        .reverted

      expect(await priceOracle.latestAnswer()).to.equal(2000)

      await expect(
        priceOracle.connect(otherAccount).setUSDPrice(3000),
      ).to.be.revertedWith('revert')

      expect(await priceOracle.latestAnswer()).to.equal(2000)
    })

    it('Should set the right owner', async () => {
      expect(await priceOracle.owner()).to.equal(owner.address)
    })
  })

  describe('Transactions', () => {
    it('Should allow the operator to set the USD price', async () => {
      await priceOracle.connect(operator).setUSDPrice(2000)
      expect(await priceOracle.latestAnswer()).to.equal(2000)
    })

    it('Should not allow a non-operator to set the USD price', async () => {
      await expect(
        priceOracle.connect(otherAccount).setUSDPrice(2000),
      ).to.be.revertedWith('revert')
    })

    it('Should allow the owner to change the operator', async () => {
      await priceOracle.connect(owner).setNewOperator(otherAccount.address)
      await expect(priceOracle.connect(otherAccount).setUSDPrice(2000)).to.not
        .be.reverted

      expect(await priceOracle.latestAnswer()).to.equal(2000)

      await expect(
        priceOracle.connect(operator).setUSDPrice(3000),
      ).to.be.revertedWith('revert')

      expect(await priceOracle.latestAnswer()).to.equal(2000)
    })

    it('Should not allow a non-owner to change the operator', async () => {
      await expect(
        priceOracle.connect(otherAccount).setNewOperator(otherAccount.address),
      ).to.be.revertedWith('revert')
    })
  })
})
