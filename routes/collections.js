const express = require('express');
const router = express.Router();
const { db, admin } = require("../services/firebase");
const { logActivity } = require("../services/activityLogger");

const isAuthenticated = (req, res, next) => { if (req.user) next(); else res.redirect('/auth/login'); };

// 1. VER DETALLE DE UNA COLECCIÓN
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('collections').doc(req.params.id).get();
    if (!doc.exists) return res.render('error', { message: "Collection not found", error: { status: 404 } });

    const collection = { id: doc.id, ...doc.data() };
    const isOwner = req.user && (req.user.uid || req.user.id) === collection.userId;

    res.render('layout', {
      title: `${collection.title} | GameLift`,
      page: 'collection-detail', // Crearemos esta vista luego
      active: 'community',
      data: { collection, isOwner },
      user: req.user
    });
  } catch (e) { console.error(e); res.redirect('/'); }
});

/* Ubicación: /routes/collections.js */

// 2. CREAR COLECCIÓN (SOPORTA JSON Y FORMULARIO)
router.post('/create', isAuthenticated, async (req, res) => {
  try {
    const { title } = req.body;
    const uid = req.user.uid || req.user.id;

    // Validación básica
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

    // Log Activity
    try {
      await logActivity(uid, newCol.username, newCol.userAvatar, 'collection', ref.id, newCol.title, { action: 'created' });
    } catch (e) { console.error("Log error:", e.message); }

    // --- AQUÍ ESTÁ EL TRUCO ---
    // Si la petición es JSON (viene del Modal), respondemos JSON
    if (req.headers['content-type'] === 'application/json') {
      return res.json({
        success: true,
        id: ref.id,
        title: newCol.title
      });
    }

    // Si es formulario normal (viene del Perfil), redirigimos
    res.redirect('/profile?success=Collection+Created');

  } catch (e) {
    console.error("Error creating collection:", e);
    if (req.headers['content-type'] === 'application/json') {
      return res.status(500).json({ success: false, msg: e.message });
    }
    res.redirect('/profile?error=Failed');
  }
});

// 3. AÑADIR JUEGO
// 3. AÑADIR JUEGO A COLECCIÓN (CON LOGS Y VALIDACIÓN)
router.post('/:id/add', isAuthenticated, async (req, res) => {
  const listId = req.params.id;
  const { gameId, gameName, gameCover } = req.body;
  const uid = req.user.uid || req.user.id;

  console.log(`👉 Intentando añadir juego [${gameName}] a lista [${listId}]`);

  try {
    const ref = db.collection('collections').doc(listId);
    const doc = await ref.get();

    // 1. Verificar si la lista existe
    if (!doc.exists) {
      console.log("❌ Error: La lista no existe.");
      return res.status(404).json({ success: false, msg: 'Collection not found' });
    }

    // 2. Verificar si soy el dueño
    if (doc.data().userId !== uid) {
      console.log("❌ Error: Usuario no autorizado.");
      return res.status(403).json({ success: false, msg: 'Unauthorized' });
    }

    // 3. Verificar duplicados (Para no añadir el mismo juego 2 veces)
    const currentGames = doc.data().games || [];
    const exists = currentGames.find(g => g.id == gameId); // Comparamos IDs

    if (exists) {
      console.log("⚠️ El juego ya estaba en la lista.");
      return res.json({ success: false, msg: 'Game already in list' });
    }

    // 4. Guardar en Firebase
    await ref.update({
      games: admin.firestore.FieldValue.arrayUnion({
        id: gameId,
        name: gameName,
        cover: gameCover || "https://images.igdb.com/igdb/image/upload/t_cover_big/nocover.png",
        addedAt: new Date() // Opcional: Para saber cuándo se añadió
      })
    });

    console.log("✅ Juego añadido correctamente.");
    res.json({ success: true });

  } catch (e) {
    console.error("🔴 Error al añadir juego:", e);
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
});

// 4. BORRAR JUEGO
router.post('/:id/remove', isAuthenticated, async (req, res) => {
  try {
    const listId = req.params.id;
    const { gameId } = req.body;
    const uid = req.user.uid || req.user.id;
    const ref = db.collection('collections').doc(listId);
    const doc = await ref.get();

    if (!doc.exists || doc.data().userId !== uid) return res.redirect('/');

    const currentGames = doc.data().games || [];
    const newGames = currentGames.filter(g => g.id != gameId);
    await ref.update({ games: newGames });
    res.redirect(`/collections/${listId}`);
  } catch (e) { res.redirect('back'); }
});

// 5. BORRAR COLECCIÓN
router.post('/:id/delete', isAuthenticated, async (req, res) => {
  try {
    const listId = req.params.id;
    const uid = req.user.uid || req.user.id;
    const ref = db.collection('collections').doc(listId);
    const doc = await ref.get();
    if (doc.exists && doc.data().userId === uid) await ref.delete();
    res.redirect('/profile');
  } catch (e) { res.redirect('/profile'); }
});

module.exports = router;