const express = require('express');
const router = express.Router();
const { db, admin } = require("../services/firebase");
const { logActivity } = require("../services/activityLogger");
const { isAuthenticated, getUid } = require("../middleware/auth");

// 1. VER DETALLE DE UNA COLECCION
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('collections').doc(req.params.id).get();
    if (!doc.exists) return res.render('error', { message: "Collection not found", error: { status: 404 } });

    const collection = { id: doc.id, ...doc.data() };
    const isOwner = req.user && getUid(req) === collection.userId;

    res.render('layout', {
      title: `${collection.title} | GameLift`,
      page: 'collection-detail',
      active: 'community',
      data: { collection, isOwner },
      user: req.user
    });
  } catch (e) { console.error(e); res.redirect('/'); }
});

// 2. CREAR COLECCION (SOPORTA JSON Y FORMULARIO)
router.post('/create', isAuthenticated, async (req, res) => {
  try {
    const { title } = req.body;
    const uid = getUid(req);

    if (!title || title.trim() === "") {
      if (req.headers['content-type'] === 'application/json') {
        return res.json({ success: false, msg: "Title is required" });
      }
      return res.redirect('/profile?error=Title+required');
    }

    const newCol = {
      userId: uid,
      username: req.user.username || "User",
      userAvatar: req.user.photoUrl || "https://ui-avatars.com/api/?name=User",
      title: title.trim(),
      games: [],
      createdAt: new Date()
    };

    const ref = await db.collection('collections').add(newCol);

    try {
      await logActivity(uid, newCol.username, newCol.userAvatar, 'collection', ref.id, newCol.title, { action: 'created' });
    } catch (e) { console.error("Log error:", e.message); }

    if (req.headers['content-type'] === 'application/json') {
      return res.json({ success: true, id: ref.id, title: newCol.title });
    }
    res.redirect('/profile?success=Collection+Created');

  } catch (e) {
    console.error("Error creating collection:", e);
    if (req.headers['content-type'] === 'application/json') {
      return res.status(500).json({ success: false, msg: e.message });
    }
    res.redirect('/profile?error=Failed');
  }
});

// 3. ANADIR JUEGO A COLECCION
router.post('/:id/add', isAuthenticated, async (req, res) => {
  const listId = req.params.id;
  const { gameId, gameName, gameCover } = req.body;
  const uid = getUid(req);

  try {
    const ref = db.collection('collections').doc(listId);
    const doc = await ref.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, msg: 'Collection not found' });
    }
    if (doc.data().userId !== uid) {
      return res.status(403).json({ success: false, msg: 'Unauthorized' });
    }

    const currentGames = doc.data().games || [];
    const exists = currentGames.find(g => g.id == gameId);
    if (exists) {
      return res.json({ success: false, msg: 'Game already in list' });
    }

    await ref.update({
      games: admin.firestore.FieldValue.arrayUnion({
        id: gameId,
        name: gameName,
        cover: gameCover || "https://images.igdb.com/igdb/image/upload/t_cover_big/nocover.png",
        addedAt: new Date()
      })
    });

    res.json({ success: true });

  } catch (e) {
    console.error("Error adding game to collection:", e);
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
});

// 4. BORRAR JUEGO
router.post('/:id/remove', isAuthenticated, async (req, res) => {
  try {
    const listId = req.params.id;
    const { gameId } = req.body;
    const uid = getUid(req);
    const ref = db.collection('collections').doc(listId);
    const doc = await ref.get();

    if (!doc.exists || doc.data().userId !== uid) return res.redirect('/');

    const currentGames = doc.data().games || [];
    const newGames = currentGames.filter(g => g.id != gameId);
    await ref.update({ games: newGames });
    res.redirect(`/collections/${listId}`);
  } catch (e) { res.redirect('back'); }
});

// 5. BORRAR COLECCION
router.post('/:id/delete', isAuthenticated, async (req, res) => {
  try {
    const listId = req.params.id;
    const uid = getUid(req);
    const ref = db.collection('collections').doc(listId);
    const doc = await ref.get();
    if (doc.exists && doc.data().userId === uid) await ref.delete();
    res.redirect('/profile');
  } catch (e) { res.redirect('/profile'); }
});

module.exports = router;
