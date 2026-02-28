const { db, admin } = require("./firebase");

// Registra una actividad en Firestore para que aparezca en el Community Pulse (muro social)
// Se llama desde varias rutas: cuando alguien escribe una review, sigue a alguien, dona, etc.
// Los tipos posibles son: 'review', 'donate', 'follow', 'devlog', 'library'
async function logActivity(userId, username, photoUrl, type, targetId, targetName, extraData = {}) {
  try {
    // Guardamos en la colección "activities" — el Community Pulse lee de aquí
    await db.collection("activities").add({
      userId,
      username,
      userAvatar: photoUrl || null,
      type,
      targetId,
      targetName,
      extraData, // Datos extra como score de review, monto de donación, etc.
      createdAt: admin.firestore.FieldValue.serverTimestamp() // Timestamp del servidor, no del cliente
    });
    console.log(`✅ Activity logged: ${type} by ${username}`);
  } catch (error) {
    // Si falla el logging no queremos crashear la operación principal del usuario
    console.error("❌ Error logging activity:", error);
  }
}

module.exports = { logActivity };