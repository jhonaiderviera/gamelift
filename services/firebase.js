// SDK de Firebase Admin — nos da acceso a Firestore, Auth, etc. desde el servidor
const admin = require('firebase-admin');

// Variable para guardar las credenciales del service account
// Primero intenta cargar el archivo JSON (desarrollo local),
// si no existe, usa la variable de entorno FIREBASE_SERVICE_ACCOUNT (produccion/Render)
let serviceAccount;

try {
  serviceAccount = require('../config/serviceAccountKey.json');
  console.log("🔑 Firebase credentials loaded from config/serviceAccountKey.json");
} catch (error) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      console.log("🔑 Firebase credentials loaded from FIREBASE_SERVICE_ACCOUNT env var");
    } catch (parseError) {
      console.error("❌ Error parsing FIREBASE_SERVICE_ACCOUNT:", parseError.message);
      process.exit(1);
    }
  } else {
    console.error("\n❌ ERROR CRÍTICO DE FIREBASE ❌");
    console.error("No se encontró 'config/serviceAccountKey.json' ni la variable FIREBASE_SERVICE_ACCOUNT.");
    console.error("En local: coloca el archivo en config/serviceAccountKey.json");
    console.error("En Render: añade FIREBASE_SERVICE_ACCOUNT con el JSON completo\n");
    process.exit(1);
  }
}

// Evitamos inicializar dos veces (puede pasar si algo importa este archivo más de una vez)
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

// Referencia a Firestore que usan todos los demás servicios y rutas
const db = admin.firestore();

module.exports = { admin, db };