/* Ubicación: /routes/profile.js */
const express = require('express');
const router = express.Router();
const { db, admin } = require("../services/firebase");
const { logActivity } = require("../services/activityLogger");

/* Middleware de autenticación */
const isAuthenticated = (req, res, next) => {
  if (req.user) { next(); } else { res.redirect('/auth/login'); }
};

const AVAILABLE_TAGS = [
  "RPG Lover", "FPS Pro", "Retro", "Indie Fan",
  "Speedrunner", "Casual", "Hardcore", "Collector",
  "Strategy", "Co-op", "MMO", "eSports", "Artist", "Writer"
];

/* --- 1. MI PERFIL (Privado) --- */
router.get('/', isAuthenticated, async function (req, res, next) {
  try {
    const uid = req.user.uid || req.user.id;

    // 1. Datos del usuario
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // 2. Proyectos
    const myProjectsRef = db.collection('indie_games').where('authorId', '==', uid);
    const myProjectsSnap = await myProjectsRef.get();
    let myProjects = [];
    if (!myProjectsSnap.empty) {
      myProjectsSnap.forEach(doc => { myProjects.push({ id: doc.id, ...doc.data() }); });
    }

    // Rol (Calculamos userLabel)
    let userLabel = "Gamer"; let labelClass = "badge-gamer";
    if (userData.role === 'admin') { userLabel = "Administrator"; labelClass = "badge-admin"; }
    else if (userData.role === 'developer' || myProjects.length > 0) { userLabel = "Indie Developer"; labelClass = "badge-dev"; }

    // 3. Library & Favorites
    const librarySnap = await db.collection('users').doc(uid).collection('library').orderBy('addedAt', 'desc').get();
    const favoritesSnap = await db.collection('users').doc(uid).collection('favorites').orderBy('addedAt', 'desc').get();
    const library = librarySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const favorites = favoritesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 4. Reviews
    let myReviews = [];
    const reviewsSnap = await db.collection('reviews').where('userId', '==', uid).get();
    if (!reviewsSnap.empty) { myReviews = reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })); }

    // --- 5. COLECCIONES (SEGURO) ---
    let myCollections = [];
    try {
      const collectionsRef = db.collection('collections').where('userId', '==', uid).orderBy('createdAt', 'desc');
      const colSnap = await collectionsRef.get();
      myCollections = colSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (indexError) {
      console.warn("⚠️ Aviso: No se pudieron cargar las colecciones (posiblemente falta el índice en Firebase).", indexError.message);
    }
    // ---------------------------------------

    // 6. Logros (Mock)
    const allAchievements = [
      { id: '1', title: 'Hello World', desc: 'Create your account.', tier: 'bronze', icon: 'fas fa-user', unlocked: true },
      { id: '2', title: 'First Voice', desc: 'Write your first review.', tier: 'bronze', icon: 'fas fa-pen-nib', unlocked: myReviews.length > 0 },
      { id: '3', title: 'Librarian', desc: 'Add 5 games to library.', tier: 'silver', icon: 'fas fa-book', unlocked: library.length >= 5 },
      { id: '4', title: 'Critic', desc: 'Write 5 reviews.', tier: 'silver', icon: 'fas fa-star', unlocked: myReviews.length >= 5 },
      { id: '5', title: 'Angel Investor', desc: 'Back a project.', tier: 'gold', icon: 'fas fa-hand-holding-heart', unlocked: false },
      { id: '6', title: 'Visionary', desc: 'Publish a project.', tier: 'gold', icon: 'fas fa-lightbulb', unlocked: myProjects.length > 0 },
      { id: '7', title: 'GameLift Legend', desc: 'Unlock all others.', tier: 'platinum', icon: 'fas fa-trophy', unlocked: false }
    ];
    const unlockedCount = allAchievements.filter(a => a.unlocked).length;
    const progressPercent = Math.round((unlockedCount / allAchievements.length) * 100);

    const viewData = {
      uid, username: userData.username || req.user.username || "User",
      photoUrl: userData.photoUrl || req.user.avatarUrl,
      bio: userData.bio || "", tags: userData.tags || [],
      availableTags: AVAILABLE_TAGS,
      followers: userData.followers ? userData.followers.length : 0,
      following: userData.following ? userData.following.length : 0,

      // AQUÍ ESTABA EL ERROR: asignamos userLabel a roleLabel
      roleLabel: userLabel,
      roleClass: labelClass,

      myProjects, library, favorites, myReviews,
      myCollections,
      achievements: allAchievements, achievementProgress: progressPercent, unlockedCount
    };

    res.render('layout', {
      title: 'My Profile | GameLift', page: 'profile', active: 'profile', user: req.user,
      error: req.query.error || null, success: req.query.success || null,
      data: viewData
    });

  } catch (error) {
    console.error("Error loading profile:", error);
    res.render('error', { message: "Error loading profile", error, status: 500, details: error.message });
  }
});

/* --- RUTAS DE ACTUALIZACIÓN --- */
router.post('/update-tags', isAuthenticated, async (req, res) => { try { let { tags } = req.body; if (!tags) tags = []; else if (typeof tags === 'string') tags = [tags]; const validTags = tags.filter(t => AVAILABLE_TAGS.includes(t)).slice(0, 3); await db.collection('users').doc(req.user.uid || req.user.id).update({ tags: validTags }); res.redirect('/profile?success=Tags+Updated'); } catch (e) { res.redirect('/profile?error=Error'); } });
router.post('/update-bio', isAuthenticated, async (req, res) => { await db.collection('users').doc(req.user.uid || req.user.id).update({ bio: req.body.bio }); res.redirect('/profile'); });
router.post('/update-username', isAuthenticated, async (req, res) => { await db.collection('users').doc(req.user.uid || req.user.id).update({ username: req.body.newUsername }); req.user.username = req.body.newUsername; res.redirect('/profile'); });
router.post('/update-photo', isAuthenticated, async (req, res) => { await db.collection('users').doc(req.user.uid || req.user.id).update({ photoUrl: req.body.photoUrl }); req.user.photoUrl = req.body.photoUrl; res.redirect('/profile'); });
router.post('/change-password', isAuthenticated, async (req, res) => { try { const { currentPassword, newPassword } = req.body; if (newPassword.length < 6) return res.redirect('/profile?error=Password+too+short'); const apiKey = process.env.FIREBASE_API_KEY; const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`; const response = await fetch(verifyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: req.user.email, password: currentPassword, returnSecureToken: false }) }); const data = await response.json(); if (data.error) return res.redirect('/profile?error=Incorrect+current+password'); await admin.auth().updateUser(req.user.uid || req.user.id, { password: newPassword }); res.redirect('/profile?success=Password+Changed'); } catch (error) { res.redirect('/profile?error=Server+Error'); } });
router.post('/delete-account', isAuthenticated, async (req, res) => { try { await admin.auth().deleteUser(req.user.uid || req.user.id); await db.collection('users').doc(req.user.uid || req.user.id).delete(); res.clearCookie('session'); res.redirect('/'); } catch (e) { res.redirect('/profile?error=Error'); } });

/* --- PERFIL PÚBLICO & FOLLOW --- */
router.get('/u/:uid', isAuthenticated, async (req, res) => {
  try {
    const targetUid = req.params.uid; const currentUid = req.user.uid || req.user.id;
    if (targetUid === currentUid) return res.redirect('/profile');
    const userDoc = await db.collection('users').doc(targetUid).get();
    if (!userDoc.exists) return res.render('error', { message: "User not found", error: { status: 404 } });
    const userData = userDoc.data();
    const projectsSnap = await db.collection('indie_games').where('authorId', '==', targetUid).get();
    const projects = projectsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const reviewsSnap = await db.collection('reviews').where('userId', '==', targetUid).orderBy('createdAt', 'desc').limit(10).get();
    const reviews = reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const followers = userData.followers || []; const amIFollowing = followers.includes(currentUid);
    let userLabel = "Gamer"; let labelClass = "badge-gamer";
    if (userData.role === 'developer' || projects.length > 0) { userLabel = "Indie Developer"; labelClass = "badge-dev"; }
    if (userData.role === 'admin') { userLabel = "Administrator"; labelClass = "badge-admin"; }
    res.render('layout', { title: `${userData.username} | GameLift`, page: 'profile-public', active: '', user: req.user, data: { uid: targetUid, username: userData.username, photoUrl: userData.photoUrl, bio: userData.bio, tags: userData.tags || [], followersCount: followers.length, followingCount: userData.following?.length || 0, roleLabel, roleClass, projects, reviews, amIFollowing } });
  } catch (error) { res.redirect('/'); }
});

router.post('/u/:uid/follow', isAuthenticated, async (req, res) => {
  try {
    const targetUid = req.params.uid; const currentUid = req.user.uid || req.user.id;
    if (targetUid === currentUid) return res.json({ success: false });
    const targetRef = db.collection('users').doc(targetUid); const myRef = db.collection('users').doc(currentUid);
    const result = await db.runTransaction(async (t) => {
      const targetDoc = await t.get(targetRef); const myDoc = await t.get(myRef);
      if (!targetDoc.exists || !myDoc.exists) throw "User not found";
      const targetData = targetDoc.data(); const followers = targetData.followers || [];
      if (followers.includes(currentUid)) {
        t.update(targetRef, { followers: admin.firestore.FieldValue.arrayRemove(currentUid) });
        t.update(myRef, { following: admin.firestore.FieldValue.arrayRemove(targetUid) });
        return { action: 'unfollow' };
      } else {
        t.update(targetRef, { followers: admin.firestore.FieldValue.arrayUnion(currentUid) });
        t.update(myRef, { following: admin.firestore.FieldValue.arrayUnion(targetUid) });
        return { action: 'follow', targetData };
      }
    });
    if (result.action === 'follow') { await logActivity(currentUid, req.user.username, req.user.photoUrl || req.user.avatarUrl, 'follow', targetUid, result.targetData.username, {}); }
    res.redirect(`/profile/u/${targetUid}`);
  } catch (error) { res.redirect(`/profile/u/${req.params.uid}`); }
});

router.post('/library/update-status', isAuthenticated, async (req, res) => {
  try {
    const { gameId, status } = req.body;
    const uid = req.user.uid || req.user.id;

    // Validar estados permitidos
    const validStatuses = ['playing', 'completed', 'on-hold', 'dropped', 'backlog'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, msg: "Invalid status" });
    }

    // Referencia al documento del juego en la subcolección 'library' del usuario
    const gameRef = db.collection('users').doc(uid).collection('library').doc(gameId);

    // Verificar si existe primero
    const doc = await gameRef.get();
    if (!doc.exists) {
      // Si no está en la librería, podrías decidir añadirlo automáticamente o dar error.
      // Por ahora, daremos error para obligar a "Añadir a librería" primero.
      return res.status(404).json({ success: false, msg: "Game not in library" });
    }

    // Actualizar solo el campo status
    await gameRef.update({
      status: status,
      updatedAt: new Date()
    });

    res.json({ success: true, status: status });

  } catch (error) {
    console.error("Error updating game status:", error);
    res.status(500).json({ success: false, msg: "Server error" });
  }
});
module.exports = router;