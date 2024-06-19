import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy('ENSRegistry', {
    from: deployer,
    args: [],
    log: true,
  })

  return true
}

func.id = 'ens'
func.tags = ['registry', 'ENSRegistry']

export default func
