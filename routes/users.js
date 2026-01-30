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

/* POST: Toggle Library */
router.post('/library/toggle', isAuthenticated, async (req, res) => {
  const { gameId, gameName, coverUrl } = req.body;
  const uid = req.user.uid || req.user.id;
  const docRef = db.collection('users').doc(uid).collection('library').doc(String(gameId));

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
    console.error("Error toggle library:", error);
    res.status(500).json({ error: 'Server error' });
  }
});

/* POST: Toggle Favorites */
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
    const libSnap = await db.collection('users').doc(uid).collection('library').select().get();
    const favSnap = await db.collection('users').doc(uid).collection('favorites').select().get();
    
    res.json({
      library: libSnap.docs.map(d => d.id),
      favorites: favSnap.docs.map(d => d.id)
    });
  } catch (error) {
    console.error("Error fetching user games:", error);
    res.status(500).json({ error: 'Error' });
  }
});

/* --- 2. LÓGICA DE SOCIAL (FOLLOW/UNFOLLOW) --- */

router.post('/follow/:id', isAuthenticated, async (req, res) => {
  const currentUserId = req.user.uid || req.user.id;
  const targetUserId = req.params.id;

  // Evitar seguirse a sí mismo
  if (currentUserId === targetUserId) {
    return res.json({ success: false, message: "You cannot follow yourself" });
  }

  const currentUserRef = db.collection('users').doc(currentUserId);
  const targetUserRef = db.collection('users').doc(targetUserId);

  try {
    // Verificamos si YA lo estamos siguiendo
    const doc = await currentUserRef.get();
    const userData = doc.data() || {};
    const following = userData.following || []; // Array de IDs
    
    const isFollowing = following.includes(targetUserId);

    if (isFollowing) {
      // UNFOLLOW: Quitar de ambos arrays
      await currentUserRef.update({
        following: admin.firestore.FieldValue.arrayRemove(targetUserId)
      });
      await targetUserRef.update({
        followers: admin.firestore.FieldValue.arrayRemove(currentUserId)
      });
      return res.json({ success: true, action: "unfollowed" });
    } else {
      // FOLLOW: Añadir a ambos arrays
      await currentUserRef.update({
        following: admin.firestore.FieldValue.arrayUnion(targetUserId)
      });
      await targetUserRef.update({
        followers: admin.firestore.FieldValue.arrayUnion(currentUserId)
      });
      return res.json({ success: true, action: "followed" });
    }

  } catch (error) {
    console.error("Error toggling follow:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;