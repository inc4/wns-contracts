import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts } = hre
  const { deployer, owner } = await getNamedAccounts()

  console.log('Running root setup')

  const registry = await ethers.getContract('ENSRegistry')
  const root = await ethers.getContract('Root')

  const tx1 = await registry.setOwner(ethers.constants.HashZero, root.address)
  console.log(
    `Setting owner of root node to root contract (tx: ${tx1.hash})...`,
  )
  await tx1.wait()

  const rootOwner = await root.owner()

  switch (rootOwner) {
    case deployer:
      const tx2 = await root
        .connect(await ethers.getSigner(deployer))
        .transferOwnership(owner)
      console.log(
        `Transferring root ownership to final owner (tx: ${tx2.hash})...`,
      )
      await tx2.wait()
    case owner:
      if (!(await root.controllers(owner))) {
        const tx2 = await root
          .connect(await ethers.getSigner(owner))
          .setController(owner, true)
        console.log(
          `Setting final owner as controller on root contract (tx: ${tx2.hash})...`,
        )
        await tx2.wait()
      }
      break
    default:
      console.log(
        `WARNING: Root is owned by ${rootOwner}; cannot transfer to owner account`,
      )
  }

  return true
}

func.id = 'setupRoot'
func.tags = ['setupRoot']
func.dependencies = ['Root']

export default func
