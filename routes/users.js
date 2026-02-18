/* Ubicación: /routes/users.js */
const express = require('express');
const router = express.Router();
const { db, admin } = require('../services/firebase');

/* Middleware de autenticación */
const isAuthenticated = (req, res, next) => {
  if (req.user) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
};

/* --- 1. LÓGICA DE LIBRERÍA Y FAVORITOS --- */

/* POST: Toggle Library (Añadir/Quitar con Estado) */
router.post('/library/toggle', isAuthenticated, async (req, res) => {
  // Recibimos 'status' opcional (por defecto 'backlog')
  const { gameId, gameName, coverUrl, status } = req.body;
  const uid = req.user.uid || req.user.id;
  const docRef = db.collection('users').doc(uid).collection('library').doc(String(gameId));

  try {
    const doc = await docRef.get();
    if (doc.exists) {
      // Si ya existe, lo quitamos (comportamiento toggle clásico)
      await docRef.delete();
      res.json({ status: 'removed' });
    } else {
      // Si no existe, lo añadimos con el estado indicado
      await docRef.set({
        gameId,
        gameName,
        coverUrl,
        status: status || 'backlog', // <--- NUEVO: Guardamos el estado
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      res.json({ status: 'added', currentStatus: status || 'backlog' });
    }
  } catch (error) {
    console.error("Error toggle library:", error);
    res.status(500).json({ error: 'Server error' });
  }
});

/* POST: Actualizar SOLO el estado (Playing, Completed, etc.) */
router.post('/library/update-status', isAuthenticated, async (req, res) => {
  const { gameId, status } = req.body;
  const uid = req.user.uid || req.user.id;

  // Validar estados
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

    // Actualizamos el campo status
    await docRef.update({
      status: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, status: status });
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ success: false, msg: "Server error" });
  }
});

/* POST: Toggle Favorites (Sin cambios) */
router.post('/favorites/toggle', isAuthenticated, async (req, res) => {
  const { gameId, gameName, coverUrl } = req.body;
  const uid = req.user.uid || req.user.id;
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

/* GET: Mis Juegos (Para estado inicial de botones) */
router.get('/my-games', isAuthenticated, async (req, res) => {
  const uid = req.user.uid || req.user.id;
  try {
    const libSnap = await db.collection('users').doc(uid).collection('library').select('status').get();
    const favSnap = await db.collection('users').doc(uid).collection('favorites').select().get();

    // Devolvemos objeto con IDs y sus estados para pintar la UI correctamente
    const libraryData = {};
    libSnap.docs.forEach(doc => {
      libraryData[doc.id] = doc.data().status || 'backlog';
    });

    res.json({
      library: libraryData, // Ahora es un objeto { "123": "playing", "456": "backlog" }
      favorites: favSnap.docs.map(d => d.id)
    });
  } catch (error) {
    console.error("Error fetching user games:", error);
    res.status(500).json({ error: 'Error' });
  }
});

/* --- 2. LÓGICA DE SOCIAL (FOLLOW/UNFOLLOW) - Sin Cambios --- */
router.post('/follow/:id', isAuthenticated, async (req, res) => {
  const currentUserId = req.user.uid || req.user.id;
  const targetUserId = req.params.id;

  if (currentUserId === targetUserId) return res.json({ success: false, message: "You cannot follow yourself" });

  const currentUserRef = db.collection('users').doc(currentUserId);
  const targetUserRef = db.collection('users').doc(targetUserId);

  try {
    const doc = await currentUserRef.get();
    const userData = doc.data() || {};
    const following = userData.following || [];

    const isFollowing = following.includes(targetUserId);

    if (isFollowing) {
      await currentUserRef.update({ following: admin.firestore.FieldValue.arrayRemove(targetUserId) });
      await targetUserRef.update({ followers: admin.firestore.FieldValue.arrayRemove(currentUserId) });
      return res.json({ success: true, action: "unfollowed" });
    } else {
      await currentUserRef.update({ following: admin.firestore.FieldValue.arrayUnion(targetUserId) });
      await targetUserRef.update({ followers: admin.firestore.FieldValue.arrayUnion(currentUserId) });
      return res.json({ success: true, action: "followed" });
    }
  } catch (error) {
    console.error("Error toggling follow:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;