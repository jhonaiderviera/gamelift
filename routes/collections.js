const express = require('express');
const router = express.Router();
const { db, admin } = require("../services/firebase");
const { logActivity } = require("../services/activityLogger");
const { isAuthenticated, getUid } = require("../middleware/auth");

// Cargar una coleccion por ID y mostrar su detalle — cualquiera puede verla, pero solo el dueno la edita
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('collections').doc(req.params.id).get();
    if (!doc.exists) return res.render('error', { message: "Collection not found", error: { status: 404 } });

    const collection = { id: doc.id, ...doc.data() };
    // Checar si el usuario logueado es el dueno para mostrar botones de edicion
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

// Crear coleccion nueva — soporta tanto JSON (desde modal) como form submit clasico
router.post('/create', isAuthenticated, async (req, res) => {
  try {
    const { title } = req.body;
    const uid = getUid(req);

    if (!title || title.trim() === "") {
      // Responder distinto segun si es AJAX o formulario tradicional
      if (req.headers['content-type'] === 'application/json') {
        return res.json({ success: false, msg: "Title is required" });
      }
      return res.redirect('/profile?error=Title+required');
    }

    // Traer datos frescos del usuario desde Firestore (no del session que puede estar desactualizado)
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const username = userData.username || req.user.username || "User";
    const userAvatar = userData.photoUrl || req.user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`;

    const newCol = {
      userId: uid,
      username,
      userAvatar,
      title: title.trim(),
      games: [],
      createdAt: new Date()
    };

    const ref = await db.collection('collections').add(newCol);

    // Registrar actividad en el muro social — si falla no pasa nada, no queremos romper la creacion
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

// Meter un juego en una coleccion — verifica que sea el dueno y que no este repetido
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
    // Solo el dueno puede agregar juegos a su coleccion
    if (doc.data().userId !== uid) {
      return res.status(403).json({ success: false, msg: 'Unauthorized' });
    }

    // Revisar si el juego ya esta para no duplicar
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

// Quitar un juego de la coleccion — filtra el array y actualiza el doc completo
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

// Eliminar coleccion entera — solo si el que pide es el dueno
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
