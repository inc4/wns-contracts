import { Interface } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const { makeInterfaceId } = require('@openzeppelin/test-helpers')

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  const registry = await ethers.getContract('ENSRegistry')
  const controller = await ethers.getContract('ETHRegistrarController')

  const bulkRenewal = await deploy('StaticBulkRenewal', {
    from: deployer,
    args: [controller.address],
    log: true,
  })

  const artifact = await deployments.getArtifact('IBulkRenewal')
  const interfaceId = computeInterfaceId(new Interface(artifact.abi))
  const provider = new ethers.providers.StaticJsonRpcProvider(
    ethers.provider.connection.url,
    {
      ...ethers.provider.network,
      ensAddress: registry.address,
    },
  )

  const resolver = await registry.resolver(ethers.utils.namehash('wbt'))
  if (resolver === ethers.constants.AddressZero) {
    console.log(
      `No resolver set for .wbt; not setting interface ${interfaceId} for BulkRenewal`,
    )
    return
  }
  const resolverContract = await ethers.getContractAt('OwnedResolver', resolver)
  const tx = await resolverContract.setInterface(
    ethers.utils.namehash('wbt'),
    interfaceId,
    bulkRenewal.address,
  )
  console.log(
    `Setting BulkRenewal interface ID ${interfaceId} on .wbt resolver (tx: ${tx.hash})...`,
  )
  await tx.wait()
  return true
}

function computeInterfaceId(iface: Interface) {
  return makeInterfaceId.ERC165(
    Object.values(iface.functions).map((frag) => frag.format('sighash')),
  )
}

func.id = 'bulk-renewal'
func.tags = ['BulkRenewal']
func.dependencies = ['registry']

export default func
