const { app } = require('@azure/functions');
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path"); // Para manejar rutas de manera segura en diferentes sistemas operativos
// Cargar las variables de entorno
require('dotenv').config();

// Configuración del contrato y blockchain
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS; // Dirección de tu contrato desplegado
const RPC_URL = process.env.RPC_URL; // URL del nodo (configurado en local.settings.json)
const PRIVATE_KEY = process.env.PRIVATE_KEY; // Clave privada de la wallet autorizada (en local.settings.json)
//const CONTRACT_ABI = JSON.parse(process.env.CONTRACT_ABI); // Reemplaza con el ABI de tu contrato
// Cargar el ABI desde el archivo JSON
const abiPath = path.join(__dirname, "abis", "WMCAgreementManagement.json"); // Ruta al archivo ABI Polygon
//console.log(`abiPath = ${abiPath}`);
let CONTRACT_ABI;

try {
    const abiFile = fs.readFileSync(abiPath, "utf8"); // Leer el archivo ABI
    const abiJson = JSON.parse(abiFile); // Convertir el contenido a objeto JSON
    if (!Array.isArray(abiJson.abi)) {
        throw new Error("El ABI cargado no es un array válido.");
    }
    // Asignar el ABI
    CONTRACT_ABI = abiJson.abi;
} catch (error) {
    throw new Error(`Error al leer el archivo ABI desde ${abiPath}: ${error.message}`);
}

// Verificar que las variables de entorno estén configuradas correctamente
if (!CONTRACT_ADDRESS || !CONTRACT_ABI || !RPC_URL || !PRIVATE_KEY) {
    throw new Error("Faltan variables de entorno en local.settings.json.");
}

//console.log(`CONTRACT_ADDRESS = ${CONTRACT_ADDRESS}`);
//console.log(`CONTRACT_ABI = ${CONTRACT_ABI}`);
console.log(`RPC_URL = ${RPC_URL}`);

// Configuración de la conexión y contrato
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
console.log("Wallet inicializado correctamente:", wallet.address);
const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
console.log("Contrato inicializado correctamente:", contract.address);

//console.log("Verificando funciones del contrato...");
//console.log("Object.keys(contract.functions) = ", Object.keys(contract.functions));

// Manejador de la Azure Function
app.timer('wmc-payer-func', { 
    // '*/1 * * * * *', //Cada segundo 
    //'0 * * * * *', //Cada minuto 
    //'0 0 * * * *', //Cada hora  
    //'0 0 */12 * * *', //Cada 12 horas
    //'0 0 0 * * *', //Cada 24 horas a las 12:00 am
    schedule: '0 0 5 * * *', //Cada 24 horas a las 5:00 am (12am hora Colombia)
    handler: async (myTimer, context) => {
        context.log('Función programada activada el ', new Date().toISOString());
        context.log('');
        try {
            // IDs de prueba (estos serán dinámicos en producción, por ejemplo, desde una API)
            //const agreementIds = [0,1,2,3,4,5,6,7,8,9,10]; // Ejemplo de IDs de acuerdos
            //TODO: Por ahora la función pagará todos los acuerdos del 0 al 1000 (los que ya haya pagado, no los pagará de nevo), 
            //      mientras se implementa el query de los IDs que se deban pagar cada día.
            //TODO: Implementar y probar realmente el pago por lotes, pueden ser lotes de a 10 acuerdos siempre o 50
            const agreementIds = Array.from({ length: 51 }, (_, i) => i);

            if (agreementIds.length > 0) {

                context.log(`Procesando el lote de acuerdos: ${agreementIds}`);
                context.log(`contract = ${contract.address}`);

                try {
                    const networkTest = await provider.getNetwork();
                    console.log("Conexión exitosa. Red:", networkTest);
                } catch (error) {
                    console.error("Error conectandose al nodo:", error.message);
                }

                const txData = await contract.callStatic.processAgreementsBatch(agreementIds);
                console.log("Resultado de processAgreementsBatch:", txData);

                //Estimar gas para la transacción
                const gasEstimate = await contract.estimateGas.processAgreementsBatch(agreementIds); //agreementIds
                context.log(`Estimando gas`);

                // Llamar a la función `processAgreementsBatch` del contrato
                const tx = await contract.processAgreementsBatch(
                    agreementIds,
                    {
                        gasLimit: gasEstimate.toNumber() + 100000, // Ajusta según sea necesario
                        maxPriorityFeePerGas: ethers.utils.parseUnits("30", "gwei"), // Tarifa de prioridad mínima requerida
                        maxFeePerGas: ethers.utils.parseUnits("60", "gwei") // Tarifa máxima total de gas
                    });
                context.log(`Transaccion enviada. Hash: ${tx.hash}`);

                //const txReceipt = await provider.waitForTransaction(tx.hash, 1, 60000); // Espera máximo 60 segundos
                //console.log("Transaccion confirmada:", txReceipt);

                // Esperar la confirmación de la transacción
                const receipt = await tx.wait();
                context.log(`Transacción confirmada. Hash: ${receipt.transactionHash}`);
            }
        } catch (error) {
            context.error(`Error al procesar los acuerdos: ${error.message}`);
        }
    }
});
