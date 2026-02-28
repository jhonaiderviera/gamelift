const express = require('express');
const router = express.Router();
const { db, admin } = require('../services/firebase');
const { isAuthenticatedApi, getUid } = require("../middleware/auth");
const { incrementChallenge } = require("../services/challenges");
const { createNotification, getNotifications, getUnreadCount, markAsRead, markAllAsRead } = require("../services/notificationService");

// Todas las rutas aqui son API (JSON) — se usan desde el frontend con fetch

/* ═══════════════════════════════════════════
   1. LOGICA DE LIBRERIA Y FAVORITOS
   ═══════════════════════════════════════════ */

// Agregar o quitar un juego de la biblioteca — si ya existe lo borra, si no lo crea con estado
router.post('/library/toggle', isAuthenticatedApi, async (req, res) => {
  const { gameId, gameName, coverUrl, status, fromDiscover } = req.body;
  const uid = getUid(req);
  // Cada juego es un doc dentro de la subcoleccion library del usuario
  const docRef = db.collection('users').doc(uid).collection('library').doc(String(gameId));

  try {
    const doc = await docRef.get();
    if (doc.exists) {
      await docRef.delete();
      res.json({ status: 'removed' });
    } else {
      await docRef.set({
        gameId, gameName, coverUrl,
        status: status || 'backlog',
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      res.json({ status: 'added', currentStatus: status || 'backlog' });

      // ── Challenge hooks (fire-and-forget, no bloquear respuesta) ──
      if (fromDiscover) {
        incrementChallenge(uid, 'discovery_explorer').catch(() => {});
      }
      incrementChallenge(uid, 'consistent_gamer').catch(() => {});
    }
  } catch (error) {
    console.error("Error toggle library:", error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Cambiar el estado de un juego (playing, completed, etc.) — ruta unica, el duplicado de profile.js se elimino
router.post('/library/update-status', isAuthenticatedApi, async (req, res) => {
  const { gameId, status, genres } = req.body;
  const uid = getUid(req);

  // Solo se permiten estos estados para evitar datos basura en Firestore
  const validStatuses = ['playing', 'completed', 'on-hold', 'dropped', 'backlog'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, msg: "Invalid status" });
  }

  const docRef = db.collection('users').doc(uid).collection('library').doc(String(gameId));

  try {
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, msg: "Game not in library" });
    }

    await docRef.update({
      status: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, status: status });

    // ── Challenge hooks (fire-and-forget) ──
    if (status === 'completed') {
      incrementChallenge(uid, 'backlog_buster').catch(() => {});
      // Si se pasaron géneros, incrementar genre_explorer con cada uno
      if (genres && Array.isArray(genres)) {
        for (const genre of genres) {
          incrementChallenge(uid, 'genre_explorer', { genre }).catch(() => {});
        }
      }
    }
    incrementChallenge(uid, 'consistent_gamer').catch(() => {});
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ success: false, msg: "Server error" });
  }
});

// Toggle de favoritos — misma logica que library pero sin estado, solo existe o no
router.post('/favorites/toggle', isAuthenticatedApi, async (req, res) => {
  const { gameId, gameName, coverUrl } = req.body;
  const uid = getUid(req);
  const docRef = db.collection('users').doc(uid).collection('favorites').doc(String(gameId));

  try {
    const doc = await docRef.get();
    if (doc.exists) {
      await docRef.delete();
      res.json({ status: 'removed' });
    } else {
      await docRef.set({
        gameId, gameName, coverUrl,
        addedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      res.json({ status: 'added' });
    }
  } catch (error) {
    console.error("Error toggle favorite:", error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Devuelve la library y favoritos del usuario — el frontend lo usa para pintar botones activos
router.get('/my-games', isAuthenticatedApi, async (req, res) => {
  const uid = getUid(req);
  try {
    // select('status') y select() traen solo los campos necesarios, no todo el doc
    const libSnap = await db.collection('users').doc(uid).collection('library').select('status').get();
    const favSnap = await db.collection('users').doc(uid).collection('favorites').select().get();

    const libraryData = {};
    libSnap.docs.forEach(doc => {
      libraryData[doc.id] = doc.data().status || 'backlog';
    });

    res.json({
      library: libraryData,
      favorites: favSnap.docs.map(d => d.id)
    });
  } catch (error) {
    console.error("Error fetching user games:", error);
    res.status(500).json({ error: 'Error' });
  }
});

// Seguir/dejar de seguir — usa transaccion de Firestore para mantener consistencia entre ambos docs
router.post('/follow/:id', isAuthenticatedApi, async (req, res) => {
  const currentUserId = getUid(req);
  const targetUserId = req.params.id;

  if (currentUserId === targetUserId) return res.json({ success: false, message: "You cannot follow yourself" });

  const currentUserRef = db.collection('users').doc(currentUserId);
  const targetUserRef = db.collection('users').doc(targetUserId);

  try {
    // Usar transaccion para garantizar consistencia entre ambos documentos
    const result = await db.runTransaction(async (t) => {
      const currentDoc = await t.get(currentUserRef);
      const targetDoc = await t.get(targetUserRef);
      if (!currentDoc.exists || !targetDoc.exists) throw new Error("User not found");

      const userData = currentDoc.data();
      const following = userData.following || [];
      const isFollowing = following.includes(targetUserId);

      if (isFollowing) {
        t.update(currentUserRef, { following: admin.firestore.FieldValue.arrayRemove(targetUserId) });
        t.update(targetUserRef, { followers: admin.firestore.FieldValue.arrayRemove(currentUserId) });
        return { action: "unfollowed" };
      } else {
        t.update(currentUserRef, { following: admin.firestore.FieldValue.arrayUnion(targetUserId) });
        t.update(targetUserRef, { followers: admin.firestore.FieldValue.arrayUnion(currentUserId) });
        return { action: "followed", followerName: userData.username || req.user?.username || "Someone" };
      }
    });

    // Si lo siguio, mandar notificacion al otro usuario (fire-and-forget)
    if (result.action === "followed") {
      createNotification(targetUserId, {
        type: "follow",
        message: `${result.followerName} started following you`,
        icon: "fas fa-user-plus",
        link: "/profile",
      }).catch(() => {});
    }

    return res.json({ success: true, action: result.action });
  } catch (error) {
    console.error("Error toggling follow:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// --- Notificaciones ---

// Traer las ultimas 30 notificaciones del usuario
router.get('/notifications', isAuthenticatedApi, async (req, res) => {
  try {
    const uid = getUid(req);
    const notifications = await getNotifications(uid, 30);
    res.json({ success: true, notifications });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// Contador de no leidas — lo usa el badge del navbar
router.get('/notifications/count', isAuthenticatedApi, async (req, res) => {
  try {
    const uid = getUid(req);
    const count = await getUnreadCount(uid);
    res.json({ success: true, count });
  } catch (error) {
    console.error("Error counting notifications:", error);
    res.status(500).json({ success: false, count: 0 });
  }
});

// Marcar una sola notificacion como leida
router.post('/notifications/read', isAuthenticatedApi, async (req, res) => {
  try {
    const uid = getUid(req);
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false });
    await markAsRead(uid, id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error marking notification read:", error);
    res.status(500).json({ success: false });
  }
});

// Marcar todas como leidas — markAllAsRead maneja el limite de 500 docs de Firestore por batch
router.post('/notifications/read-all', isAuthenticatedApi, async (req, res) => {
  try {
    const uid = getUid(req);
    await markAllAsRead(uid);
    res.json({ success: true });
  } catch (error) {
    console.error("Error marking all read:", error);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
