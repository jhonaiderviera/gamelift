const admin = require('firebase-admin');

// Variable para guardar las credenciales
let serviceAccount;

try {
  // CAMBIO AQUÍ: Ahora buscamos en la carpeta 'config' el archivo 'serviceAccountKey.json'
  serviceAccount = require('../config/serviceAccountKey.json');
} catch (error) {
  console.error("\n❌ ERROR CRÍTICO DE FIREBASE ❌");
  console.error("No se encontró el archivo 'serviceAccountKey.json' en la carpeta 'config'.");
  console.error("Asegúrate de que la ruta sea: GAMELIFT/config/serviceAccountKey.json\n");
  process.exit(1);
}

// Inicializamos la App solo si no ha sido inicializada antes
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("🔥 Firebase conectado correctamente (desde config).");
  } catch (error) {
    console.error("❌ Error al inicializar Firebase:", error.message);
  }
}

const db = admin.firestore();

module.exports = { admin, db };