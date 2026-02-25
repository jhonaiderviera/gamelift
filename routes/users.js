const express = require('express');
const router = express.Router();
const { db, admin } = require('../services/firebase');
const { isAuthenticatedApi, getUid } = require("../middleware/auth");

/* --- 1. LOGICA DE LIBRERIA Y FAVORITOS --- */

/* POST: Toggle Library (Anadir/Quitar con Estado) */
router.post('/library/toggle', isAuthenticatedApi, async (req, res) => {
  const { gameId, gameName, coverUrl, status } = req.body;
  const uid = getUid(req);
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
    }
  } catch (error) {
    console.error("Error toggle library:", error);
    res.status(500).json({ error: 'Server error' });
  }
});

/* POST: Actualizar SOLO el estado (Playing, Completed, etc.) */
/* NOTA: Esta es la UNICA ruta update-status. Se elimino el duplicado que existia en profile.js */
router.post('/library/update-status', isAuthenticatedApi, async (req, res) => {
  const { gameId, status } = req.body;
  const uid = getUid(req);

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
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ success: false, msg: "Server error" });
  }
});

/* POST: Toggle Favorites */
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

/* GET: Mis Juegos (Para estado inicial de botones) */
router.get('/my-games', isAuthenticatedApi, async (req, res) => {
  const uid = getUid(req);
  try {
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

/* --- 2. LOGICA DE SOCIAL (FOLLOW/UNFOLLOW) --- */
router.post('/follow/:id', isAuthenticatedApi, async (req, res) => {
  const currentUserId = getUid(req);
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
