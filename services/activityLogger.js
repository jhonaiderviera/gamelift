const { db, admin } = require("./firebase");

/**
 * Registra una actividad en el Muro Social
 * @param {string} userId - ID del usuario que hace la acción
 * @param {string} username - Nombre del usuario
 * @param {string} photoUrl - Avatar del usuario
 * @param {string} type - Tipo: 'review', 'donate', 'follow', 'devlog', 'library'
 * @param {string} targetId - ID del objeto (juego, proyecto, usuario)
 * @param {string} targetName - Nombre del objeto (ej: "Minecraft")
 * @param {object} extraData - Datos extra (ej: { score: 90, amount: 50 })
 */
async function logActivity(userId, username, photoUrl, type, targetId, targetName, extraData = {}) {
  try {
    await db.collection("activities").add({
      userId,
      username,
      userAvatar: photoUrl,
      type,
      targetId,
      targetName,
      extraData,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`✅ Activity logged: ${type} by ${username}`);
  } catch (error) {
    console.error("❌ Error logging activity:", error);
  }
}

module.exports = { logActivity };