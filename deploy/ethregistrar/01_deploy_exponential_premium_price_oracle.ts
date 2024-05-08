import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import BigNumber from 'bignumber.js'

const price1Letter = '0'
const price2LetterPerSeconds = calculateRentPricePerSecondInAttoUSD(
  process.env.PRICE_2_LETTER!,
)
const price3LetterPerSeconds = calculateRentPricePerSecondInAttoUSD(
  process.env.PRICE_3_LETTER!,
)
const price4LetterPerSeconds = calculateRentPricePerSecondInAttoUSD(
  process.env.PRICE_4_LETTER!,
)
const price5LetterPerSeconds = calculateRentPricePerSecondInAttoUSD(
  process.env.PRICE_5_LETTER!,
)
const price6LetterPerSeconds = calculateRentPricePerSecondInAttoUSD(
  process.env.PRICE_6_LETTER!,
)
const startPremiumPrice = process.env.START_PREMIUM_PRICE
const totalDaysForDutchAuction = process.env.TOTAL_DAYS_FOR_DUTCH_AUCTION

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  const priceOracle = await deploy('PriceOracle', {
    from: deployer,
    args: [process.env.DUMMY_ORACLE_PRICE],
    log: true,
  })

  await deploy('ExponentialPremiumPriceOracle', {
    from: deployer,
    args: [
      priceOracle.address,
      [
        price1Letter,
        price2LetterPerSeconds,
        price3LetterPerSeconds,
        price4LetterPerSeconds,
        price5LetterPerSeconds,
        price6LetterPerSeconds,
      ],
      startPremiumPrice,
      totalDaysForDutchAuction,
    ],
    log: true,
  })
}

function calculateRentPricePerSecondInAttoUSD(amountInUSD: string): string {
  const amountInUSDBigNumber = BigNumber(amountInUSD)
  const secondsInYear = BigNumber(365 * 24 * 60 * 60)

  const attoUSD = amountInUSDBigNumber.multipliedBy(1e18)
  const rentPricePerSecond = attoUSD.dividedBy(secondsInYear)

  return rentPricePerSecond.toFixed(0).toString()
}

func.id = 'price-oracle'
func.tags = ['ethregistrar', 'ExponentialPremiumPriceOracle', 'PriceOracle']
func.dependencies = ['registry']

export default func
