# isbe-clients-template

Template for deploying custom smart contracts on a local ISBE network.

This repository includes everything you need to: spin up a local ISBE network with Docker, write and compile Solidity contracts, and deploy them using the Diamond pattern (EIP-2535).

For more information about ISBE, see the official documentation: [Red ISBE](https://docs.redisbe.com/documentation/)

---

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Docker](https://www.docker.com/) installed and running
- [`jq`](https://stedolan.github.io/jq/) — JSON processor used by the network scripts
  - macOS: `brew install jq`
  - Ubuntu/Debian: `apt-get install jq`

---

## Project structure

```
contracts/
  constants/                   — shared constants (roles, storage slots, config IDs)
  project-contracts/           — example contracts: replace with your own
  testwrapper/                 — wrapper for unit tests
scripts/
  deployContracts.ts           — three-step Diamond deployment script
isbe-network-case/             — local ISBE network environment (Docker + Besu)
  startNetwork.sh              — starts the network
  stopNetwork.sh               — stops the network
  QBFT-Network/                — node data (keys, genesis, etc.)
```

---

## Installation

```bash
npm install
```

Copy the environment file and fill in the values:

```bash
cp .env_sample .env
```

Edit `.env` with the **Hardhat Account #0** credentials:

```env
ACCOUNT_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
ACCOUNT_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
LOCALHOST_URL=http://localhost:8545
```

> Account #0 must be used because it is the pre-funded account in the local network genesis with admin permissions for deployment.
>
> ⚠️ These credentials are public and only valid for local development. **Never use them on mainnet or any environment with real value.**

---

## 1. Start the local network

From the `isbe-network-case` folder:

```bash
cd isbe-network-case
./startNetwork.sh
```

This starts 4 Besu nodes with QBFT via Docker. To check they are running:

```bash
docker ps
```

To stop the network:

```bash
./stopNetwork.sh
```

---

## 2. Add your own contracts

The example contracts in `contracts/project-contracts/` serve as a reference for local testing. When integrating your own contracts there are two options:

**Option A — Rename your contracts to fit the example structure.** Rename your contracts to `ProjectFacet`, `ProjectInternal`, etc. This way the deployment script and constants need minimal changes.

**Option B — Replace the entire structure.** Delete the example contracts and place yours with your own naming convention. In this case you also need to update the deployment script and constants to match the new names.

In either case the steps are:

1. Place your contracts in `contracts/`
2. Update `contracts/constants/constants.sol` with your project constants (see next section)
3. Update the facet name in `scripts/project/deployContracts.ts` (line `artifacts.readArtifact('ProjectFacet')`)
4. Calculate and fill in the constants in the deployment script (see next section)

See `Adaptacion.md` for more details on how to adapt your smart contract code to the ISBE Diamond structure.

---

## 3. Define your namespace and constants

The example contracts use a generic namespace in `contracts/constants/constants.sol`:

```solidity
bytes32 constant _PROJECT_STORAGE_POSITION = keccak256('isbe.customers.customer.project.storage');
bytes32 constant _PROJECT_ROLE             = keccak256('isbe.customers.customer.role.project.role');
bytes32 constant _PROJECT_RESOLVER_KEY     = keccak256('isbe.customers.customer.role.project.resolver.key');
bytes32 constant _PROJECT_CONFIG_ID        = keccak256('isbe.customers.customer.project.configuration');
```

The terms `customer`, `project` and `role` are placeholders. In a real deployment replace them with your own values: company name, project name, and role name. For example:

```solidity
bytes32 constant _ACME_STORAGE_POSITION = keccak256('isbe.customers.acme.invoicing.storage');
bytes32 constant _ACME_ROLE             = keccak256('isbe.customers.acme.role.invoicing.manager');
bytes32 constant _ACME_RESOLVER_KEY     = keccak256('isbe.customers.acme.role.invoicing.resolver.key');
bytes32 constant _ACME_CONFIG_ID        = keccak256('isbe.customers.acme.invoicing.configuration');
```

Once the namespace is defined, calculate the hash values for the deployment script:

```typescript
const PROJECT_RESOLVER_KEY = '' // keccak256 of your facet's resolver key
const PROJECT_CONFIG_ID = ''    // keccak256 of your project's config ID
```

You can calculate them with Node.js:

```bash
node -e "const { ethers } = require('ethers'); console.log(ethers.keccak256(ethers.toUtf8Bytes('isbe.customers.acme.role.invoicing.resolver.key')))"
```

The values must match exactly what is defined in `contracts/constants/constants.sol`.

---

## 4. Compile

```bash
npx hardhat compile
```

---

## 5. Deploy

```bash
npx hardhat run scripts/project/deployContracts.ts --network isbe
```

The script runs three steps automatically:

1. **`deploy`** — registers your facet bytecode in the Diamond with the resolver key
2. **`setConfiguration`** — associates the resolver key with the config ID
3. **`deployUseCase`** — deploys the proxy that routes calls to the registered facet

When finished it prints a summary with the implementation and proxy addresses.

---

## Tests

```bash
npx hardhat test
```

Tests use `ProjectTestWrapper`, a contract that extends the facet with initialization and pause helpers for isolated unit testing, without needing governance infrastructure.

---

## How the Diamond pattern works in ISBE

The ISBE network has a Diamond proxy at a fixed genesis address:

```
0x00000000000000000000000000000000000015BE
```

This proxy routes calls to registered facets. When deploying a use case you do not deploy a contract directly — you register the implementation in the Diamond and it creates the proxy. This means:

- The proxy address is assigned by the Diamond, not the deployer
- Contract storage persists across upgrades
- To upgrade the logic, simply register a new version of the bytecode (steps 1 and 2) without redeploying the proxy

---

## Example: HashTimestamp

The `contracts/example-hashtimestamp/` folder contains a complete, working use case that serves as a reference for how a real project adapted to this template should look.

`HashTimestampFacet` is a facet that allows registering hashes on-chain with their timestamp. Once a hash is registered it is sealed with the block timestamp and cannot be registered again. It exposes three functions: `timestampHash`, `exists` and `getTimestamp`.

The example structure follows exactly the same pattern expected of any real project:

```
contracts/
  constants/constants.sol                          — example constants added to the shared constants file
  example-hashtimestamp/
    IHashTimestamp.sol                             — public interface
    HashTimestampInternal.sol                      — internal logic and storage
    HashTimestamp.sol                              — abstract contract with external functions
    HashTimestampFacet.sol                         — Diamond facet with EIP-2535 introspection
  testwrapper/hashtimestamp/
    HashTimestampTestWrapper.sol                   — wrapper for unit tests
scripts/
  hashtimestamp/
    deployHashTimestamp.ts                         — example deployment script
```

To deploy the example on the local network:

```bash
npx hardhat run scripts/hashtimestamp/deployHashTimestamp.ts --network isbe
```

When adapting this template to your own project, this example shows concretely what to do in each file: where to define storage, how to implement EIP-2535 introspection, how to add constants, and how to adjust the deployment script with the correct namespace and hashes.

---

## License

Apache-2.0
