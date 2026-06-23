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

### What the local network is

`isbe-network-case` contains a self-contained local replica of the ISBE network. It is a private QBFT blockchain running on 4 Hyperledger Besu nodes inside Docker. It is **not a testnet** — it runs entirely on your machine, with no external connectivity.

Key parameters:

| Parameter | Value |
|---|---|
| Chain ID | **11073** |
| Consensus | QBFT (Istanbul BFT) |
| EC curve | secp256k1 |
| Block time | 2 seconds |
| Gas limit | 30 000 000 |
| RPC URL | `http://localhost:8545` |

**The ISBE Governance Diamond is pre-deployed in the genesis block at `0x00000000000000000000000000000000000015BE`.** You do not need to deploy it — it is available the moment the network starts. The genesis also includes ~20 additional ISBE infrastructure contracts required for the Diamond to function.

All 40 standard Hardhat accounts come pre-funded with ~209 000 ETH equivalent. Account #0 (`0xf39F...2266`) additionally holds admin permissions on the Diamond, which is why the `.env` instructs you to use it for deployments.

> ⚠️ **Do not delete `QBFT-Network/`**. It contains the pre-generated node keys and the persistent blockchain database. Deleting it destroys the genesis state, including the pre-deployed Diamond and infrastructure contracts.

### Starting the network

```bash
cd isbe-network-case
./startNetwork.sh
```

This creates a Docker bridge network (`besu-network`, subnet `172.16.240.0/24`) and starts 4 containers:

| Container | Role | RPC port | P2P port | Metrics port |
|---|---|---|---|---|
| `bootnode` | Bootnode + RPC entry point | **8545** | 30303 | 9545 |
| `node2` | Validator | 8546 | 30304 | 9546 |
| `node3` | Validator | 8547 | 30305 | 9547 |
| `node4` | Validator | 8548 | 30306 | 9548 |

All Hardhat scripts in this repo connect to `bootnode` on port 8545. The other nodes participate in consensus but you do not need to interact with them directly.

### Verify the network is up

```bash
docker ps --filter label=project=besu
```

You should see 4 running containers. To confirm the RPC is responsive and the Diamond is accessible:

```bash
curl -s -X POST http://localhost:8545 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
# → {"result":"0x2b41",...}   (0x2b41 = 11073)

curl -s -X POST http://localhost:8545 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_getCode","params":["0x00000000000000000000000000000000000015BE","latest"],"id":1}' \
  | python3 -c "import sys,json; code=json.load(sys.stdin)['result']; print('Diamond OK, bytecode length:', len(code)//2-1, 'bytes')"
```

### Stopping the network

```bash
./stopNetwork.sh
```

This stops and removes all containers. The blockchain state in `QBFT-Network/` is preserved, so the next `./startNetwork.sh` resumes from the same state.

### Block explorer (optional)

The `isbe-network-case/explorer/` folder contains a Next.js block explorer. To run it:

```bash
cd isbe-network-case/explorer
npm install
npm run dev
```

Open `http://localhost:3000`. It connects to all 4 nodes and shows blocks, transactions, validators, and allows basic contract interaction.

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

See `contract-adaptation-guide.md` for a detailed walkthrough on adapting existing Solidity code to the ISBE Diamond structure.

---

## 3. Define your namespace and constants

The example contracts use a generic namespace in `contracts/constants/constants.sol`:

```solidity
bytes32 constant _PROJECT_STORAGE_POSITION = keccak256('isbe.customers.customer.project.storage');
bytes32 constant _PROJECT_ROLE             = keccak256('isbe.customers.customer.role.project.role');
bytes32 constant _PROJECT_RESOLVER_KEY     = keccak256('isbe.customers.customer.role.project.resolver.key');
bytes32 constant _PROJECT_CONFIG_ID        = keccak256('isbe.customers.customer.project.configuration');
```

The terms `customer`, `project` and `role` are placeholders. In a real deployment replace them with your own values using the pattern `isbe.customers.{client}.{useCase}.{thing}` — all lowercase camelCase, no version numbers. For example:

```solidity
bytes32 constant _ACME_STORAGE_POSITION = keccak256('isbe.customers.acme.invoicing.storage.position');
bytes32 constant _ACME_ROLE             = keccak256('isbe.customers.acme.invoicing.project.role');
bytes32 constant _ACME_REGISTRAR_ROLE   = keccak256('isbe.customers.acme.invoicing.project.role.registrar');
bytes32 constant _ACME_RESOLVER_KEY     = keccak256('isbe.customers.acme.invoicing.resolver.key');
bytes32 constant _ACME_CONFIG_ID        = keccak256('isbe.customers.acme.invoicing.config.id');
```

The `{client}` segment is your company/project identifier. The `{useCase}` segment identifies the specific use case in camelCase (e.g. `invoicing`, `documentRegistry`, `auditService`). Strings must be unique across the entire network — prefix consistently to avoid collisions.

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

## 4. Fill in `selectorsIntrospection()` in your facet

`ProjectFacet.sol` ships with an **empty** `selectorsIntrospection()`. This is a required customization step — if you skip it, none of your functions will be routable through the proxy.

Open `contracts/project-contracts/ProjectFacet.sol` and list every `external` function your facet exposes:

```solidity
function selectorsIntrospection()
    external pure override
    returns (bytes4[] memory selectors_)
{
    uint256 len = 3; // ← set this to the exact number of external functions
    selectors_ = new bytes4[](len);
    selectors_[--len] = this.myFunction.selector;
    selectors_[--len] = this.anotherFunction.selector;
    selectors_[--len] = this.readSomething.selector;
}
```

The count must match exactly. If a function is missing from this list it will revert with `FunctionNotFound` when called through the proxy.

---

## 5. Compile

```bash
npx hardhat compile
```

---

## 6. Deploy

```bash
npx hardhat run scripts/project/deployContracts.ts --network isbe
```

The script runs three steps automatically:

1. **`deploy`** — registers your facet bytecode in the Diamond with the resolver key
2. **`setConfiguration`** — associates the resolver key with the config ID
3. **`deployUseCase`** — deploys the proxy that routes calls to the registered facet

When finished it prints a summary with the implementation and proxy addresses.

### Configuring roles (RBAC)

The default script deploys with `rbacs: []`, which means the proxy has **no roles assigned** — every role-guarded function will revert with an access control error. Before deploying to a shared environment, populate the `rbacs` array in `deployContracts.ts`:

```typescript
const signerAddr = await signer.getAddress()

const rbacs = [
    { role: PROJECT_ROLE,     members: [signerAddr] },
    { role: REGISTRAR_ROLE,   members: [signerAddr] },
]

// Then pass rbacs to deployUseCase:
iface.encodeFunctionData('deployUseCase', [
    PROJECT_CONFIG_ID,
    0,      // version (0 = latest)
    rbacs,
    false,  // initPause
    [],
    [],
])
```

Define the role constants at the top of the script with the same strings used in `constants.sol`:

```typescript
const PROJECT_ROLE   = ethers.id('isbe.customers.acme.invoicing.project.role')
const REGISTRAR_ROLE = ethers.id('isbe.customers.acme.invoicing.project.role.registrar')
```

Roles can only be assigned once — at `deployUseCase` time — unless the address holding `DEFAULT_ADMIN_ROLE` calls `grantRole` later on the proxy.

---

## 7. Tests

```bash
npx hardhat test
```

Tests use `ProjectTestWrapper`, a contract that extends the facet with initialization and pause helpers for isolated unit testing, without needing governance infrastructure.

`ProjectTestWrapper` is abstract — your test file must deploy a concrete contract that extends it. A minimal test looks like:

```typescript
import { ethers } from 'hardhat'

describe('MyFacet', () => {
    it('does something', async () => {
        const [admin] = await ethers.getSigners()

        // Deploy the concrete test wrapper (must extend ProjectTestWrapper in a separate .sol file)
        const factory = await ethers.getContractFactory('MyFacetTestWrapper')
        const contract = await factory.deploy()

        // Initialize roles without governance infrastructure
        await contract.initializeForTest(admin.address)

        // Now call your functions normally
        await contract.connect(admin).myFunction(...)
    })
})
```

---

## 8. Verify the deployment

After deploying, connect to the proxy via Hardhat console to confirm it is working:

```bash
npx hardhat console --network isbe
```

```js
const proxy = await ethers.getContractAt(
    'ProjectFacet',
    '0x<your-proxy-address>'
)

// Should return domain data without reverting
await proxy.eip712Domain()

// Should return your resolver key
await proxy.businessIdIntrospection()
// → '0x...' (matches PROJECT_RESOLVER_KEY)

// Call a read function
await proxy.myReadFunction(...)
```

> **Note:** `businessIdIntrospection()` and `selectorsIntrospection()` are used by the governance Diamond during deployment and are not routed through the proxy's function dispatcher. Calling them on the proxy address will revert with `FunctionNotFound` — this is expected behaviour. Use the Hardhat console with the facet ABI directly, not through the proxy, to call them.

---

## What `@red-isbe/isbe-contracts` provides

Every contract in this template ultimately inherits from `DidDocumentDetailedInternal`, which is part of the `@red-isbe/isbe-contracts` npm package. It provides:

| Feature | What it gives you |
|---|---|
| `onlyRole(bytes32 role)` modifier | Reverts if `msg.sender` doesn't hold the role |
| `whenNotPaused` modifier | Reverts if the contract is paused |
| `_blockTimestamp()` | Returns the current block timestamp as `uint256` |
| `_initializeRbacs(Rbac[] memory)` | Seeds roles during `deployUseCase` (called by the Diamond) |
| `_pauseStorage()` | Direct access to the pause flag (used in test wrappers) |
| `eip712Domain()` | Returns EIP-712 domain data (name, version, chainId, verifying contract) |

Apply `whenNotPaused` and `onlyRole(...)` to every state-modifying function in `Project.sol`. Do not use OpenZeppelin `Ownable` — the ISBE role system is the only supported access control mechanism.

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

## Troubleshooting

**`DeclarationError: Undeclared identifier`** during `npx hardhat compile`
→ A constant referenced in your contracts does not exist in `constants/constants.sol`. Check spelling — the identifiers must match exactly, including the `_` prefix.

**`FunctionNotFound` when calling a function through the proxy**
→ The function is missing from `selectorsIntrospection()` in your facet. Add it and redeploy.

**`AccessControl: account 0x... is missing role 0x...` on every call**
→ The `deployUseCase` was run with an empty `rbacs` array. The proxy has no roles. Redeploy and populate `rbacs` (see the RBAC section above).

**`Event 'Deployed' not found in receipt`**
→ The transaction reverted. Most likely causes: (a) the resolver key is already registered — you cannot deploy the same resolver key twice; (b) the signer does not have deployer permissions on the Diamond.

**The network does not start (`startNetwork.sh` hangs or exits immediately)**
→ Make sure Docker is running. Check that ports 8545 and 30303 are not already in use. Check Docker logs with `docker logs <container-id>`.

**`Error: no matching fragment` when encoding a call**
→ The ABI loaded from `@red-isbe/isbe-contracts` does not match the Diamond version on-chain. Run `npm install` to ensure you have the latest package version.

---

## License

Apache-2.0
