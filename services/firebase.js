// SDK de Firebase Admin — nos da acceso a Firestore, Auth, etc. desde el servidor
const admin = require('firebase-admin');

// Variable para guardar las credenciales del service account
let serviceAccount;

try {
  // Cargamos el JSON con las credenciales de Firebase (descargado desde la consola de Firebase)
  // Sin este archivo la app no puede conectar con ningún servicio de Firebase
  serviceAccount = require('../config/serviceAccountKey.json');
} catch (error) {
  console.error("\n❌ ERROR CRÍTICO DE FIREBASE ❌");
  console.error("No se encontró el archivo 'serviceAccountKey.json' en la carpeta 'config'.");
  console.error("Asegúrate de que la ruta sea: GAMELIFT/config/serviceAccountKey.json\n");
  process.exit(1); // Cortamos el proceso porque sin Firebase no funciona nada
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