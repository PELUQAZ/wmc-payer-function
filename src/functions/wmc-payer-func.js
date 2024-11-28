const { app } = require('@azure/functions');
const { ethers } = require("ethers");
// Cargar las variables de entorno
require('dotenv').config();

// Configuración del contrato y blockchain
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS; // Dirección de tu contrato desplegado
const CONTRACT_ABI = JSON.parse(process.env.CONTRACT_ABI); // Reemplaza con el ABI de tu contrato
const RPC_URL = process.env.RPC_URL; // URL del nodo (configurado en local.settings.json)
const PRIVATE_KEY = process.env.PRIVATE_KEY; // Clave privada de la wallet autorizada (en local.settings.json)

// Verificar que las variables de entorno estén configuradas correctamente
if (!CONTRACT_ADDRESS || !CONTRACT_ABI || !RPC_URL || !PRIVATE_KEY) {
    throw new Error("Faltan variables de entorno en local.settings.json.");
}

console.log(`CONTRACT_ADDRESS = ${CONTRACT_ADDRESS}`);
console.log(`CONTRACT_ABI = ${CONTRACT_ABI}`);
console.log(`RPC_URL = ${RPC_URL}`);
console.log(`PRIVATE_KEY = ${PRIVATE_KEY}`);

// Configuración de la conexión y contrato
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

// Manejador de la Azure Function
app.timer('wmc-payer-func', {
    //schedule: '*/1 * * * * *', //'0 */5 * * * *', // Actualmente se ejecuta cada 5 minutos (ajústalo a diario si es necesario) // Se activa solo para pruebas
    handler: async (myTimer, context) => {
        context.log('Función programada activada el ', new Date().toISOString());

        try {
            // IDs de prueba (estos serán dinámicos en producción, por ejemplo, desde una API)
            const agreementIds = [4]; // Ejemplo de IDs de acuerdos

            context.log(`Procesando el lote de acuerdos: ${agreementIds}`);

            context.log(`contract = ${contract.address}`);

            //Estimar gas para la transacción
            const gasEstimate = await contract.estimateGas.processAgreementsBatch(agreementIds);
            context.log(`Estimando gas`);

            // Llamar a la función `processAgreementsBatch` del contrato
            const tx = await contract.processAgreementsBatch(
                agreementIds,
                {
                    gasLimit: gasEstimate.toNumber() + 100000, // Ajusta según sea necesario
                    maxPriorityFeePerGas: ethers.utils.parseUnits("30", "gwei"), // Tarifa de prioridad mínima requerida
                    maxFeePerGas: ethers.utils.parseUnits("60", "gwei") // Tarifa máxima total de gas
                });
            context.log(`Transacción enviada. Hash: ${tx.hash}`);

            // Esperar la confirmación de la transacción
            const receipt = await tx.wait();
            context.log(`Transacción confirmada. Hash: ${receipt.transactionHash}`);
        } catch (error) {
            context.error(`Error al procesar los acuerdos: ${error.message}`);
        }
    }
});
