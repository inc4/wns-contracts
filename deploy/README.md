# Deployment Scripts Summary

## Overview

The deployment scripts automate the deployment and setup of various smart contracts related to Whitechain Name Service (WNS) and domain management. Each script serves a specific purpose within the system, ranging from deploying core registrar contracts to setting up pricing oracles and enabling bulk renewal functionalities.

## **Script Details**

## ETHRegistrar

### [BaseRegistrarImplementation Deployment](https://github.com/inc4/wns-contracts/blob/wns/deploy/ethregistrar/00_deploy_base_registrar_implementation.ts)

- **Purpose**: Deploys the BaseRegistrarImplementation contract for managing domain registrations.
- **Key Actions**: Configures deployment arguments and deploys the contract. Sets deployment identifiers and dependencies.

### [Setup Registrar](https://github.com/inc4/wns-contracts/blob/wns/deploy/ethregistrar/00_setup_base_registrar.ts)

- **Purpose**: Transfers ownership and sets configurations for the registrar contract.
- **Key Actions**: Transfers ownership of the registrar contract to the designated owner. Sets up domain ownership on the root ENS contract.

### [Price Oracle Deployment](https://github.com/inc4/wns-contracts/blob/wns/deploy/ethregistrar/01_deploy_exponential_premium_price_oracle.ts)

- **Purpose**: Deploys pricing oracles for domain name registrations.
- **Key Actions**: Retrieves pricing data from an external API (CoinGecko). Computes rental prices per second in USD and deploys the PriceOracle contract. Sets up an exponential premium pricing oracle based on deployment arguments.

### [ETHRegistrarController Deployment](https://github.com/inc4/wns-contracts/blob/wns/deploy/ethregistrar/03_deploy_eth_registrar_controller.ts)

- **Purpose**: Manages domain registration and ownership using a controller contract.
- **Key Actions**: Deploys the ETHRegistrarController contract. Transfers ownership to the designated owner if different from the deployer. Sets the controller for NameWrapper and ReverseRegistrar. Configures interface IDs on the resolver contract.

### [BulkRenewal Deployment](https://github.com/inc4/wns-contracts/blob/wns/deploy/ethregistrar/04_deploy_bulk_renewal.ts)

- **Purpose**: Enables bulk renewal functionality for domain registrations.
- **Key Actions**: Deploys the StaticBulkRenewal contract. Sets the interface ID on the resolver contract if a resolver is set for the .wbt domain.

## Registry

### [ENSRegistry Deployment](https://github.com/inc4/wns-contracts/blob/wns/deploy/registry/00_deploy_registry.ts)

- **Purpose**: Deploy the ENSRegistry contract.
- **Key Actions**: Deploy the ENSRegistry contract with no constructor arguments. Set deployment identifiers and tags.

### [ReverseRegistrar Deployment](https://github.com/inc4/wns-contracts/blob/wns/deploy/registry/01_deploy_reverse_registrar.ts)

- **Purpose**: Deploy and configure the ReverseRegistrar contract.
- **Key Actions**: Deploy the ReverseRegistrar contract with the address of the ENSRegistry contract. Transfer ownership of ReverseRegistrar to the designated owner (if different from the deployer). Configure the .reverse subnode in the Root contract. Configure the .addr.reverse subnode in the ENSRegistry for the ReverseRegistrar.

## Resolvers

### [OwnedResolver Deployment](https://github.com/inc4/wns-contracts/blob/wns/deploy/resolvers/00_deploy_eth_owned_resolver.ts)

- **Purpose**: Deploy the OwnedResolver contract and configure it with the ENSRegistry and BaseRegistrarImplementation.
- **Key Actions**: Deploy the OwnedResolver contract. Set the resolver address in BaseRegistrarImplementation. Log the resolver address for .wbt.

### [PublicResolver Deployment](https://github.com/inc4/wns-contracts/blob/wns/deploy/resolvers/00_deploy_public_resolver.ts)

- **Purpose**: Deploy the PublicResolver contract and configure it for domain resolution.
- **Key Actions**: Deploy the PublicResolver contract with addresses of ENSRegistry, NameWrapper, ETHRegistrarController, and ReverseRegistrar. Set the default resolver in ReverseRegistrar to PublicResolver. If resolver.wbt is owned by the owner, set the resolver for resolver.wbt to PublicResolver and set its address to PublicResolver.

## Root

### [Root Contract Deployment](https://github.com/inc4/wns-contracts/blob/wns/deploy/root/00_deploy_root.ts)

- **Purpose**: Deploy the Root contract and configure it with the ENSRegistry.
- **Key Actions**: Deploy the Root contract with the ENSRegistry address. Log deployment details for transparency.

### [Root Setup](https://github.com/inc4/wns-contracts/blob/wns/deploy/root/00_setup_root.ts)

- **Purpose**: Setup and configure the Root contract post-deployment.
- **Key Actions**: Ensure the Root contract becomes the owner of the root node in ENSRegistry. Transfer ownership of the Root contract to the final designated owner if initially owned by the deployer. Set the final owner as a controller on the Root contract if necessary.

## Wrapper

### [StaticMetadataService Deployment](https://github.com/inc4/wns-contracts/blob/wns/deploy/wrapper/00_deploy_static_metadata_service.ts)

- **Purpose**: Deploy the StaticMetadataService contract for managing metadata.
- **Key Actions**: Deploy the StaticMetadataService contract with a metadata URL. Ensure deployment logs are recorded for transparency.

### [NameWrapper Deployment](https://github.com/inc4/wns-contracts/blob/wns/deploy/wrapper/01_deploy_name_wrapper.ts)

- **Purpose**: Deploy the NameWrapper contract and configure it with dependencies.
- **Key Actions**: Deploy the NameWrapper contract with dependencies on ENSRegistry, BaseRegistrarImplementation, and StaticMetadataService. Transfer ownership of NameWrapper to the designated owner if different from the deployer. Add NameWrapper as a controller on BaseRegistrarImplementation. Set interface ID for .wbt resolver using OwnedResolver if resolver is set.
