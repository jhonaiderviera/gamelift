/* Ubicación: /routes/profile.js */
const express = require('express');
const router = express.Router();
const { db, admin } = require("../services/firebase");

/* Middleware de autenticación */
const isAuthenticated = (req, res, next) => {
  if (req.user) {
    next();
  } else {
    res.redirect('/auth/login');
  }
};

/* GET: PÁGINA DE PERFIL */
router.get('/', isAuthenticated, async function(req, res, next) {
  try {
    const uid = req.user.uid || req.user.id;
    
    // 1. Obtener datos reales de Firebase
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    
    // Prioridad de nombres
    const realUsername = userData.username || userData.name || req.user.username || req.user.displayName || "Indie Dev";
    const realAvatar = userData.photoUrl || userData.picture || req.user.photoUrl || req.user.picture;
    
    // --- CAMBIO AQUÍ: QUITAMOS EL TEXTO POR DEFECTO ---
    const realBio = userData.bio || ""; 
    // --------------------------------------------------

    const followersCount = userData.followers ? userData.followers.length : 0;
    const followingCount = userData.following ? userData.following.length : 0;

    // 2. Mis Proyectos
    const myProjectsRef = db.collection('indie_games').where('authorId', '==', uid);
    const myProjectsSnap = await myProjectsRef.get();
    let myProjects = [];
    let totalRaised = 0;
    if (!myProjectsSnap.empty) {
      myProjectsSnap.forEach(doc => {
        const d = doc.data();
        myProjects.push({ id: doc.id, ...d });
        totalRaised += (d.raised || 0);
      });
    }

    // 3. Library & Favorites
    const librarySnap = await db.collection('users').doc(uid).collection('library').orderBy('addedAt', 'desc').get();
    const favoritesSnap = await db.collection('users').doc(uid).collection('favorites').orderBy('addedAt', 'desc').get();

    const library = librarySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const favorites = favoritesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 4. Mis Reviews
    let myReviews = [];
    try {
      const reviewsSnap = await db.collection('reviews').where('userId', '==', uid).get();
      if (!reviewsSnap.empty) {
        myReviews = reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
    } catch (err) { console.error("Error fetching reviews:", err); }

    res.render('layout', {
      title: 'My Profile | GameLift',
      page: 'profile',
      active: 'profile',
      user: req.user,
      error: req.query.error || null,
      success: req.query.success || null,
      data: {
        username: realUsername,
        photoUrl: realAvatar,
        bio: realBio, // Enviamos la bio (vacía o con texto)
        followers: followersCount,
        following: followingCount,
        myProjects,
        totalRaised,
        library,
        favorites,
        myReviews
      }
    });

  } catch (error) {
    console.error("Error loading profile:", error);
    res.render('error', { message: "Error loading profile", error });
  }
});

/* --- RUTAS POST --- */

// 1. ACTUALIZAR BIO (NUEVO)
router.post('/update-bio', isAuthenticated, async (req, res) => {
  try {
    const { bio } = req.body;
    const uid = req.user.uid || req.user.id;
    await db.collection('users').doc(uid).update({ bio: bio });
    res.redirect('/profile');
  } catch (error) {
    console.error("Error updating bio:", error);
    res.redirect('/profile');
  }
});

// 2. ACTUALIZAR USERNAME
router.post('/update-username', isAuthenticated, async (req, res) => {
  try {
    const { newUsername } = req.body;
    const uid = req.user.uid || req.user.id;
    await db.collection('users').doc(uid).update({ username: newUsername });
    req.user.username = newUsername; 
    res.redirect('/profile');
  } catch (error) { console.error(error); res.redirect('/profile'); }
});

// 3. ACTUALIZAR FOTO
router.post('/update-photo', isAuthenticated, async (req, res) => {
  try {
    const { photoUrl } = req.body;
    const uid = req.user.uid || req.user.id;
    await db.collection('users').doc(uid).update({ photoUrl: photoUrl });
    req.user.photoUrl = photoUrl; // Actualizar sesión
    res.redirect('/profile');
  } catch (error) { console.error(error); res.redirect('/profile'); }
});

// 4. CAMBIAR PASSWORD
router.post('/change-password', isAuthenticated, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const uid = req.user.uid || req.user.id;
    const userEmail = req.user.email; 

    if (!currentPassword || !newPassword) return res.redirect('/profile?error=Missing+fields');
    if (newPassword.length < 6) return res.redirect('/profile?error=Password+too+short');

    const apiKey = process.env.FIREBASE_API_KEY; 
    const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
    
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, password: currentPassword, returnSecureToken: false })
    });

    const data = await response.json();
    if (data.error) return res.redirect('/profile?error=Incorrect+current+password');

    await admin.auth().updateUser(uid, { password: newPassword });
    res.redirect('/profile?success=Password+Changed');
  } catch (error) { console.error(error); res.redirect('/profile?error=Server+Error'); }
});

// 5. BORRAR CUENTA
router.post('/delete-account', isAuthenticated, async (req, res) => {
  try {
    const uid = req.user.uid || req.user.id;
    await admin.auth().deleteUser(uid);
    await db.collection('users').doc(uid).delete();
    res.clearCookie('session'); 
    res.redirect('/');
  } catch (error) { console.error(error); res.redirect('/profile'); }
});

module.exports = router;