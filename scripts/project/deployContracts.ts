import { ethers, artifacts } from 'hardhat'
import { Interface, Signer, TransactionReceipt } from 'ethers'
import { readFileSync } from 'fs'
import { join } from 'path'

// --- Constants ---------------------------------------------------------------

/** ISBE Diamond proxy (genesis) - EIP-2535 governance entry point */
const DIAMOND = '0x00000000000000000000000000000000000015BE'

/**
 * keccak256('isbe.customers.customer.role.project.resolver.key')
 * Value returned by businessIdIntrospection() in ProjectFacet.
 * 
 * These are generic values
 *  node -e "const { ethers } = require('ethers'); console.log(ethers.keccak256(ethers.toUtf8Bytes('isbe.customers.customer.role.project.resolver.key')))"
 *  
 */
const PROJECT_RESOLVER_KEY =
    '0xb4417cc44e05188951b5cfb2e3c50fc55c32aef75d6cba6bace701e21a83e8e8'

/**
 * keccak256('isbe.customers.customer.project.configuration')
 * Defined in contracts/commons/commons.sol as _PROJECT_CONFIG_ID.
 * 
 * These are generic values
 *  node -e "const { ethers } = require('ethers'); console.log(ethers.keccak256(ethers.toUtf8Bytes('isbe.customers.customer.project.configuration')))" 
 */
const PROJECT_CONFIG_ID =
    '0x5f63bb9fbe719c0975430a4152f0ef5f2337692814ad0be2e7616b7d632800fb'

// --- Helpers -----------------------------------------------------------------

function getIsbeFactoryInterface(): Interface {
    const abiPath = require.resolve(
        '@red-isbe/isbe-contracts/artifacts/contracts/factory/IIsbeFactory.sol/IIsbeFactory.json'
    )
    const { abi } = JSON.parse(readFileSync(abiPath, 'utf8')) as { abi: any[] }
    return new ethers.Interface(abi)
}

function getEventFromReceipt(
    eventName: string,
    receipt: TransactionReceipt,
    iface: Interface
) {
    for (const log of receipt.logs) {
        try {
            const parsed = iface.parseLog(log)
            if (parsed?.name === eventName) return parsed
        } catch {
            // log from another contract, ignore
        }
    }
    throw new Error(
        `Event '${eventName}' not found in receipt (block ${receipt.blockNumber})`
    )
}

// --- Deployment steps --------------------------------------------------------

async function deployBusinessLogic(
    businessId: string,
    bytecode: string,
    factory: string,
    signer: Signer,
    iface: Interface
): Promise<{ businessAddress: string; version: string }> {
    console.log('Sending deployBusinessLogic transaction...')
    const data = iface.encodeFunctionData('deploy', [businessId, bytecode])
    const tx = await signer.sendTransaction({ to: factory, data, gasLimit: 25_000_000 })
    console.log('   Transaction submitted:', tx.hash)
    console.log('Waiting for transaction to be mined...')
    const receipt = await tx.wait()
    if (!receipt || receipt.status !== 1)
        throw new Error('deployBusinessLogic transaction failed or was reverted')
    const event = getEventFromReceipt('Deployed', receipt, iface)
    const { businessAddress, version } = event.args
    return { businessAddress, version: version.toString() }
}

async function setConfig(
    configId: string,
    businessId: string,
    factory: string,
    signer: Signer,
    iface: Interface
): Promise<{ version: string }> {
    console.log('Sending setConfiguration transaction...')
    const data = iface.encodeFunctionData('setConfiguration', [
        configId,
        [{ businessId, version: 1 }],
    ])
    const tx = await signer.sendTransaction({ to: factory, data, gasLimit: 25_000_000 })
    console.log('   Transaction submitted:', tx.hash)
    console.log('Waiting for transaction to be mined...')
    const receipt = await tx.wait()
    if (!receipt || receipt.status !== 1)
        throw new Error('setConfiguration transaction failed or was reverted')
    const event = getEventFromReceipt('ConfigurationSet', receipt, iface)
    const { version } = event.args
    return { version: version.toString() }
}

async function deployUseCase(
    configId: string,
    factory: string,
    signer: Signer,
    iface: Interface
): Promise<{ proxy: string }> {
    console.log('Sending deployUseCase transaction...')
    const data = iface.encodeFunctionData('deployUseCase', [
        configId,
        0,     // version (0 = latest)
        [],    // rbacs
        false, // initPause
        [],    // initBusinessIds
        [],    // initData
    ])
    const tx = await signer.sendTransaction({ to: factory, data, gasLimit: 25_000_000 })
    console.log('   Transaction submitted:', tx.hash)
    console.log('Waiting for transaction to be mined...')
    const receipt = await tx.wait()
    if (!receipt || receipt.status !== 1)
        throw new Error('deployUseCase transaction failed or was reverted')
    const event = getEventFromReceipt('UseCaseDeployed', receipt, iface)
    const { proxy } = event.args
    return { proxy }
}

// --- Main --------------------------------------------------------------------

async function main() {
    const [signer] = await ethers.getSigners()
    console.log('Deploying with account:', signer.address)

    const network = await ethers.provider.getNetwork()
    console.log('Network: isbe | Chain ID:', network.chainId.toString())
    console.log('Diamond address:', DIAMOND)

    const iface = getIsbeFactoryInterface()

    const projectArtifact = await artifacts.readArtifact('ProjectFacet')
    const projectBytecode = projectArtifact.bytecode
    console.log('\nProjectFacet bytecode loaded:', projectBytecode.length / 2 - 1, 'bytes')

    // Step 1: Register business logic
    console.log('\n[1/3] Registering ProjectFacet as business logic...')
    console.log('   Resolver key:', PROJECT_RESOLVER_KEY)
    const { businessAddress, version: blVersion } = await deployBusinessLogic(
        PROJECT_RESOLVER_KEY, projectBytecode, DIAMOND, signer, iface
    )
    console.log('   Business logic registered')
    console.log('   Implementation:', businessAddress)
    console.log('   Version:', blVersion)

    // Step 2: Set configuration
    console.log('\n[2/3] Setting use case configuration...')
    console.log('   Config ID:', PROJECT_CONFIG_ID)
    const { version: configVersion } = await setConfig(
        PROJECT_CONFIG_ID, PROJECT_RESOLVER_KEY, DIAMOND, signer, iface
    )
    console.log('   Configuration set, version:', configVersion)

    // Step 3: Deploy proxy
    console.log('\n[3/3] Deploying use case proxy...')
    const { proxy } = await deployUseCase(PROJECT_CONFIG_ID, DIAMOND, signer, iface)
    console.log('   Use case proxy deployed')
    console.log('   Proxy address:', proxy)

    // Summary
    console.log('\nDeployment complete!')
    console.log('-------------------------------------------------------------')
    console.log('  Diamond (governance):  ', DIAMOND)
    console.log('  Resolver key:          ', PROJECT_RESOLVER_KEY)
    console.log('  Config ID:             ', PROJECT_CONFIG_ID)
    console.log('  Implementation:        ', businessAddress)
    console.log('  PROJECT proxy:     ', proxy)
    console.log('-------------------------------------------------------------')
}

main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
})