# isbe-clients-template

Plantilla para desplegar contratos inteligentes propios en una red local de ISBE.

Este repositorio incluye todo lo necesario para: levantar una red ISBE local con Docker, escribir y compilar contratos Solidity, y desplegarlos en la red mediante el patrón Diamond (EIP-2535).

Para más información sobre ISBE, consulta la documentación oficial: [Red ISBE](https://docs.redisbe.com/documentation/)

---

## Requisitos previos

- [Node.js](https://nodejs.org/) >= 18
- [Docker](https://www.docker.com/) instalado y en ejecución
- [`jq`](https://stedolan.github.io/jq/) — procesador JSON usado por los scripts de red
  - macOS: `brew install jq`
  - Ubuntu/Debian: `apt-get install jq`

---

## Estructura del proyecto

```
contracts/
  constants/                   — constantes compartidas (roles, storage slots, config IDs)
  project-contracts/         — contratos de ejemplo: sustituir por los propios
  testwrapper/               — wrapper para tests unitarios
scripts/
  deployContracts.ts         — script de despliegue Diamond en tres pasos
isbe-network-case/           — entorno de red local ISBE (Docker + Besu)
  startNetwork.sh            — arranca la red
  stopNetwork.sh             — para la red
  QBFT-Network/              — datos de los nodos (claves, génesis, etc.)
```

---

## Instalación

```bash
npm install
```

Copia el archivo de variables de entorno y rellena los valores:

```bash
cp .env_sample .env
```

Edita `.env` con las credenciales de **Account #0 de Hardhat**:

```env
ACCOUNT_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
ACCOUNT_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
LOCALHOST_URL=http://localhost:8545
```

> Es necesario utilizar Account #0 porque es la cuenta pre-financiada en el génesis de la red local con permisos de administrador para el despliegue.
>
> ⚠️ Estas credenciales son públicas y solo válidas para desarrollo local. **Nunca las uses en mainnet ni en ningún entorno con valor real.**


---

## 1. Levantar la red local

### Qué es la red local

`isbe-network-case` contiene una réplica local y autónoma de la red ISBE. Es una blockchain privada QBFT que corre sobre 4 nodos Hyperledger Besu dentro de Docker. **No es un testnet** — funciona completamente en tu máquina, sin conectividad externa.

Parámetros clave:

| Parámetro | Valor |
|---|---|
| Chain ID | **11073** |
| Consenso | QBFT (Istanbul BFT) |
| Curva EC | secp256k1 |
| Tiempo de bloque | 2 segundos |
| Gas limit | 30 000 000 |
| RPC URL | `http://localhost:8545` |

**El Diamond de gobernanza de ISBE está pre-desplegado en el bloque génesis en `0x00000000000000000000000000000000000015BE`.** No necesitas desplegarlo — está disponible en el momento en que la red arranca. El génesis también incluye ~20 contratos de infraestructura adicionales necesarios para que el Diamond funcione.

Las 40 cuentas estándar de Hardhat vienen pre-financiadas con ~209 000 ETH equivalente. La cuenta #0 (`0xf39F...2266`) tiene adicionalmente permisos de administrador sobre el Diamond, que es por eso que el `.env` indica usarla para los despliegues.

> ⚠️ **No borres `QBFT-Network/`**. Contiene las claves pre-generadas de los nodos y la base de datos persistente de la blockchain. Borrarlo destruye el estado génesis, incluyendo el Diamond pre-desplegado y los contratos de infraestructura.

### Arrancar la red

```bash
cd isbe-network-case
./startNetwork.sh
```

Esto crea una red Docker bridge (`besu-network`, subred `172.16.240.0/24`) y arranca 4 contenedores:

| Contenedor | Rol | Puerto RPC | Puerto P2P | Puerto Métricas |
|---|---|---|---|---|
| `bootnode` | Bootnode + punto de entrada RPC | **8545** | 30303 | 9545 |
| `node2` | Validador | 8546 | 30304 | 9546 |
| `node3` | Validador | 8547 | 30305 | 9547 |
| `node4` | Validador | 8548 | 30306 | 9548 |

Todos los scripts Hardhat de este repositorio se conectan al `bootnode` en el puerto 8545. Los demás nodos participan en el consenso pero no necesitas interactuar con ellos directamente.

### Verificar que la red está en marcha

```bash
docker ps --filter label=project=besu
```

Deberías ver 4 contenedores en ejecución. Para confirmar que el RPC responde y el Diamond está accesible:

```bash
curl -s -X POST http://localhost:8545 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
# → {"result":"0x2b41",...}   (0x2b41 = 11073)

curl -s -X POST http://localhost:8545 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_getCode","params":["0x00000000000000000000000000000000000015BE","latest"],"id":1}' \
  | python3 -c "import sys,json; code=json.load(sys.stdin)['result']; print('Diamond OK, longitud bytecode:', len(code)//2-1, 'bytes')"
```

### Parar la red

```bash
./stopNetwork.sh
```

Detiene y elimina todos los contenedores. El estado de la blockchain en `QBFT-Network/` se conserva, por lo que el siguiente `./startNetwork.sh` retoma desde el mismo estado.

### Block explorer (opcional)

La carpeta `isbe-network-case/explorer/` contiene un block explorer en Next.js. Para arrancarlo:

```bash
cd isbe-network-case/explorer
npm install
npm run dev
```

Abre `http://localhost:3000`. Se conecta a los 4 nodos y muestra bloques, transacciones, validadores y permite interacción básica con contratos.

---

## 2. Añadir los contratos propios

Los contratos de ejemplo en `contracts/project-contracts/` sirven como referencia para pruebas en local. A la hora de integrar los contratos propios hay dos opciones:

**Opción A — Renombrar los contratos propios para encajar en la estructura de ejemplo.** Renombra tus contratos a `ProjectFacet`, `ProjectInternal`, etc. De este modo el script de despliegue y los constants apenas necesitan cambios.

**Opción B — Sustituir la estructura entera.** Borra los contratos de ejemplo y coloca los tuyos con su propia nomenclatura. En este caso hay que actualizar también el script de despliegue y los constants para que los nombres coincidan.

En cualquier caso los pasos son:

1. Coloca tus contratos en `contracts/`
2. Actualiza `contracts/constants/constants.sol` con las constantes de tu proyecto (ver sección siguiente)
3. Actualiza el nombre del facet en `scripts/project/deployContracts.ts` (línea `artifacts.readArtifact('ProjectFacet')`)
4. Calcula y rellena las constantes del script de despliegue (ver sección siguiente)

En el fichero `guia-adaptacion-contratos.md` puedes encontrar más detalles sobre cómo adaptar tu código de smart contracts para que tengan la estructura del diamante de ISBE.

---

## 3. Definir el namespace y las constantes

Los contratos de ejemplo usan un namespace genérico en `contracts/constants/constants.sol`:

```solidity
bytes32 constant _PROJECT_STORAGE_POSITION = keccak256('isbe.customers.customer.project.storage');
bytes32 constant _PROJECT_ROLE             = keccak256('isbe.customers.customer.role.project.role');
bytes32 constant _PROJECT_RESOLVER_KEY     = keccak256('isbe.customers.customer.role.project.resolver.key');
bytes32 constant _PROJECT_CONFIG_ID        = keccak256('isbe.customers.customer.project.configuration');
```

Los términos `customer`, `project` y `role` son placeholders. En un despliegue real hay que sustituirlos siguiendo el patrón `isbe.customers.{cliente}.{casoDeUso}.{cosa}` — todo en camelCase, sin números de versión. Por ejemplo:

```solidity
bytes32 constant _ACME_STORAGE_POSITION = keccak256('isbe.customers.acme.invoicing.storage.position');
bytes32 constant _ACME_ROLE             = keccak256('isbe.customers.acme.invoicing.project.role');
bytes32 constant _ACME_REGISTRAR_ROLE   = keccak256('isbe.customers.acme.invoicing.project.role.registrar');
bytes32 constant _ACME_RESOLVER_KEY     = keccak256('isbe.customers.acme.invoicing.resolver.key');
bytes32 constant _ACME_CONFIG_ID        = keccak256('isbe.customers.acme.invoicing.config.id');
```

El segmento `{cliente}` es el identificador de tu empresa/proyecto. El segmento `{casoDeUso}` identifica el caso de uso específico en camelCase (p.ej. `invoicing`, `documentRegistry`, `auditService`). Las cadenas deben ser únicas en toda la red — usa siempre el mismo prefijo para evitar colisiones.

Una vez definido el namespace, hay que calcular los valores hash para el script de despliegue:

```typescript
const PROJECT_RESOLVER_KEY = '' // keccak256 del resolver key de tu facet
const PROJECT_CONFIG_ID = ''    // keccak256 del config ID de tu proyecto
```

Puedes calcularlos con Node.js:

```bash
node -e "const { ethers } = require('ethers'); console.log(ethers.keccak256(ethers.toUtf8Bytes('isbe.customers.acme.role.invoicing.resolver.key')))"
```

Los valores deben coincidir exactamente con los definidos en `contracts/constants/constants.sol`.

---

## 4. Rellenar `selectorsIntrospection()` en el facet

`ProjectFacet.sol` viene con `selectorsIntrospection()` **vacío**. Este es un paso de personalización obligatorio — si no se rellena, ninguna función será enrutable a través del proxy.

Abre `contracts/project-contracts/ProjectFacet.sol` y lista todas las funciones `external` que expone tu facet:

```solidity
function selectorsIntrospection()
    external pure override
    returns (bytes4[] memory selectors_)
{
    uint256 len = 3; // ← ajusta al número exacto de funciones externas
    selectors_ = new bytes4[](len);
    selectors_[--len] = this.miFuncion.selector;
    selectors_[--len] = this.otraFuncion.selector;
    selectors_[--len] = this.leerAlgo.selector;
}
```

El número debe coincidir exactamente. Si falta una función, revertirá con `FunctionNotFound` cuando se llame a través del proxy.

---

## 5. Compilar

```bash
npx hardhat compile
```

---

## 6. Desplegar

```bash
npx hardhat run scripts/project/deployContracts.ts --network isbe
```

El script realiza tres pasos automáticamente:

1. **`deploy`** — registra el bytecode de tu facet en el Diamond con el resolver key
2. **`setConfiguration`** — asocia el resolver key con el config ID
3. **`deployUseCase`** — despliega el proxy que enruta al facet registrado

Al finalizar muestra un resumen con las direcciones de la implementación y del proxy.

### Configurar roles (RBAC)

El script por defecto despliega con `rbacs: []`, lo que significa que el proxy **no tiene ningún rol asignado** — cualquier función con guard de acceso revertirá con un error de control de acceso. Antes de desplegar en un entorno compartido, rellena el array `rbacs` en `deployContracts.ts`:

```typescript
const signerAddr = await signer.getAddress()

const rbacs = [
    { role: PROJECT_ROLE,   members: [signerAddr] },
    { role: REGISTRAR_ROLE, members: [signerAddr] },
]

// Pasa rbacs a deployUseCase:
iface.encodeFunctionData('deployUseCase', [
    PROJECT_CONFIG_ID,
    0,      // version (0 = latest)
    rbacs,
    false,  // initPause
    [],
    [],
])
```

Define las constantes de rol en la parte superior del script con las mismas cadenas usadas en `constants.sol`:

```typescript
const PROJECT_ROLE   = ethers.id('isbe.customers.acme.invoicing.project.role')
const REGISTRAR_ROLE = ethers.id('isbe.customers.acme.invoicing.project.role.registrar')
```

Los roles solo se pueden asignar en el momento de `deployUseCase`, salvo que la dirección con `DEFAULT_ADMIN_ROLE` llame a `grantRole` más tarde en el proxy.

---

## 7. Tests

```bash
npx hardhat test
```

Los tests usan `ProjectTestWrapper`, un contrato que extiende el facet con helpers de inicialización y pausa para pruebas unitarias aisladas, sin necesidad de infraestructura de gobernanza.

`ProjectTestWrapper` es `abstract` — el fichero de test debe desplegar un contrato concreto que lo extienda. Un test mínimo:

```typescript
import { ethers } from 'hardhat'

describe('MiFacet', () => {
    it('hace algo', async () => {
        const [admin] = await ethers.getSigners()

        // Despliega el wrapper concreto (debe extender ProjectTestWrapper en un .sol separado)
        const factory = await ethers.getContractFactory('MiFacetTestWrapper')
        const contract = await factory.deploy()

        // Inicializa los roles sin infraestructura de gobernanza
        await contract.initializeForTest(admin.address)

        // Ahora llama a tus funciones normalmente
        await contract.connect(admin).miFuncion(...)
    })
})
```

---

## 8. Verificar el despliegue

Tras desplegar, conéctate al proxy desde la consola de Hardhat para confirmar que funciona:

```bash
npx hardhat console --network isbe
```

```js
const proxy = await ethers.getContractAt(
    'ProjectFacet',
    '0x<tu-direccion-de-proxy>'
)

// Debe devolver los datos de dominio sin revertir
await proxy.eip712Domain()

// Llama a una función de lectura
await proxy.miFuncionDeLectura(...)
```

> **Nota:** `businessIdIntrospection()` y `selectorsIntrospection()` son usados por el Diamond de gobernanza durante el despliegue y no están enrutados a través del dispatcher de funciones del proxy. Llamarlos en la dirección del proxy revertirá con `FunctionNotFound` — este es el comportamiento esperado.

---

## Qué proporciona `@red-isbe/isbe-contracts`

Todos los contratos de esta plantilla heredan en última instancia de `DidDocumentDetailedInternal`, que forma parte del paquete npm `@red-isbe/isbe-contracts`. Proporciona:

| Elemento | Qué ofrece |
|---|---|
| `onlyRole(bytes32 role)` modifier | Revierte si `msg.sender` no tiene el rol |
| `whenNotPaused` modifier | Revierte si el contrato está pausado |
| `_blockTimestamp()` | Devuelve el timestamp del bloque actual como `uint256` |
| `_initializeRbacs(Rbac[] memory)` | Asigna los roles durante `deployUseCase` (llamado por el Diamond) |
| `_pauseStorage()` | Acceso directo al flag de pausa (usado en test wrappers) |
| `eip712Domain()` | Devuelve los datos de dominio EIP-712 (nombre, versión, chainId, contrato) |

Aplica `whenNotPaused` y `onlyRole(...)` a todas las funciones que modifican estado en `Project.sol`. No uses `Ownable` de OpenZeppelin — el sistema de roles de ISBE es el único mecanismo de control de acceso soportado.

---

## Cómo funciona el patrón Diamond en ISBE

La red ISBE tiene un proxy Diamond en una dirección fija de génesis:

```
0x00000000000000000000000000000000000015BE
```

Este proxy enruta las llamadas a los facets registrados. Al desplegar un caso de uso no se despliega un contrato de forma directa — se registra la implementación en el Diamond y este crea el proxy. Eso significa que:

- La dirección del proxy la asigna el Diamond, no el deployer
- El storage del contrato persiste entre actualizaciones
- Para actualizar la lógica basta con registrar una nueva versión del bytecode (pasos 1 y 2) sin redesplegar el proxy

---

## Ejemplo: HashTimestamp

La carpeta `contracts/example-hashtimestamp/` contiene un caso de uso completo y funcional que sirve como referencia de cómo debería quedar un proyecto real adaptado a esta plantilla.

`HashTimestampFacet` es un facet que permite registrar hashes en blockchain junto con su timestamp. Una vez registrado un hash, queda sellado con la marca de tiempo del bloque y no puede volver a registrarse. Expone tres funciones: `timestampHash`, `exists` y `getTimestamp`.

La estructura del ejemplo sigue exactamente el mismo patrón que se espera de cualquier proyecto real:

```
contracts/
  constants/constants.sol                              — constantes del ejemplo añadidas al constants compartido
  example-hashtimestamp/
    IHashTimestamp.sol                             — interfaz pública
    HashTimestampInternal.sol                      — lógica y storage internos
    HashTimestamp.sol                              — contrato abstracto con las funciones externas
    HashTimestampFacet.sol                         — facet Diamond con introspección EIP-2535
  testwrapper/hashtimestamp/
    HashTimestampTestWrapper.sol                   — wrapper para tests unitarios
scripts/
  hashtimestamp/
    deployHashTimestamp.ts                         — script de despliegue del ejemplo
```

Para desplegar el ejemplo en la red local:

```bash
npx hardhat run scripts/hashtimestamp/deployHashTimestamp.ts --network isbe
```

Al adaptar esta plantilla a un proyecto propio, este ejemplo muestra concretamente qué hay que hacer en cada archivo: dónde definir el storage, cómo implementar la introspección EIP-2535, cómo añadir las constantes al constants, y cómo ajustar el script de despliegue con el namespace y los hashes correctos.

---

## Solución de problemas

**`DeclarationError: Undeclared identifier`** al ejecutar `npx hardhat compile`
→ Una constante referenciada en los contratos no existe en `constants/constants.sol`. Comprueba la ortografía — los identificadores deben coincidir exactamente, incluido el prefijo `_`.

**`FunctionNotFound` al llamar a una función a través del proxy**
→ La función no está en `selectorsIntrospection()` del facet. Añádela y redesplega.

**`AccessControl: account 0x... is missing role 0x...` en cada llamada**
→ El `deployUseCase` se ejecutó con `rbacs: []`. El proxy no tiene roles. Redesplega y rellena `rbacs` (ver la sección RBAC más arriba).

**`Event 'Deployed' not found in receipt`**
→ La transacción revertió. Causas más probables: (a) el resolver key ya está registrado — no se puede desplegar el mismo resolver key dos veces; (b) el signer no tiene permisos de deployer en el Diamond.

**La red no arranca (`startNetwork.sh` se queda colgado o sale inmediatamente)**
→ Asegúrate de que Docker está en ejecución. Comprueba que los puertos 8545 y 30303 no están ya en uso. Revisa los logs de Docker con `docker logs <container-id>`.

**`Error: no matching fragment` al codificar una llamada**
→ El ABI cargado desde `@red-isbe/isbe-contracts` no coincide con la versión del Diamond en cadena. Ejecuta `npm install` para asegurarte de tener la última versión del paquete.

---

## Licencia

Apache-2.0