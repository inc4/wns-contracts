import { Interface } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const { makeInterfaceId } = require('@openzeppelin/test-helpers')

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deploy } = deployments
  const { deployer, owner } = await getNamedAccounts()

  const registry = await ethers.getContract('ENSRegistry', owner)
  const registrar = await ethers.getContract(
    'BaseRegistrarImplementation',
    owner,
  )

  const metadata = await ethers.getContract('StaticMetadataService', owner)

  const deployArgs = {
    from: deployer,
    args: [registry.address, registrar.address, metadata.address],
    log: true,
  }

  const nameWrapper = await deploy('NameWrapper', deployArgs)
  if (!nameWrapper.newlyDeployed) return

  if (owner !== deployer) {
    const wrapper = await ethers.getContract('NameWrapper', deployer)
    const tx = await wrapper.transferOwnership(owner)
    console.log(
      `Transferring ownership of NameWrapper to ${owner} (tx: ${tx.hash})...`,
    )
    await tx.wait()
  }

  const tx2 = await registrar.addController(nameWrapper.address)
  console.log(
    `Adding NameWrapper as controller on registrar (tx: ${tx2.hash})...`,
  )
  await tx2.wait()

  const artifact = await deployments.getArtifact('INameWrapper')
  const interfaceId = computeInterfaceId(new Interface(artifact.abi))
  const resolver = await registry.resolver(ethers.utils.namehash('wbt'))
  if (resolver === ethers.constants.AddressZero) {
    console.log(
      `No resolver set for .wbt; not setting interface ${interfaceId} for NameWrapper`,
    )
    return
  }
  const resolverContract = await ethers.getContractAt('OwnedResolver', resolver)
  const tx3 = await resolverContract.setInterface(
    ethers.utils.namehash('wbt'),
    interfaceId,
    nameWrapper.address,
  )
  console.log(
    `Setting NameWrapper interface ID ${interfaceId} on .wbt resolver (tx: ${tx3.hash})...`,
  )
  await tx3.wait()
}

function computeInterfaceId(iface: Interface) {
  return makeInterfaceId.ERC165(
    Object.values(iface.functions).map((frag) => frag.format('sighash')),
  )
}

func.id = 'name-wrapper'
func.tags = ['wrapper', 'NameWrapper']
func.dependencies = [
  'StaticMetadataService',
  'registry',
  'ReverseRegistrar',
  'OwnedResolver',
]

export default func
