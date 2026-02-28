/* services/notificationService.js — Smart Notification System */

const { db, admin } = require("./firebase");

// Crea una notificación en la subcolección del usuario en Firestore
// Se usa cuando alguien te sigue, te deja un comentario, completas un reto, etc.
async function createNotification(targetUid, { type, message, icon, link }) {
  if (!targetUid || !type || !message) return; // Validación básica para no crear notificaciones rotas
  try {
    // Cada usuario tiene su propia subcolección "notifications" dentro de su doc
    await db.collection("users").doc(targetUid).collection("notifications").add({
      type,
      message,
      icon: icon || "fas fa-bell",
      link: link || "/",
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("❌ createNotification error:", err.message);
  }
}

// Trae las notificaciones más recientes de un usuario (para el dropdown de la campanita)
async function getNotifications(uid, limit = 30) {
  try {
    // Ordenadas por fecha descendente — las más nuevas primero
    const snap = await db.collection("users").doc(uid)
      .collection("notifications")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    // Convertimos el Timestamp de Firestore a Date de JS para poder formatearlo en las vistas
    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    }));
  } catch (err) {
    console.error("❌ getNotifications error:", err.message);
    return [];
  }
}

// Cuenta cuántas notificaciones sin leer tiene el usuario (para el badge rojo de la campanita)
// OPTIMIZADO: usa count() en vez de descargar todos los docs — ahorra lecturas de Firestore
async function getUnreadCount(uid) {
  try {
    const countSnap = await db.collection("users").doc(uid)
      .collection("notifications")
      .where("read", "==", false)
      .count()
      .get();
    return countSnap.data().count;
  } catch (err) {
    // Fallback: si count() no está disponible (versión vieja del SDK), hacemos select() que es más ligero
    try {
      const snap = await db.collection("users").doc(uid)
        .collection("notifications")
        .where("read", "==", false)
        .select()
        .get();
      return snap.size;
    } catch (fallbackErr) {
      console.error("❌ getUnreadCount error:", fallbackErr.message);
      return 0;
    }
  }
}

// Marca UNA notificación como leída (cuando el usuario hace clic en ella)
async function markAsRead(uid, notificationId) {
  try {
    await db.collection("users").doc(uid)
      .collection("notifications").doc(notificationId)
      .update({ read: true });
  } catch (err) {
    console.error("❌ markAsRead error:", err.message);
  }
}

// Marca TODAS las notificaciones como leídas — el botón "mark all as read"
// Usa batch writes porque Firestore no permite updates masivos directos
async function markAllAsRead(uid) {
  try {
    const snap = await db.collection("users").doc(uid)
      .collection("notifications")
      .where("read", "==", false)
      .get();

    if (snap.empty) return;

    // Firestore tiene un límite de 500 operaciones por batch — dividimos en chunks si hay más
    const BATCH_LIMIT = 500;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      docs.slice(i, i + BATCH_LIMIT).forEach(doc => {
        batch.update(doc.ref, { read: true });
      });
      await batch.commit();
    }
  } catch (err) {
    console.error("markAllAsRead error:", err.message);
  }
}

module.exports = {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
