# WNS Smart-contracts

For an introduction to WNS documentation, see the original ENS documentation. [docs.ens.domains](https://docs.ens.domains/).

The main differences will be described below.

## npm package

This repo doubles as an npm package with the compiled JSON contracts

```js
import {
  BaseRegistrar,
  BaseRegistrarImplementation,
  BulkRenewal,
  ENS,
  ENSRegistry,
  ENSRegistryWithFallback,
  ETHRegistrarController,
  FIFSRegistrar,
  LinearPremiumPriceOracle,
  PriceOracle,
  PublicResolver,
  Resolver,
  ReverseRegistrar,
  StablePriceOracle,
  TestRegistrar,
} from '@inc4/wns-contracts'
```

## Importing from solidity

```
// Registry
import '@ensdomains/ens-contracts/contracts/registry/ENS.sol';
import '@ensdomains/ens-contracts/contracts/registry/ENSRegistry.sol';
import '@ensdomains/ens-contracts/contracts/registry/ENSRegistryWithFallback.sol';
import '@ensdomains/ens-contracts/contracts/registry/ReverseRegistrar.sol';
import '@ensdomains/ens-contracts/contracts/registry/TestRegistrar.sol';
// EthRegistrar
import '@ensdomains/ens-contracts/contracts/ethregistrar/BaseRegistrar.sol';
import '@ensdomains/ens-contracts/contracts/ethregistrar/BaseRegistrarImplementation.sol';
import '@ensdomains/ens-contracts/contracts/ethregistrar/BulkRenewal.sol';
import '@ensdomains/ens-contracts/contracts/ethregistrar/ETHRegistrarController.sol';
import '@ensdomains/ens-contracts/contracts/ethregistrar/LinearPremiumPriceOracle.sol';
import '@ensdomains/ens-contracts/contracts/ethregistrar/PriceOracle.sol';
import '@ensdomains/ens-contracts/contracts/ethregistrar/StablePriceOracle.sol';
// Resolvers
import '@ensdomains/ens-contracts/contracts/resolvers/PublicResolver.sol';
import '@ensdomains/ens-contracts/contracts/resolvers/Resolver.sol';
```

## Accessing to binary file.

If your environment does not have compiler, you can access to the raw hardhat artifacts files at `node_modules/@inc4/wns-contracts/artifacts/contracts/${modName}/${contractName}.sol/${contractName}.json`

## Contracts

## Registry

The ENS registry is the core contract that lies at the heart of ENS resolution. All ENS lookups start by querying the registry. The registry maintains a list of domains, recording the owner, resolver, and TTL for each, and allows the owner of a domain to make changes to that data. It also includes some generic registrars.

### ENS.sol

Interface of the ENS Registry.

### ENSRegistry

Implementation of the ENS Registry, the central contract used to look up resolvers and owners for domains.

### ReverseRegistrar

Implementation of the reverse registrar responsible for managing reverse resolution via the .addr.reverse special-purpose TLD.

## EthRegistrar

Implements an [ENS]() registrar intended for the .wbt TLD.

### BaseRegistrar

BaseRegistrar is the contract that owns the TLD in the ENS registry. This contract implements a minimal set of functionality:

- The owner of the registrar may add and remove controllers.
- Controllers may register new domains and extend the expiry of (renew) existing domains. They can not change the ownership or reduce the expiration time of existing domains.
- Name owners may transfer ownership to another address.
- Name owners may reclaim ownership in the ENS registry if they have lost it.
- Owners of names in the interim registrar may transfer them to the new registrar, during the 1 year transition period. When they do so, their deposit is returned to them in its entirety.

This separation of concerns provides name owners strong guarantees over continued ownership of their existing names, while still permitting innovation and change in the way names are registered and renewed via the controller mechanism.

### EthRegistrarController

EthRegistrarController is the first implementation of a registration controller for the new registrar. This contract implements the following functionality:

- The owner of the registrar may set a price oracle contract, which determines the cost of registrations and renewals based on the name and the desired registration or renewal duration.
- The owner of the registrar may withdraw any collected funds to their account.
- Users can register new names using a commit/reveal process and by paying the appropriate registration fee.
- Users can renew a name by paying the appropriate fee. Any user may renew a domain, not just the name's owner.

The commit/reveal process is used to avoid frontrunning, and operates as follows:

1.  A user commits to a hash, the preimage of which contains the name to be registered and a secret value.
2.  After a minimum delay period and before the commitment expires, the user calls the register function with the name to register and the secret value from the commitment. If a valid commitment is found and the other preconditions are met, the name is registered.

The minimum delay and expiry for commitments exist to prevent miners or other users from effectively frontrunning registrations.

### PriceOracle

SimplePriceOracle is a trivial implementation of the pricing oracle for the EthRegistrarController that always returns a fixed price per domain per year, determined by the contract owner.

### StablePriceOracle

StablePriceOracle is a price oracle implementation that allows the contract owner to specify pricing based on the length of a name, and uses a fiat currency oracle to set a fixed price in fiat per name.

## Resolvers

Resolver implements a general-purpose ENS resolver that is suitable for most standard ENS use cases. The public resolver permits updates to ENS records by the owner of the corresponding name.

PublicResolver includes the following profiles that implements different EIPs.

- ABIResolver = EIP 205 - ABI support (`ABI()`).
- AddrResolver = EIP 137 - Contract address interface. EIP 2304 - Multicoin support (`addr()`).
- ContentHashResolver = EIP 1577 - Content hash support (`contenthash()`).
- InterfaceResolver = EIP 165 - Interface Detection (`supportsInterface()`).
- NameResolver = EIP 181 - Reverse resolution (`name()`).
- PubkeyResolver = EIP 619 - SECP256k1 public keys (`pubkey()`).
- TextResolver = EIP 634 - Text records (`text()`).

## Differences

- Grace period was changed from 90 days to 30 days

- Price change [mechanism](https://github.com/inc4/wns-contracts/blob/2abe48d6cfa57016b5960bc64216970e31f68e93/contracts/ethregistrar/StablePriceOracle.sol#L69). This mechanism can only be used by the owner of the contract.

- Smart contract [PriceOracle](https://github.com/inc4/wns-contracts/blob/wns/contracts/ethregistrar/PriceOracle.sol) has been developed for pushing the price of WBT. This smart contract has a mechanism for granting operator rights, according to private key, for pushing the current price on WBT. This operator can be replaced using the built-in [mechanism](https://github.com/inc4/wns-contracts/blob/2abe48d6cfa57016b5960bc64216970e31f68e93/contracts/ethregistrar/PriceOracle.sol#L23), this operation can only be carried out by the owner of the contract.

- Switching environments for deploying smart contracts occurs using the [hardhat configuration](https://github.com/inc4/wns-contracts/blob/wns/hardhat.config.ts) , as well as setting the necessary [environment variables](https://github.com/inc4/wns-contracts/blob/wns/.env.org)

### Buying a name with a USDC.e

The process of buying a name using the USDC.e is almost the same as for WBT, with the exception of a few differences:

- The tenant must provide approval for this transaction in the contract using the built-in mechanism of the USDC.e smart contract, similar to the [ERC20.approve](https://docs.openzeppelin.com/contracts/2.x/api/token/erc20#IERC20-approve-address-uint256-) smart contract.

- Then you need to check the approval operation using the built-in method of the USDC.e smart contract, similar to the [ERC20.allowance](https://docs.openzeppelin.com/contracts/2.x/api/token/erc20#IERC20-allowance-address-address-) smart contract.

- Next comes the standard name registration [process](https://docs.ens.domains/registry/eth#commit-reveal) :

  - Creating a commitment hash. [makeCommitment](https://github.com/inc4/wns-contracts/blob/2abe48d6cfa57016b5960bc64216970e31f68e93/contracts/ethregistrar/ETHRegistrarController.sol#L132C14-L132C28)

  - [Commit](https://github.com/inc4/wns-contracts/blob/2abe48d6cfa57016b5960bc64216970e31f68e93/contracts/ethregistrar/ETHRegistrarController.sol#L161)

  - Wait 60 seconds before [registration](<https://docs.ens.domains/registry/eth#commit-reveal:~:text=Note%20this%20does%20require%20an%20on%2Dchain%20transaction.%20After%20having%20committed%20it%20is%20recommended%20to%20wait%20at%20least%20the%20MIN_COMMITMENT_AGE%20(~60%20seconds)%20before%20registering.>)

  - To register a name using this [functionality](https://github.com/inc4/wns-contracts/blob/2abe48d6cfa57016b5960bc64216970e31f68e93/contracts/ethregistrar/ETHRegistrarController.sol#L168). The difference between the standard method of buying a name is that the required amount of USDC.e is passed as an additional parameter to the function call.

## Developer guide

### Prettier pre-commit hook

This repo runs a husky precommit to prettify all contract files to keep them consistent. Add new folder/files to `prettier format` script in package.json. If you need to add other tasks to the pre-commit script, add them to `.husky/pre-commit`

### How to setup

```
git clone https://github.com/inc4/wns-contracts
cd ens-contracts
yarn
```

### Env vars description

- create file (.env) to set environment variable

  OWNER_KEY:

  ```
  owner of contracts private key
  ```

  DEPLOYER_KEY:

  ```
  deployer of contracts private key
  ```

  WHITE_CHAIN_TESTNET_NETWORK_URL:

  ```
  url for connecting to the blockchain network
  ```

  USDC_E_CONTRACT_ADDRESS:

  ```
  the address of the deployed USDC.e contract in the blockchain network specified in NETWORK_URL
  ```

  PRICE_2_LETTER:
  PRICE_3_LETTER:
  PRICE_4_LETTER:
  PRICE_5_LETTER:
  PRICE_6_LETTER:

  ```
  required prices per year for renting a name of a certain length
  ```

  DEFAULT_ORACLE_PRICE

  ```
  if necessary, set a custom starting price value for one wbt to the usd
  ```

  START_PREMIUM_PRICE:

  ```
  default price equal 100000000000000000000000000, referring to ens documentation
  ```

  TOTAL_DAYS_FOR_DUTCH_AUCTION:

  ```
  default value equal 21, referring to ens documentation
  ```

  MIN_ALLOWED_DOMAIN_LENGTH:

  ```
  default length equal 2, referring to the terms of reference
  ```

  PRICE_ORACLE_OPERATOR_ADDRESS:

  ```
  price oracle contract operator private key
  ```

  COIN_GECKO_API_DOMAIN

  ```
  Coin Gecko API domain. Example (api.coingecko.com/pro-api.coingecko.com)
  ```

  COIN_GECKO_API_KEY_HEADER

  ```
  Coin Gecko API key header. Example (x_cg_demo_api_key/x_cg_pro_api_key)
  ```

  COIN_GECKO_API_KEY:

  ```
  API key to access CoinGecko
  ```

### How to run tests

```
yarn test
```

### How to build and deploy contracts

- for build contracts:

```
yarn build
```

- for build and deploy contracts to white_chain_testnet

```
yarn deploy:white_chain_testnet
```

### How to publish

```
yarn pub
```
