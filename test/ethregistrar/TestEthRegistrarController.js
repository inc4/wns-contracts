const {
  evm,
  reverse: { getReverseNode },
  contracts: { deploy },
  ens: { FUSES },
  prices: { calculateRentPricePerSecondInAttoUSD },
} = require('../test-utils')

const { CANNOT_UNWRAP, PARENT_CANNOT_CONTROL, IS_DOT_ETH } = FUSES

const { expect } = require('chai')

const { ethers } = require('hardhat')
const provider = ethers.provider
const { namehash } = require('../test-utils/ens')
const sha3 = require('web3-utils').sha3
const {
  EMPTY_BYTES32: EMPTY_BYTES,
  EMPTY_ADDRESS: ZERO_ADDRESS,
} = require('../test-utils/constants')

const WBT_TLD = 'wbt'
const ONE_DAY_IN_SEC = 24 * 60 * 60
const GRACE_PERIOD = 30
const REGISTRATION_TIME = 28 * ONE_DAY_IN_SEC
const BUFFERED_REGISTRATION_COST = REGISTRATION_TIME + 3 * ONE_DAY_IN_SEC
const GRACE_PERIOD_IN_SEC = GRACE_PERIOD * ONE_DAY_IN_SEC
const NULL_ADDRESS = ZERO_ADDRESS
const price1LetterPerSeconds = 0
const price2LetterPerSeconds = 5
const price3LetterPerSeconds = 4
const price4LetterPerSeconds = 3
const price5LetterPerSeconds = 2
const price6LetterPerSeconds = 1

contract('ETHRegistrarController', function () {
  let ens
  let dummyUSDCeContract
  let resolver
  let resolver2 // resolver signed by accounts[1]
  let baseRegistrar
  let controller
  let priceOracle
  let reverseRegistrar
  let nameWrapper
  let callData

  const secret =
    '0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF'
  let ownerAccount // Account that owns the registrar
  let registrantAccount // Account that owns test names
  let accounts = []

  async function registerName(
    name,
    txOptions = { value: BUFFERED_REGISTRATION_COST },
  ) {
    var commitment = await controller.makeCommitment(
      name,
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      NULL_ADDRESS,
      [],
      false,
      0,
    )
    var tx = await controller.commit(commitment)

    expect(await controller.commitments(commitment)).to.equal(
      (await provider.getBlock(tx.blockNumber)).timestamp,
    )

    await evm.advanceTime((await controller.minCommitmentAge()).toNumber())

    var tx = await controller.register(
      name,
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      NULL_ADDRESS,
      [],
      false,
      0,
      txOptions,
    )

    return tx
  }

  async function registerNameUseUSDCe(name, amountUSDCe) {
    await (
      await dummyUSDCeContract.approve(controller.address, amountUSDCe)
    ).wait()
    await dummyUSDCeContract.allowance(registrantAccount, controller.address)

    var commitment = await controller.makeCommitment(
      name,
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      NULL_ADDRESS,
      [],
      false,
      0,
    )
    var tx = await controller.commit(commitment)

    expect(await controller.commitments(commitment)).to.equal(
      (await provider.getBlock(tx.blockNumber)).timestamp,
    )

    await evm.advanceTime((await controller.minCommitmentAge()).toNumber())

    var tx = await controller.registryByUSDCe(
      name,
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      NULL_ADDRESS,
      [],
      false,
      0,
      amountUSDCe,
    )

    return tx
  }

  beforeEach(async () => {
    result = await ethers.provider.send('evm_snapshot')
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [result])
  })

  const checkLabels = {
    testing: true,
    longname12345678: true,
    sixsix: true,
    five5: true,
    four: true,
    iii: true,
    ii: true,
    i: false,
    '': false,

    // { ni } { hao } { ma } (chinese; simplified)
    你好吗: true,

    // { ta } { ko } (japanese; hiragana)
    たこ: true,

    // { poop } { poop } { poop } (emoji)
    '\ud83d\udca9\ud83d\udca9\ud83d\udca9': true,

    // { poop } { poop } (emoji)
    '\ud83d\udca9\ud83d\udca9': true,
  }

  describe('Operations using WBT', () => {
    before(async () => {
      signers = await ethers.getSigners()
      ownerAccount = await signers[0].getAddress()
      registrantAccount = await signers[1].getAddress()
      accounts = [ownerAccount, registrantAccount, signers[2].getAddress()]

      ens = await deploy('ENSRegistry')

      baseRegistrar = await deploy(
        'BaseRegistrarImplementation',
        ens.address,
        namehash(WBT_TLD),
      )

      reverseRegistrar = await deploy('ReverseRegistrar', ens.address)

      await ens.setSubnodeOwner(EMPTY_BYTES, sha3('reverse'), accounts[0])
      await ens.setSubnodeOwner(
        namehash('reverse'),
        sha3('addr'),
        reverseRegistrar.address,
      )

      nameWrapper = await deploy(
        'NameWrapper',
        ens.address,
        baseRegistrar.address,
        ownerAccount,
      )

      await ens.setSubnodeOwner(
        EMPTY_BYTES,
        sha3(WBT_TLD),
        baseRegistrar.address,
      )

      const dummyOracle = await deploy('DummyOracle', '100000000') // 1,000,000 USDC.e
      dummyUSDCeContract = await deploy(
        'DummyUSDCe',
        ethers.utils.parseUnits('1000000', 6),
      )
      priceOracle = await deploy('StablePriceOracle', dummyOracle.address, [
        price1LetterPerSeconds,
        price2LetterPerSeconds,
        price3LetterPerSeconds,
        price4LetterPerSeconds,
        price5LetterPerSeconds,
        price6LetterPerSeconds,
      ])

      controller = await deploy(
        'ETHRegistrarController',
        baseRegistrar.address,
        priceOracle.address,
        600,
        86400,
        reverseRegistrar.address,
        nameWrapper.address,
        ens.address,
        dummyUSDCeContract.address,
        +process.env.MIN_ALLOWED_DOMAIN_LENGTH,
      )

      await nameWrapper.setController(controller.address, true)
      await baseRegistrar.addController(nameWrapper.address)
      await reverseRegistrar.setController(controller.address, true)

      resolver = await deploy(
        'PublicResolver',
        ens.address,
        nameWrapper.address,
        controller.address,
        reverseRegistrar.address,
      )

      callData = [
        resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
          namehash(`newconfigname.${WBT_TLD}`),
          registrantAccount,
        ]),
        resolver.interface.encodeFunctionData('setText', [
          namehash(`newconfigname.${WBT_TLD}`),
          'url',
          'ethereum.com',
        ]),
      ]

      resolver2 = await resolver.connect(signers[1])
    })

    it('should report label validity', async () => {
      for (const label in checkLabels) {
        expect(await controller.valid(label)).to.equal(
          checkLabels[label],
          label,
        )
      }
    })

    it('should report unused names as available', async () => {
      expect(await controller.available(sha3('available'))).to.equal(true)
    })

    it('should permit new registrations', async () => {
      const name = 'newname'
      const balanceBefore = await web3.eth.getBalance(controller.address)
      const tx = await registerName(name)
      const block = await provider.getBlock(tx.blockNumber)
      await expect(tx)
        .to.emit(controller, 'NameRegistered')
        .withArgs(
          name,
          sha3(name),
          registrantAccount,
          REGISTRATION_TIME,
          0,
          block.timestamp + REGISTRATION_TIME,
        )

      expect(
        (await web3.eth.getBalance(controller.address)) - balanceBefore,
      ).to.equal(REGISTRATION_TIME)
    })

    it('should revert when not enough ether is transferred', async () => {
      await expect(registerName('newname', { value: 0 })).to.be.revertedWith(
        'InsufficientValue()',
      )
    })

    it('should report registered names as unavailable', async () => {
      const name = 'newname'
      await registerName(name)

      expect(await controller.available(name)).to.equal(false)
    })

    it('should permit new registrations with resolver and records', async () => {
      var commitment = await controller.makeCommitment(
        'newconfigname',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        callData,
        false,
        0,
      )
      var tx = await controller.commit(commitment)

      expect(await controller.commitments(commitment)).to.equal(
        (await web3.eth.getBlock(tx.blockNumber)).timestamp,
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      var balanceBefore = await web3.eth.getBalance(controller.address)
      var tx = await controller.register(
        'newconfigname',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        callData,
        false,
        0,
        { value: BUFFERED_REGISTRATION_COST },
      )

      const block = await provider.getBlock(tx.blockNumber)

      await expect(tx)
        .to.emit(controller, 'NameRegistered')
        .withArgs(
          'newconfigname',
          sha3('newconfigname'),
          registrantAccount,
          REGISTRATION_TIME,
          0,
          block.timestamp + REGISTRATION_TIME,
        )

      expect(
        (await web3.eth.getBalance(controller.address)) - balanceBefore,
      ).to.equal(REGISTRATION_TIME)

      var nodeHash = namehash(`newconfigname.${WBT_TLD}`)

      expect(await ens.resolver(nodeHash)).to.equal(resolver.address)
      expect(await ens.owner(nodeHash)).to.equal(nameWrapper.address)
      expect(await baseRegistrar.ownerOf(sha3('newconfigname'))).to.equal(
        nameWrapper.address,
      )
      expect(await resolver['addr(bytes32)'](nodeHash)).to.equal(
        registrantAccount,
      )
      expect(await resolver['text'](nodeHash, 'url')).to.equal('ethereum.com')
      expect(await nameWrapper.ownerOf(nodeHash)).to.equal(registrantAccount)
    })

    it('should not permit new registrations with 0 resolver', async () => {
      await expect(
        controller.makeCommitment(
          'newconfigname',
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          NULL_ADDRESS,
          callData,
          false,
          0,
        ),
      ).to.be.revertedWith('ResolverRequiredWhenDataSupplied()')
    })

    it('should not permit new registrations with EoA resolver', async () => {
      const commitment = await controller.makeCommitment(
        'newconfigname',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        registrantAccount,
        callData,
        false,
        0,
      )

      const tx = await controller.commit(commitment)
      expect(await controller.commitments(commitment)).to.equal(
        (await web3.eth.getBlock(tx.blockNumber)).timestamp,
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await expect(
        controller.register(
          'newconfigname',
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          registrantAccount,
          callData,
          false,
          0,
          { value: BUFFERED_REGISTRATION_COST },
        ),
      ).to.be.reverted
    })

    it('should not permit new registrations with an incompatible contract', async () => {
      const commitment = await controller.makeCommitment(
        'newconfigname',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        controller.address,
        callData,
        false,
        0,
      )

      const tx = await controller.commit(commitment)
      expect(await controller.commitments(commitment)).to.equal(
        (await web3.eth.getBlock(tx.blockNumber)).timestamp,
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await expect(
        controller.register(
          'newconfigname',
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          controller.address,
          callData,
          false,
          0,
          { value: BUFFERED_REGISTRATION_COST },
        ),
      ).to.be.revertedWith(
        "Transaction reverted: function selector was not recognized and there's no fallback function",
      )
    })

    it('should not permit new registrations with records updating a different name', async () => {
      const commitment = await controller.makeCommitment(
        'awesome',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            namehash(`othername.${WBT_TLD}`),
            registrantAccount,
          ]),
        ],
        false,
        0,
      )
      const tx = await controller.commit(commitment)
      expect(await controller.commitments(commitment)).to.equal(
        (await web3.eth.getBlock(tx.blockNumber)).timestamp,
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())

      await expect(
        controller.register(
          'awesome',
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          resolver.address,
          [
            resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
              namehash(`othername.${WBT_TLD}`),
              registrantAccount,
            ]),
          ],
          false,
          0,
          { value: BUFFERED_REGISTRATION_COST },
        ),
      ).to.be.revertedWith(
        'multicall: All records must have a matching namehash',
      )
    })

    it('should not permit new registrations with any record updating a different name', async () => {
      const commitment = await controller.makeCommitment(
        'awesome',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            namehash(`awesome.${WBT_TLD}`),
            registrantAccount,
          ]),
          resolver.interface.encodeFunctionData(
            'setText(bytes32,string,string)',
            [namehash(`other.${WBT_TLD}`), 'url', 'ethereum.com'],
          ),
        ],
        false,
        0,
      )
      const tx = await controller.commit(commitment)
      expect(await controller.commitments(commitment)).to.equal(
        (await web3.eth.getBlock(tx.blockNumber)).timestamp,
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())

      await expect(
        controller.register(
          'awesome',
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          resolver.address,
          [
            resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
              namehash(`awesome.${WBT_TLD}`),
              registrantAccount,
            ]),
            resolver.interface.encodeFunctionData(
              'setText(bytes32,string,string)',
              [namehash(`other.${WBT_TLD}`), 'url', 'ethereum.com'],
            ),
          ],
          false,
          0,
          { value: BUFFERED_REGISTRATION_COST },
        ),
      ).to.be.revertedWith(
        'multicall: All records must have a matching namehash',
      )
    })

    it('should permit a registration with resolver but no records', async () => {
      const commitment = await controller.makeCommitment(
        'newconfigname2',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        false,
        0,
      )
      let tx = await controller.commit(commitment)
      expect(await controller.commitments(commitment)).to.equal(
        (await web3.eth.getBlock(tx.blockNumber)).timestamp,
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      const balanceBefore = await web3.eth.getBalance(controller.address)
      let tx2 = await controller.register(
        'newconfigname2',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        false,
        0,
        { value: BUFFERED_REGISTRATION_COST },
      )

      const block = await provider.getBlock(tx2.blockNumber)

      await expect(tx2)
        .to.emit(controller, 'NameRegistered')
        .withArgs(
          'newconfigname2',
          sha3('newconfigname2'),
          registrantAccount,
          REGISTRATION_TIME,
          0,
          block.timestamp + REGISTRATION_TIME,
        )

      const nodeHash = namehash(`newconfigname2.${WBT_TLD}`)
      expect(await ens.resolver(nodeHash)).to.equal(resolver.address)
      expect(await resolver['addr(bytes32)'](nodeHash)).to.equal(NULL_ADDRESS)
      expect(
        (await web3.eth.getBalance(controller.address)) - balanceBefore,
      ).to.equal(REGISTRATION_TIME)
    })

    it('should include the owner in the commitment', async () => {
      await controller.commit(
        await controller.makeCommitment(
          'newname2',
          accounts[2],
          REGISTRATION_TIME,
          secret,
          NULL_ADDRESS,
          [],
          false,
          0,
        ),
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await expect(
        controller.register(
          'newname2',
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          NULL_ADDRESS,
          [],
          false,
          0,
          {
            value: BUFFERED_REGISTRATION_COST,
          },
        ),
      ).to.be.reverted
    })

    it('should reject duplicate registrations', async () => {
      const label = 'newname'
      await registerName(label)
      await controller.commit(
        await controller.makeCommitment(
          label,
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          NULL_ADDRESS,
          [],
          false,
          0,
        ),
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await expect(
        controller.register(
          label,
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          NULL_ADDRESS,
          [],
          false,
          0,
          {
            value: BUFFERED_REGISTRATION_COST,
          },
        ),
      ).to.be.revertedWith(`NameNotAvailable("${label}")`)
    })

    it('should reject for expired commitments', async () => {
      const commitment = await controller.makeCommitment(
        'newname2',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        NULL_ADDRESS,
        [],
        false,
        0,
      )
      await controller.commit(commitment)

      await evm.advanceTime(
        (await controller.maxCommitmentAge()).toNumber() + 1,
      )
      await expect(
        controller.register(
          'newname2',
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          NULL_ADDRESS,
          [],
          false,
          0,
          {
            value: BUFFERED_REGISTRATION_COST,
          },
        ),
      ).to.be.revertedWith(`CommitmentTooOld("${commitment}")`)
    })

    it('should allow anyone to renew a name without changing fuse expiry', async () => {
      await registerName('newname')
      var nodeHash = namehash(`newname.${WBT_TLD}`)
      var fuseExpiry = (await nameWrapper.getData(nodeHash))[2]
      var expires = await baseRegistrar.nameExpires(sha3('newname'))
      var balanceBefore = await web3.eth.getBalance(controller.address)
      const duration = 86400
      const [price] = await controller.rentPrice(sha3('newname'), duration)
      await controller.renew('newname', duration, { value: price })
      var newExpires = await baseRegistrar.nameExpires(sha3('newname'))
      var newFuseExpiry = (await nameWrapper.getData(nodeHash))[2]
      expect(newExpires.toNumber() - expires.toNumber()).to.equal(duration)
      expect(newFuseExpiry.toNumber() - fuseExpiry.toNumber()).to.equal(86400)

      expect(
        (await web3.eth.getBalance(controller.address)) - balanceBefore,
      ).to.equal(86400)
    })

    it('should allow token owners to renew a name', async () => {
      await registerName('newname')
      var nodeHash = namehash(`newname.${WBT_TLD}`)
      const [, fuses, fuseExpiry] = await nameWrapper.getData(nodeHash)

      var expires = await baseRegistrar.nameExpires(sha3('newname'))
      var balanceBefore = await web3.eth.getBalance(controller.address)
      const duration = 86400
      const [price] = await controller.rentPrice(sha3('newname'), duration)
      await controller.renew('newname', duration, { value: price })
      var newExpires = await baseRegistrar.nameExpires(sha3('newname'))
      const [, newFuses, newFuseExpiry] = await nameWrapper.getData(nodeHash)
      expect(newExpires.toNumber() - expires.toNumber()).to.equal(duration)
      expect(newFuseExpiry.toNumber() - fuseExpiry.toNumber()).to.equal(
        duration,
      )
      expect(newFuses).to.equal(fuses)
      expect(
        (await web3.eth.getBalance(controller.address)) - balanceBefore,
      ).to.equal(86400)
    })

    it('non wrapped names can renew', async () => {
      const label = 'newname'
      const tokenId = sha3(label)
      const nodeHash = namehash(`${label}.${WBT_TLD}`)
      // this is to allow user to register without nameWrapped
      await baseRegistrar.addController(ownerAccount)
      await baseRegistrar.register(tokenId, ownerAccount, 84600)

      expect(await nameWrapper.ownerOf(nodeHash)).to.equal(ZERO_ADDRESS)
      expect(await baseRegistrar.ownerOf(tokenId)).to.equal(ownerAccount)

      var expires = await baseRegistrar.nameExpires(tokenId)
      const duration = 86400
      const [price] = await controller.rentPrice(tokenId, duration)
      await controller.renew(label, duration, { value: price })

      expect(await baseRegistrar.ownerOf(tokenId)).to.equal(ownerAccount)
      expect(await nameWrapper.ownerOf(nodeHash)).to.equal(ZERO_ADDRESS)
      var newExpires = await baseRegistrar.nameExpires(tokenId)
      expect(newExpires.toNumber() - expires.toNumber()).to.equal(duration)
    })

    it('should require sufficient value for a renewal', async () => {
      await expect(controller.renew('name', 86400)).to.be.revertedWith(
        'InsufficientValue()',
      )
    })

    it('should allow anyone to withdraw funds and transfer to the registrar owner', async () => {
      await controller.withdraw({ from: ownerAccount })

      expect(parseInt(await web3.eth.getBalance(controller.address))).to.equal(
        0,
      )
    })

    it('should set the reverse record of the account', async () => {
      const commitment = await controller.makeCommitment(
        'reverse',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        true,
        0,
      )
      await controller.commit(commitment)

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await controller.register(
        'reverse',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        true,
        0,
        { value: BUFFERED_REGISTRATION_COST },
      )

      expect(await resolver.name(getReverseNode(ownerAccount))).to.equal(
        `reverse.${WBT_TLD}`,
      )
    })

    it('should not set the reverse record of the account when set to false', async () => {
      const commitment = await controller.makeCommitment(
        'noreverse',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        false,
        0,
      )
      await controller.commit(commitment)

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await controller.register(
        'noreverse',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        false,
        0,
        { value: BUFFERED_REGISTRATION_COST },
      )

      expect(await resolver.name(getReverseNode(ownerAccount))).to.equal('')
    })

    it('should auto wrap the name and set the ERC721 owner to the wrapper', async () => {
      const label = 'wrapper'
      const name = label + `.${WBT_TLD}`
      const commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        true,
        0,
      )
      await controller.commit(commitment)

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await controller.register(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        true,
        0,
        { value: BUFFERED_REGISTRATION_COST },
      )

      expect(await nameWrapper.ownerOf(namehash(name))).to.equal(
        registrantAccount,
      )
      expect(await ens.owner(namehash(name))).to.equal(nameWrapper.address)
      expect(await baseRegistrar.ownerOf(sha3(label))).to.equal(
        nameWrapper.address,
      )
    })

    it('should auto wrap the name and allow fuses and expiry to be set', async () => {
      const label = 'fuses'
      const name = label + `.${WBT_TLD}`
      const commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        true,
        1,
      )
      await controller.commit(commitment)

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      const tx = await controller.register(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        true,
        1,
        { value: BUFFERED_REGISTRATION_COST * 2 },
      )

      const block = await provider.getBlock(tx.block)
      const [, fuses, expiry] = await nameWrapper.getData(namehash(name))

      expect(fuses).to.equal(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | IS_DOT_ETH)
      expect(expiry).to.equal(
        REGISTRATION_TIME + GRACE_PERIOD_IN_SEC + block.timestamp,
      )
    })

    it('approval should reduce gas for registration', async () => {
      const label = 'other'
      const name = label + `.${WBT_TLD}`
      const node = namehash(name)
      const commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            node,
            registrantAccount,
          ]),
        ],
        true,
        1,
      )

      await controller.commit(commitment)

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())

      const gasA = await controller.estimateGas.register(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            node,
            registrantAccount,
          ]),
        ],
        true,
        1,
        { value: BUFFERED_REGISTRATION_COST * 2 },
      )

      await resolver2.setApprovalForAll(controller.address, true)

      const gasB = await controller.estimateGas.register(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver2.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            node,
            registrantAccount,
          ]),
        ],
        true,
        1,
        { value: BUFFERED_REGISTRATION_COST * 2 },
      )

      const tx = await controller.register(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver2.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            node,
            registrantAccount,
          ]),
        ],
        true,
        1,
        { value: BUFFERED_REGISTRATION_COST * 2 },
      )

      expect(await nameWrapper.ownerOf(node)).to.equal(registrantAccount)
      expect(await ens.owner(namehash(name))).to.equal(nameWrapper.address)
      expect(await baseRegistrar.ownerOf(sha3(label))).to.equal(
        nameWrapper.address,
      )
      expect(await resolver2['addr(bytes32)'](node)).to.equal(registrantAccount)
    })

    it('should not permit new registrations with non resolver function calls', async () => {
      const label = 'newconfigname'
      const name = `${label}.${WBT_TLD}`
      const node = namehash(name)
      const secondTokenDuration = 788400000 // keep bogus NFT for 25 years;
      const callData = [
        baseRegistrar.interface.encodeFunctionData(
          'register(uint256,address,uint)',
          [node, registrantAccount, secondTokenDuration],
        ),
      ]
      var commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        baseRegistrar.address,
        callData,
        false,
        0,
      )
      var tx = await controller.commit(commitment)

      expect(await controller.commitments(commitment)).to.equal(
        (await web3.eth.getBlock(tx.blockNumber)).timestamp,
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await expect(
        controller.register(
          label,
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          baseRegistrar.address,
          callData,
          false,
          0,
          { value: BUFFERED_REGISTRATION_COST },
        ),
      ).to.be.revertedWith(
        "Transaction reverted: function selector was not recognized and there's no fallback function",
      )
    })
  })

  describe('Operation use USDC.e', () => {
    before(async () => {
      signers = await ethers.getSigners()
      ownerAccount = await signers[0].getAddress()
      registrantAccount = await signers[1].getAddress()
      accounts = [ownerAccount, registrantAccount, signers[2].getAddress()]

      ens = await deploy('ENSRegistry')

      baseRegistrar = await deploy(
        'BaseRegistrarImplementation',
        ens.address,
        namehash(WBT_TLD),
      )

      reverseRegistrar = await deploy('ReverseRegistrar', ens.address)

      await ens.setSubnodeOwner(EMPTY_BYTES, sha3('reverse'), accounts[0])
      await ens.setSubnodeOwner(
        namehash('reverse'),
        sha3('addr'),
        reverseRegistrar.address,
      )

      nameWrapper = await deploy(
        'NameWrapper',
        ens.address,
        baseRegistrar.address,
        ownerAccount,
      )

      await ens.setSubnodeOwner(
        EMPTY_BYTES,
        sha3(WBT_TLD),
        baseRegistrar.address,
      )

      const dummyOracle = await deploy('DummyOracle', '100000000') // 1,000,000 USDC.e
      dummyUSDCeContract = await deploy(
        'DummyUSDCe',
        ethers.utils.parseUnits('1000000', 6),
      )

      priceOracle = await deploy('StablePriceOracle', dummyOracle.address, [
        price1LetterPerSeconds,
        calculateRentPricePerSecondInAttoUSD('1000'),
        calculateRentPricePerSecondInAttoUSD('99'),
        calculateRentPricePerSecondInAttoUSD('49'),
        calculateRentPricePerSecondInAttoUSD('3'),
        calculateRentPricePerSecondInAttoUSD('1'),
      ])

      controller = await deploy(
        'ETHRegistrarController',
        baseRegistrar.address,
        priceOracle.address,
        600,
        86400,
        reverseRegistrar.address,
        nameWrapper.address,
        ens.address,
        dummyUSDCeContract.address,
        +process.env.MIN_ALLOWED_DOMAIN_LENGTH,
      )

      await nameWrapper.setController(controller.address, true)
      await baseRegistrar.addController(nameWrapper.address)
      await reverseRegistrar.setController(controller.address, true)

      resolver = await deploy(
        'PublicResolver',
        ens.address,
        nameWrapper.address,
        controller.address,
        reverseRegistrar.address,
      )

      callData = [
        resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
          namehash(`newconfigname.${WBT_TLD}`),
          registrantAccount,
        ]),
        resolver.interface.encodeFunctionData('setText', [
          namehash(`newconfigname.${WBT_TLD}`),
          'url',
          'ethereum.com',
        ]),
      ]

      resolver2 = await resolver.connect(signers[1])

      const initialBalance = ethers.utils.parseUnits('10000', 6) // 10000 USDC.e
      await dummyUSDCeContract.transfer(registrantAccount, initialBalance)
    })

    it('should permit new registrations', async () => {
      const label = 'newname'
      const balanceBefore = await dummyUSDCeContract.balanceOf(
        controller.address,
      )
      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)

      const tx = await registerNameUseUSDCe(label, base)
      const block = await provider.getBlock(tx.blockNumber)
      await expect(tx)
        .to.emit(controller, 'NameRegistered')
        .withArgs(
          label,
          sha3(label),
          registrantAccount,
          base,
          0,
          block.timestamp + REGISTRATION_TIME,
        )

      expect(
        (await dummyUSDCeContract.balanceOf(controller.address)) -
          balanceBefore,
      ).to.equal(base)
    })

    it('should revert when not enough ether is transferred', async () => {
      await expect(registerNameUseUSDCe('newname', 0)).to.be.revertedWith(
        'InsufficientValue()',
      )
    })

    it('should report registered names as unavailable', async () => {
      const label = 'newname'
      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)
      await registerNameUseUSDCe(label, base)

      expect(await controller.available(label)).to.equal(false)
    })

    it('should permit new registrations with resolver and records', async () => {
      const label = 'newconfigname'

      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)
      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)

      var commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        callData,
        false,
        0,
      )
      var tx = await controller.commit(commitment)

      expect(await controller.commitments(commitment)).to.equal(
        (await web3.eth.getBlock(tx.blockNumber)).timestamp,
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      var balanceBefore = await dummyUSDCeContract.balanceOf(controller.address)
      var tx = await controller.registryByUSDCe(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        callData,
        false,
        0,
        base,
      )

      const block = await provider.getBlock(tx.blockNumber)

      await expect(tx)
        .to.emit(controller, 'NameRegistered')
        .withArgs(
          label,
          sha3(label),
          registrantAccount,
          base,
          0,
          block.timestamp + REGISTRATION_TIME,
        )

      expect(
        (await dummyUSDCeContract.balanceOf(controller.address)) -
          balanceBefore,
      ).to.equal(base)

      var nodeHash = namehash(`${label}.${WBT_TLD}`)

      expect(await ens.resolver(nodeHash)).to.equal(resolver.address)
      expect(await ens.owner(nodeHash)).to.equal(nameWrapper.address)
      expect(await baseRegistrar.ownerOf(sha3(label))).to.equal(
        nameWrapper.address,
      )
      expect(await resolver['addr(bytes32)'](nodeHash)).to.equal(
        registrantAccount,
      )
      expect(await resolver['text'](nodeHash, 'url')).to.equal('ethereum.com')
      expect(await nameWrapper.ownerOf(nodeHash)).to.equal(registrantAccount)
    })

    it('should not permit new registrations with EoA resolver', async () => {
      const label = 'newconfigname'

      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)
      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)
      const commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        registrantAccount,
        callData,
        false,
        0,
      )

      const tx = await controller.commit(commitment)
      expect(await controller.commitments(commitment)).to.equal(
        (await web3.eth.getBlock(tx.blockNumber)).timestamp,
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await expect(
        controller.registryByUSDCe(
          label,
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          registrantAccount,
          callData,
          false,
          0,
          base,
        ),
      ).to.be.reverted
    })

    it('should not permit new registrations with an incompatible contract', async () => {
      const label = 'newconfigname'

      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)
      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)

      const commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        controller.address,
        callData,
        false,
        0,
      )

      const tx = await controller.commit(commitment)
      expect(await controller.commitments(commitment)).to.equal(
        (await web3.eth.getBlock(tx.blockNumber)).timestamp,
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await expect(
        controller.registryByUSDCe(
          label,
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          controller.address,
          callData,
          false,
          0,
          base,
        ),
      ).to.be.revertedWith(
        "Transaction reverted: function selector was not recognized and there's no fallback function",
      )
    })

    it('should not permit new registrations with records updating a different name', async () => {
      const label = 'awesome'

      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)
      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)

      const commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            namehash(`othername.${WBT_TLD}`),
            registrantAccount,
          ]),
        ],
        false,
        0,
      )
      const tx = await controller.commit(commitment)
      expect(await controller.commitments(commitment)).to.equal(
        (await web3.eth.getBlock(tx.blockNumber)).timestamp,
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())

      await expect(
        controller.registryByUSDCe(
          label,
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          resolver.address,
          [
            resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
              namehash(`othername.${WBT_TLD}`),
              registrantAccount,
            ]),
          ],
          false,
          0,
          base,
        ),
      ).to.be.revertedWith(
        'multicall: All records must have a matching namehash',
      )
    })

    it('should not permit new registrations with any record updating a different name', async () => {
      const label = 'awesome'

      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)
      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)

      const commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            namehash(`awesome.${WBT_TLD}`),
            registrantAccount,
          ]),
          resolver.interface.encodeFunctionData(
            'setText(bytes32,string,string)',
            [namehash(`other.${WBT_TLD}`), 'url', 'ethereum.com'],
          ),
        ],
        false,
        0,
      )
      const tx = await controller.commit(commitment)
      expect(await controller.commitments(commitment)).to.equal(
        (await web3.eth.getBlock(tx.blockNumber)).timestamp,
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())

      await expect(
        controller.registryByUSDCe(
          label,
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          resolver.address,
          [
            resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
              namehash(`awesome.${WBT_TLD}`),
              registrantAccount,
            ]),
            resolver.interface.encodeFunctionData(
              'setText(bytes32,string,string)',
              [namehash(`other.${WBT_TLD}`), 'url', 'ethereum.com'],
            ),
          ],
          false,
          0,
          base,
        ),
      ).to.be.revertedWith(
        'multicall: All records must have a matching namehash',
      )
    })

    it('should permit a registration with resolver but no records', async () => {
      const label = 'newconfigname2'

      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)
      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)

      const commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        false,
        0,
      )
      let tx = await controller.commit(commitment)
      expect(await controller.commitments(commitment)).to.equal(
        (await web3.eth.getBlock(tx.blockNumber)).timestamp,
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      const balanceBefore = await dummyUSDCeContract.balanceOf(
        controller.address,
      )
      let tx2 = await controller.registryByUSDCe(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        false,
        0,
        base,
      )

      const block = await provider.getBlock(tx2.blockNumber)

      await expect(tx2)
        .to.emit(controller, 'NameRegistered')
        .withArgs(
          label,
          sha3(label),
          registrantAccount,
          base,
          0,
          block.timestamp + REGISTRATION_TIME,
        )

      const nodeHash = namehash(`${label}.${WBT_TLD}`)
      expect(await ens.resolver(nodeHash)).to.equal(resolver.address)
      expect(await resolver['addr(bytes32)'](nodeHash)).to.equal(NULL_ADDRESS)
      expect(
        (await dummyUSDCeContract.balanceOf(controller.address)) -
          balanceBefore,
      ).to.equal(base)
    })

    it('should include the owner in the commitment', async () => {
      const label = 'newname2'

      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)
      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)

      await controller.commit(
        await controller.makeCommitment(
          label,
          accounts[2],
          REGISTRATION_TIME,
          secret,
          NULL_ADDRESS,
          [],
          false,
          0,
        ),
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await expect(
        controller.registryByUSDCe(
          label,
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          NULL_ADDRESS,
          [],
          false,
          0,
          base,
        ),
      ).to.be.reverted
    })

    it('should reject duplicate registrations', async () => {
      const label = 'newname'

      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)

      await registerNameUseUSDCe(label, base)

      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)

      await controller.commit(
        await controller.makeCommitment(
          label,
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          NULL_ADDRESS,
          [],
          false,
          0,
        ),
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await expect(
        controller.registryByUSDCe(
          label,
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          NULL_ADDRESS,
          [],
          false,
          0,
          base,
        ),
      ).to.be.revertedWith(`NameNotAvailable("${label}")`)
    })

    it('should reject for expired commitments', async () => {
      const label = 'newname2'

      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)
      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)

      const commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        NULL_ADDRESS,
        [],
        false,
        0,
      )
      await controller.commit(commitment)

      await evm.advanceTime(
        (await controller.maxCommitmentAge()).toNumber() + 1,
      )
      await expect(
        controller.registryByUSDCe(
          label,
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          NULL_ADDRESS,
          [],
          false,
          0,
          base,
        ),
      ).to.be.revertedWith(`CommitmentTooOld("${commitment}")`)
    })

    it('should allow anyone to renew a name without changing fuse expiry', async () => {
      const label = 'newname'
      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)
      await registerNameUseUSDCe(label, base)
      var nodeHash = namehash(`${label}.${WBT_TLD}`)
      var fuseExpiry = (await nameWrapper.getData(nodeHash))[2]
      var expires = await baseRegistrar.nameExpires(sha3(label))
      var balanceBefore = await dummyUSDCeContract.balanceOf(controller.address)
      const duration = 86400
      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)
      await controller.renewByUSDCe(label, duration, base)
      var newExpires = await baseRegistrar.nameExpires(sha3(label))
      var newFuseExpiry = (await nameWrapper.getData(nodeHash))[2]
      expect(newExpires.toNumber() - expires.toNumber()).to.equal(duration)
      expect(newFuseExpiry.toNumber() - fuseExpiry.toNumber()).to.equal(86400)
      expect(
        (await dummyUSDCeContract.balanceOf(controller.address)) -
          balanceBefore,
      ).to.equal(2739)
    })

    it('should allow token owners to renew a name', async () => {
      const label = 'newname'
      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)
      await registerNameUseUSDCe(label, base)
      var nodeHash = namehash(`${label}.${WBT_TLD}`)
      const [, fuses, fuseExpiry] = await nameWrapper.getData(nodeHash)

      var expires = await baseRegistrar.nameExpires(sha3(label))
      var balanceBefore = await dummyUSDCeContract.balanceOf(controller.address)
      const duration = 86400
      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)
      await controller.renewByUSDCe(label, duration, base)
      var newExpires = await baseRegistrar.nameExpires(sha3(label))
      const [, newFuses, newFuseExpiry] = await nameWrapper.getData(nodeHash)
      expect(newExpires.toNumber() - expires.toNumber()).to.equal(duration)
      expect(newFuseExpiry.toNumber() - fuseExpiry.toNumber()).to.equal(
        duration,
      )
      expect(newFuses).to.equal(fuses)
      expect(
        (await dummyUSDCeContract.balanceOf(controller.address)) -
          balanceBefore,
      ).to.equal(2739)
    })

    it('non wrapped names can renew', async () => {
      const label = 'newname'
      const tokenId = sha3(label)
      const nodeHash = namehash(`${label}.${WBT_TLD}`)
      // this is to allow user to register without nameWrapped
      await baseRegistrar.addController(ownerAccount)
      await baseRegistrar.register(tokenId, ownerAccount, 84600)

      expect(await nameWrapper.ownerOf(nodeHash)).to.equal(ZERO_ADDRESS)
      expect(await baseRegistrar.ownerOf(tokenId)).to.equal(ownerAccount)

      var expires = await baseRegistrar.nameExpires(tokenId)
      const duration = 86400
      const [base] = await controller.rentPriceUSDCe(label, duration)
      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)
      await controller.renewByUSDCe(label, duration, base)

      expect(await baseRegistrar.ownerOf(tokenId)).to.equal(ownerAccount)
      expect(await nameWrapper.ownerOf(nodeHash)).to.equal(ZERO_ADDRESS)
      var newExpires = await baseRegistrar.nameExpires(tokenId)
      expect(newExpires.toNumber() - expires.toNumber()).to.equal(duration)
    })

    it('should require sufficient value for a renewal', async () => {
      await expect(
        controller.renewByUSDCe('name', 86400, 0),
      ).to.be.revertedWith('InsufficientValue()')
    })

    it('should allow anyone to withdraw funds and transfer to the registrar owner', async () => {
      await controller.withdrawUSDCe()

      expect(
        parseInt(await dummyUSDCeContract.balanceOf(controller.address)),
      ).to.equal(0)
    })

    it('should set the reverse record of the account', async () => {
      const label = 'reverse'

      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)
      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)

      const commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        true,
        0,
      )
      await controller.commit(commitment)

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await controller.registryByUSDCe(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        true,
        0,
        base,
      )

      expect(await resolver.name(getReverseNode(ownerAccount))).to.equal(
        `reverse.${WBT_TLD}`,
      )
    })

    it('should not set the reverse record of the account when set to false', async () => {
      const label = 'noreverse'

      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)
      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)

      const commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        false,
        0,
      )
      await controller.commit(commitment)

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await controller.registryByUSDCe(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        false,
        0,
        base,
      )

      expect(await resolver.name(getReverseNode(ownerAccount))).to.equal('')
    })

    it('should auto wrap the name and set the ERC721 owner to the wrapper', async () => {
      const label = 'wrapper'

      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)
      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)

      const name = label + `.${WBT_TLD}`
      const commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        true,
        0,
      )
      await controller.commit(commitment)

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await controller.registryByUSDCe(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        true,
        0,
        base,
      )

      expect(await nameWrapper.ownerOf(namehash(name))).to.equal(
        registrantAccount,
      )
      expect(await ens.owner(namehash(name))).to.equal(nameWrapper.address)
      expect(await baseRegistrar.ownerOf(sha3(label))).to.equal(
        nameWrapper.address,
      )
    })

    it('should auto wrap the name and allow fuses and expiry to be set', async () => {
      const label = 'fuses'

      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)
      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)

      const name = label + `.${WBT_TLD}`
      const commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        true,
        1,
      )
      await controller.commit(commitment)

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      const tx = await controller.registryByUSDCe(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [],
        true,
        1,
        base,
      )

      const block = await provider.getBlock(tx.block)
      const [, fuses, expiry] = await nameWrapper.getData(namehash(name))

      expect(fuses).to.equal(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | IS_DOT_ETH)
      expect(expiry).to.equal(
        REGISTRATION_TIME + GRACE_PERIOD_IN_SEC + block.timestamp,
      )
    })

    it('approval should reduce gas for registration', async () => {
      const label = 'other'
      const name = label + `.${WBT_TLD}`
      const node = namehash(name)

      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)
      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)

      const commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            node,
            registrantAccount,
          ]),
        ],
        true,
        1,
      )

      await controller.commit(commitment)

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())

      const gasA = await controller.estimateGas.registryByUSDCe(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            node,
            registrantAccount,
          ]),
        ],
        true,
        1,
        base,
      )

      await resolver2.setApprovalForAll(controller.address, true)

      const gasB = await controller.estimateGas.registryByUSDCe(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver2.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            node,
            registrantAccount,
          ]),
        ],
        true,
        1,
        base,
      )

      const tx = await controller.registryByUSDCe(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver2.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            node,
            registrantAccount,
          ]),
        ],
        true,
        1,
        base,
      )

      expect(await nameWrapper.ownerOf(node)).to.equal(registrantAccount)
      expect(await ens.owner(namehash(name))).to.equal(nameWrapper.address)
      expect(await baseRegistrar.ownerOf(sha3(label))).to.equal(
        nameWrapper.address,
      )
      expect(await resolver2['addr(bytes32)'](node)).to.equal(registrantAccount)
    })

    it('should not permit new registrations with non resolver function calls', async () => {
      const label = 'newconfigname'
      const name = `${label}.${WBT_TLD}`
      const node = namehash(name)
      const secondTokenDuration = 788400000 // keep bogus NFT for 25 years;

      const [base] = await controller.rentPriceUSDCe(label, REGISTRATION_TIME)
      await (await dummyUSDCeContract.approve(controller.address, base)).wait()
      await dummyUSDCeContract.allowance(registrantAccount, controller.address)

      const callData = [
        baseRegistrar.interface.encodeFunctionData(
          'register(uint256,address,uint)',
          [node, registrantAccount, secondTokenDuration],
        ),
      ]
      var commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        baseRegistrar.address,
        callData,
        false,
        0,
      )
      var tx = await controller.commit(commitment)

      expect(await controller.commitments(commitment)).to.equal(
        (await web3.eth.getBlock(tx.blockNumber)).timestamp,
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await expect(
        controller.registryByUSDCe(
          label,
          registrantAccount,
          REGISTRATION_TIME,
          secret,
          baseRegistrar.address,
          callData,
          false,
          0,
          base,
        ),
      ).to.be.revertedWith(
        "Transaction reverted: function selector was not recognized and there's no fallback function",
      )
    })
  })
})
