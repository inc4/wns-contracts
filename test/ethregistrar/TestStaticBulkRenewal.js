const ENS = artifacts.require('./registry/ENSRegistry')
const PublicResolver = artifacts.require('./resolvers/PublicResolver')
const BaseRegistrar = artifacts.require('./BaseRegistrarImplementation')
const ETHRegistrarController = artifacts.require('./ETHRegistrarController')
const DummyOracle = artifacts.require('./DummyOracle')
const StablePriceOracle = artifacts.require('./StablePriceOracle')
const StaticBulkRenewal = artifacts.require('./StaticBulkRenewal')
const NameWrapper = artifacts.require('./wrapper/NameWrapper.sol')
const { deploy } = require('../test-utils/contracts')
const { EMPTY_BYTES32: EMPTY_BYTES } = require('../test-utils/constants')

const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3
const toBN = require('web3-utils').toBN
const { exceptions } = require('../test-utils')
const { ethers } = require('hardhat')

const ONE_DAY_IN_SEC = 24 * 60 * 60
const WBT_TLD = 'wbt'
const ETH_LABEL = sha3(WBT_TLD)
const ETH_NAMEHASH = namehash.hash(WBT_TLD)
const price1LetterPerSeconds = 0
const price2LetterPerSeconds = 5
const price3LetterPerSeconds = 4
const price4LetterPerSeconds = 3
const price5LetterPerSeconds = 2
const price6LetterPerSeconds = 1

contract('StaticBulkRenewal', function (accounts) {
  let ens
  let resolver
  let baseRegistrar
  let controller
  let priceOracle
  let staticBulkRenewal
  let nameWrapper
  let reverseRegistrar

  const ownerAccount = accounts[0] // Account that owns the registrar
  const registrantAccount = accounts[1] // Account that owns test names
  const EMPTY_ADDRESS = ethers.constants.AddressZero

  before(async () => {
    // Create a registry
    ens = await ENS.new()

    // Create a base registrar
    baseRegistrar = await BaseRegistrar.new(
      ens.address,
      namehash.hash(WBT_TLD),
      {
        from: ownerAccount,
      },
    )

    // Setup reverseRegistrar
    reverseRegistrar = await deploy('ReverseRegistrar', ens.address)

    await ens.setSubnodeOwner(EMPTY_BYTES, sha3('reverse'), accounts[0])
    await ens.setSubnodeOwner(
      namehash.hash('reverse'),
      sha3('addr'),
      reverseRegistrar.address,
    )

    // Create a name wrapper
    nameWrapper = await NameWrapper.new(
      ens.address,
      baseRegistrar.address,
      ownerAccount,
    )

    // Create a public resolver
    resolver = await PublicResolver.new(
      ens.address,
      nameWrapper.address,
      EMPTY_ADDRESS,
      EMPTY_ADDRESS,
    )

    // Set up a dummy price oracle and a controller
    const dummyOracle = await DummyOracle.new(toBN(100000000))
    priceOracle = await StablePriceOracle.new(dummyOracle.address, [
      price1LetterPerSeconds,
      price2LetterPerSeconds,
      price3LetterPerSeconds,
      price4LetterPerSeconds,
      price5LetterPerSeconds,
      price6LetterPerSeconds,
    ])
    controller = await ETHRegistrarController.new(
      baseRegistrar.address,
      priceOracle.address,
      600,
      86400,
      EMPTY_ADDRESS,
      nameWrapper.address,
      ens.address,
      process.env.USDC_E_CONTRACT_ADDRESS,
      +process.env.MIN_ALLOWED_DOMAIN_LENGTH,
      { from: ownerAccount },
    )
    await baseRegistrar.addController(controller.address, {
      from: ownerAccount,
    })
    await baseRegistrar.addController(ownerAccount, { from: ownerAccount })
    await baseRegistrar.addController(nameWrapper.address, {
      from: ownerAccount,
    })
    await nameWrapper.setController(controller.address, true, {
      from: ownerAccount,
    })
    // Create the bulk registration contract
    staticBulkRenewal = await StaticBulkRenewal.new(controller.address)

    // Configure a resolver for .wbt and register the controller interface
    // then transfer the .wbt node to the base registrar.
    await ens.setSubnodeRecord(
      '0x0',
      ETH_LABEL,
      ownerAccount,
      resolver.address,
      0,
    )
    await ens.setOwner(ETH_NAMEHASH, baseRegistrar.address)

    // Register some names
    for (const name of ['test1', 'test2', 'test3']) {
      await baseRegistrar.register(sha3(name), registrantAccount, 31536000)
    }
  })

  it('should return the cost of a bulk renewal', async () => {
    const expectedPrice = price5LetterPerSeconds * ONE_DAY_IN_SEC * 2
    assert.equal(
      await staticBulkRenewal.rentPrice(['test1', 'test2'], ONE_DAY_IN_SEC),
      expectedPrice,
    )
  })

  it('should raise an error trying to renew a nonexistent name', async () => {
    await exceptions.expectFailure(
      staticBulkRenewal.renewAll(['foobar'], ONE_DAY_IN_SEC),
    )
  })

  it('should permit bulk renewal of names', async () => {
    const expectedPrice = price5LetterPerSeconds * ONE_DAY_IN_SEC * 2
    const oldExpiry = await baseRegistrar.nameExpires(sha3('test2'))
    const tx = await staticBulkRenewal.renewAll(
      ['test1', 'test2'],
      ONE_DAY_IN_SEC,
      { value: expectedPrice },
    )
    assert.equal(tx.receipt.status, true)
    const newExpiry = await baseRegistrar.nameExpires(sha3('test2'))
    assert.equal(newExpiry - oldExpiry, ONE_DAY_IN_SEC)
    // Check any excess funds are returned
    assert.equal(await web3.eth.getBalance(staticBulkRenewal.address), 0)
  })
})
