const admin = require("firebase-admin");

// IMPORTANTE: Usamos "../" para salir de la carpeta 'services'
// y buscar en la carpeta 'config'.
const serviceAccount = require("../config/serviceAccountKey.json");

// Inicializar Firebase solo si no existe ya una instancia (Evita errores al reiniciar)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

console.log("🔥 Firebase Admin conectado correctamente");

module.exports = { db };