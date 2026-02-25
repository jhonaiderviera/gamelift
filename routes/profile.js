const express = require('express');
const router = express.Router();
const { db, admin } = require("../services/firebase");
const { logActivity } = require("../services/activityLogger");
const { isAuthenticated, getUid } = require("../middleware/auth");
const { getAchievements } = require("../services/achievements");

const AVAILABLE_TAGS = [
  "RPG Lover", "FPS Pro", "Retro", "Indie Fan",
  "Speedrunner", "Casual", "Hardcore", "Collector",
  "Strategy", "Co-op", "MMO", "eSports", "Artist", "Writer"
];

// Helper: Procesa library + favorites con status map (antes duplicado)
function processLibraryAndFavorites(librarySnap, favoritesSnap) {
  const library = librarySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const libraryStatusMap = {};
  library.forEach(game => {
    libraryStatusMap[game.id] = game.status;
    if (game.gameId) libraryStatusMap[game.gameId] = game.status;
  });

  const favorites = favoritesSnap.docs.map(doc => {
    const data = doc.data();
    const linkedStatus = libraryStatusMap[doc.id] || libraryStatusMap[data.gameId] || data.status;
    return { id: doc.id, ...data, status: linkedStatus };
  });

  return { library, favorites };
}

// Helper: Calcula el rol del usuario
function getUserRole(userData, projectCount) {
  if (userData.role === 'admin') return { label: "Administrator", css: "badge-admin" };
  if (userData.role === 'developer' || projectCount > 0) return { label: "Indie Developer", css: "badge-dev" };
  return { label: "Gamer", css: "badge-gamer" };
}

/* --- 1. MI PERFIL (Privado) --- */
router.get('/', isAuthenticated, async function (req, res, next) {
  try {
    const uid = getUid(req);

    // 1. Datos del usuario
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // 2. Proyectos
    const myProjectsSnap = await db.collection('indie_games').where('authorId', '==', uid).get();
    const myProjects = myProjectsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 3. Rol
    const role = getUserRole(userData, myProjects.length);

    // 4. Library & Favorites
    const librarySnap = await db.collection('users').doc(uid).collection('library').orderBy('addedAt', 'desc').get();
    const favoritesSnap = await db.collection('users').doc(uid).collection('favorites').orderBy('addedAt', 'desc').get();
    const { library, favorites } = processLibraryAndFavorites(librarySnap, favoritesSnap);

    // 5. Reviews
    const reviewsSnap = await db.collection('reviews').where('userId', '==', uid).get();
    const myReviews = reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 6. Colecciones
    let myCollections = [];
    try {
      const colSnap = await db.collection('collections').where('userId', '==', uid).orderBy('createdAt', 'desc').get();
      myCollections = colSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (indexError) {
      console.warn("Warning: Could not load collections.", indexError.message);
    }

    // 7. Logros (servicio centralizado)
    const { achievements, unlockedCount, progressPercent } = getAchievements({
      reviewCount: myReviews.length,
      libraryCount: library.length,
      projectCount: myProjects.length
    });

    const viewData = {
      uid, username: userData.username || req.user.username || "User",
      photoUrl: userData.photoUrl || req.user.avatarUrl,
      bannerUrl: userData.bannerUrl || null,
      bio: userData.bio || "", tags: userData.tags || [],
      availableTags: AVAILABLE_TAGS,
      followers: userData.followers ? userData.followers.length : 0,
      following: userData.following ? userData.following.length : 0,
      roleLabel: role.label,
      roleClass: role.css,
      myProjects, library, favorites, myReviews,
      myCollections,
      achievements, achievementProgress: progressPercent, unlockedCount
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

/* --- RUTAS DE ACTUALIZACION --- */
router.post('/update-tags', isAuthenticated, async (req, res) => {
  try {
    let { tags } = req.body;
    if (!tags) tags = [];
    else if (typeof tags === 'string') tags = [tags];
    const validTags = tags.filter(t => AVAILABLE_TAGS.includes(t)).slice(0, 3);
    await db.collection('users').doc(getUid(req)).update({ tags: validTags });
    res.redirect('/profile?success=Tags+Updated');
  } catch (e) {
    res.redirect('/profile?error=Error');
  }
});

router.post('/update-bio', isAuthenticated, async (req, res) => {
  try {
    await db.collection('users').doc(getUid(req)).update({ bio: req.body.bio });
    res.redirect('/profile');
  } catch (e) {
    res.redirect('/profile?error=Error');
  }
});

router.post('/update-username', isAuthenticated, async (req, res) => {
  try {
    await db.collection('users').doc(getUid(req)).update({ username: req.body.newUsername });
    req.user.username = req.body.newUsername;
    res.redirect('/profile');
  } catch (e) {
    res.redirect('/profile?error=Error');
  }
});

router.post('/update-photo', isAuthenticated, async (req, res) => {
  try {
    await db.collection('users').doc(getUid(req)).update({ photoUrl: req.body.photoUrl });
    req.user.photoUrl = req.body.photoUrl;
    res.redirect('/profile');
  } catch (e) {
    res.redirect('/profile?error=Error');
  }
});

router.post('/change-password', isAuthenticated, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (newPassword.length < 6) return res.redirect('/profile?error=Password+too+short');

    const apiKey = process.env.FIREBASE_API_KEY;
    const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: req.user.email, password: currentPassword, returnSecureToken: false })
    });
    const data = await response.json();
    if (data.error) return res.redirect('/profile?error=Incorrect+current+password');

    await admin.auth().updateUser(getUid(req), { password: newPassword });
    res.redirect('/profile?success=Password+Changed');
  } catch (error) {
    res.redirect('/profile?error=Server+Error');
  }
});

router.post('/delete-account', isAuthenticated, async (req, res) => {
  try {
    const uid = getUid(req);
    await admin.auth().deleteUser(uid);
    await db.collection('users').doc(uid).delete();
    res.clearCookie('session');
    res.redirect('/');
  } catch (e) {
    res.redirect('/profile?error=Error');
  }
});

router.post('/update-banner', isAuthenticated, async (req, res) => {
  try {
    const { bannerUrl } = req.body;
    if (!bannerUrl) return res.redirect('/profile');
    await db.collection('users').doc(getUid(req)).update({ bannerUrl });
    res.redirect('/profile?success=Banner+Updated');
  } catch (e) {
    console.error(e);
    res.redirect('/profile?error=Error+updating+banner');
  }
});

/* --- PERFIL PUBLICO & FOLLOW --- */
router.get('/u/:uid', isAuthenticated, async (req, res) => {
  try {
    const targetUid = req.params.uid;
    const currentUid = getUid(req);

    if (targetUid === currentUid) return res.redirect('/profile');

    const userDoc = await db.collection('users').doc(targetUid).get();
    if (!userDoc.exists) return res.render('error', { message: "User not found", error: { status: 404 } });
    const userData = userDoc.data();

    // 1. Proyectos
    const projectsSnap = await db.collection('indie_games').where('authorId', '==', targetUid).get();
    const myProjects = projectsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 2. Reviews
    const reviewsSnap = await db.collection('reviews').where('userId', '==', targetUid).orderBy('createdAt', 'desc').limit(10).get();
    const myReviews = reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 3. Library & Favorites (helper compartido)
    const librarySnap = await db.collection('users').doc(targetUid).collection('library').orderBy('addedAt', 'desc').get();
    const favoritesSnap = await db.collection('users').doc(targetUid).collection('favorites').orderBy('addedAt', 'desc').get();
    const { library, favorites } = processLibraryAndFavorites(librarySnap, favoritesSnap);

    // 4. Colecciones
    let myCollections = [];
    try {
      const colSnap = await db.collection('collections').where('userId', '==', targetUid).orderBy('createdAt', 'desc').get();
      myCollections = colSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) { console.warn("Error loading public collections", e); }

    // 5. Logros (servicio centralizado)
    const { achievements, unlockedCount, progressPercent } = getAchievements({
      reviewCount: myReviews.length,
      libraryCount: library.length,
      projectCount: myProjects.length
    });

    // 6. Stats y Etiquetas
    const followers = userData.followers || [];
    const amIFollowing = followers.includes(currentUid);
    const role = getUserRole(userData, myProjects.length);

    res.render('layout', {
      title: `${userData.username} | GameLift`,
      page: 'profile-public',
      active: '',
      user: req.user,
      data: {
        uid: targetUid,
        username: userData.username,
        photoUrl: userData.photoUrl,
        bannerUrl: userData.bannerUrl || null,
        bio: userData.bio || "No bio yet.",
        tags: userData.tags || [],
        followers: followers.length,
        following: userData.following?.length || 0,
        roleLabel: role.label,
        roleClass: role.css,
        myProjects, myReviews, library, favorites, myCollections,
        achievements,
        achievementProgress: progressPercent,
        unlockedCount,
        amIFollowing
      }
    });
  } catch (error) {
    console.error(error);
    res.redirect('/');
  }
});

router.post('/u/:uid/follow', isAuthenticated, async (req, res) => {
  try {
    const targetUid = req.params.uid;
    const currentUid = getUid(req);
    if (targetUid === currentUid) return res.json({ success: false });

    const targetRef = db.collection('users').doc(targetUid);
    const myRef = db.collection('users').doc(currentUid);

    const result = await db.runTransaction(async (t) => {
      const targetDoc = await t.get(targetRef);
      const myDoc = await t.get(myRef);
      if (!targetDoc.exists || !myDoc.exists) throw "User not found";
      const targetData = targetDoc.data();
      const followers = targetData.followers || [];

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

    if (result.action === 'follow') {
      await logActivity(currentUid, req.user.username, req.user.photoUrl || req.user.avatarUrl, 'follow', targetUid, result.targetData.username, {});
    }
    res.redirect(`/profile/u/${targetUid}`);
  } catch (error) {
    res.redirect(`/profile/u/${req.params.uid}`);
  }
});

module.exports = router;
