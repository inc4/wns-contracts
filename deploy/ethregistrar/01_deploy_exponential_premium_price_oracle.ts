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
const START_PREMIUM_PRICE = process.env.START_PREMIUM_PRICE
const TOTAL_DAYS_FOR_DUTCH_AUCTION = process.env.TOTAL_DAYS_FOR_DUTCH_AUCTION
const PRICE_ORACLE_OPERATOR_ADDRESS = process.env.PRICE_ORACLE_OPERATOR_ADDRESS

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  const startPrice = await getStartPrice()

  const priceOracle = await deploy('PriceOracle', {
    from: deployer,
    args: [startPrice, PRICE_ORACLE_OPERATOR_ADDRESS],
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
      START_PREMIUM_PRICE,
      TOTAL_DAYS_FOR_DUTCH_AUCTION,
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

async function getStartPrice(): Promise<BigInt> {
  const url =
    `https://${process.env.COIN_GECKO_API_DOMAIN}/api/v3/simple/price?` +
    `ids=whitebit&vs_currencies=usd&x_cg_demo_api_key=${process.env.COIN_GECKO_API_KEY}`
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error('failed to fetch price: ' + resp.statusText)
  }
  const json = await resp.json()
  return BigInt(BigNumber(json.whitebit.usd).multipliedBy(1e8).toString())
}

func.id = 'price-oracle'
func.tags = ['ethregistrar', 'ExponentialPremiumPriceOracle', 'PriceOracle']
func.dependencies = ['registry']

export default func
