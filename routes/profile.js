const express = require('express');
const router = express.Router();
const { db, admin } = require("../services/firebase");
const { logActivity } = require("../services/activityLogger");
const { createNotification } = require("../services/notificationService");
const { isAuthenticated, getUid } = require("../middleware/auth");
const { getAchievements } = require("../services/achievements");

// Perfil de usuario — vista privada, publica, settings y sistema de follow

// Tags que el usuario puede elegir para su perfil (max 3)
const AVAILABLE_TAGS = [
  "RPG Lover", "FPS Pro", "Retro", "Indie Fan",
  "Speedrunner", "Casual", "Hardcore", "Collector",
  "Strategy", "Co-op", "MMO", "eSports", "Artist", "Writer"
];

// Unifica library y favoritos — los favoritos heredan el status de la biblioteca
function processLibraryAndFavorites(librarySnap, favoritesSnap) {
  const library = librarySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // Mapa de status para vincular favoritos con su estado en la biblioteca
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

// Determina el badge del usuario segun su rol o si tiene proyectos indie publicados
function getUserRole(userData, projectCount) {
  if (userData.role === 'admin') return { label: "Administrator", css: "badge-admin" };
  if (userData.role === 'developer' || projectCount > 0) return { label: "Indie Developer", css: "badge-dev" };
  return { label: "Gamer", css: "badge-gamer" };
}

// Mi perfil privado — carga toda la data del usuario en paralelo (6 queries a Firestore)
router.get('/', isAuthenticated, async function (req, res, next) {
  try {
    const uid = getUid(req);

    // Todas estas queries son independientes, asi que van en paralelo
    const [userDoc, myProjectsSnap, librarySnap, favoritesSnap, reviewsSnap, colSnap] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('indie_games').where('authorId', '==', uid).get(),
      db.collection('users').doc(uid).collection('library').orderBy('addedAt', 'desc').limit(100).get(),
      db.collection('users').doc(uid).collection('favorites').orderBy('addedAt', 'desc').limit(100).get(),
      db.collection('reviews').where('userId', '==', uid).orderBy('createdAt', 'desc').limit(50).get(),
      db.collection('collections').where('userId', '==', uid).orderBy('createdAt', 'desc').get().catch(indexError => {
        console.warn("Warning: Could not load collections.", indexError.message);
        return { docs: [] };
      })
    ]);

    const userData = userDoc.exists ? userDoc.data() : {};
    const myProjects = myProjectsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const role = getUserRole(userData, myProjects.length);
    const { library, favorites } = processLibraryAndFavorites(librarySnap, favoritesSnap);
    const myReviews = reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const myCollections = colSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Calcular logros del usuario basado en cantidad de reviews, juegos y proyectos
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

/* --- RUTAS DE ACTUALIZACION DE PERFIL --- */

// Actualizar tags — max 3, se validan contra la lista permitida
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

// Actualizar bio — truncada a 500 chars por seguridad
router.post('/update-bio', isAuthenticated, async (req, res) => {
  try {
    const bio = String(req.body.bio || '').slice(0, 500);
    await db.collection('users').doc(getUid(req)).update({ bio });
    res.redirect('/profile');
  } catch (e) {
    res.redirect('/profile?error=Error');
  }
});

// Cambiar username — actualiza Firestore y la cookie para que se vea al instante
router.post('/update-username', isAuthenticated, async (req, res) => {
  try {
    const username = String(req.body.newUsername || '').trim();
    if (!username || username.length < 2 || username.length > 30) {
      return res.redirect('/profile?error=Username+must+be+2-30+characters');
    }
    await db.collection('users').doc(getUid(req)).update({ username });
    req.user.username = username;
    // Hay que actualizar la cookie tambien para que el navbar muestre el nuevo nombre
    res.cookie("session", JSON.stringify(req.user), { httpOnly: true, maxAge: 3600 * 1000 });
    res.redirect('/profile?success=Username+Updated');
  } catch (e) {
    res.redirect('/profile?error=Error');
  }
});

// Solo aceptamos URLs HTTPS para evitar contenido inseguro en avatars y banners
function isValidImageUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch { return false; }
}

// Actualizar foto de perfil — valida HTTPS y actualiza cookie para efecto inmediato
router.post('/update-photo', isAuthenticated, async (req, res) => {
  try {
    const photoUrl = req.body.photoUrl;
    if (!isValidImageUrl(photoUrl)) {
      return res.redirect('/profile?error=Invalid+photo+URL+(must+be+HTTPS)');
    }
    await db.collection('users').doc(getUid(req)).update({ photoUrl });
    req.user.avatarUrl = photoUrl;
    res.cookie("session", JSON.stringify(req.user), { httpOnly: true, maxAge: 3600 * 1000 });
    res.redirect('/profile');
  } catch (e) {
    res.redirect('/profile?error=Error');
  }
});

// Cambiar contrasena — primero verifica la actual con la REST API, luego actualiza via Admin SDK
router.post('/change-password', isAuthenticated, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (newPassword.length < 6) return res.redirect('/profile?error=Password+too+short');

    // Verificar la contrasena actual haciendo login contra Firebase REST API
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

// Eliminar cuenta — borra de Firebase Auth y Firestore, luego limpia sesion
router.post('/delete-account', isAuthenticated, async (req, res) => {
  try {
    const uid = getUid(req);
    await admin.auth().deleteUser(uid); // primero Auth
    await db.collection('users').doc(uid).delete(); // luego Firestore
    res.clearCookie('session');
    res.redirect('/');
  } catch (e) {
    res.redirect('/profile?error=Error');
  }
});

// Actualizar banner del perfil — misma validacion HTTPS que la foto
router.post('/update-banner', isAuthenticated, async (req, res) => {
  try {
    const { bannerUrl } = req.body;
    if (!bannerUrl) return res.redirect('/profile');
    if (!isValidImageUrl(bannerUrl)) {
      return res.redirect('/profile?error=Invalid+banner+URL+(must+be+HTTPS)');
    }
    await db.collection('users').doc(getUid(req)).update({ bannerUrl });
    res.redirect('/profile?success=Banner+Updated');
  } catch (e) {
    console.error(e);
    res.redirect('/profile?error=Error+updating+banner');
  }
});

/* --- PERFIL PUBLICO --- */

// Ver perfil de otro usuario — si es el tuyo, redirige a /profile
router.get('/u/:uid', isAuthenticated, async (req, res) => {
  try {
    const targetUid = req.params.uid;
    const currentUid = getUid(req);

    if (targetUid === currentUid) return res.redirect('/profile');

    // Primero verificar que existe, y si si, paralelizar el resto de queries
    const userDoc = await db.collection('users').doc(targetUid).get();
    if (!userDoc.exists) return res.render('error', { message: "User not found", error: { status: 404 } });
    const userData = userDoc.data();

    // Cargar proyectos, reviews, biblioteca, favoritos y colecciones en paralelo
    const [projectsSnap, reviewsSnap, librarySnap, favoritesSnap, colSnap] = await Promise.all([
      db.collection('indie_games').where('authorId', '==', targetUid).get(),
      db.collection('reviews').where('userId', '==', targetUid).orderBy('createdAt', 'desc').limit(10).get(),
      db.collection('users').doc(targetUid).collection('library').orderBy('addedAt', 'desc').limit(100).get(),
      db.collection('users').doc(targetUid).collection('favorites').orderBy('addedAt', 'desc').limit(100).get(),
      db.collection('collections').where('userId', '==', targetUid).orderBy('createdAt', 'desc').get().catch(e => {
        console.warn("Error loading public collections", e);
        return { docs: [] };
      })
    ]);

    const myProjects = projectsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const myReviews = reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const { library, favorites } = processLibraryAndFavorites(librarySnap, favoritesSnap);
    const myCollections = colSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const { achievements, unlockedCount, progressPercent } = getAchievements({
      reviewCount: myReviews.length,
      libraryCount: library.length,
      projectCount: myProjects.length
    });

    // Checar si el usuario actual ya sigue a este perfil (para el boton follow/unfollow)
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

// Follow/unfollow — usa transaccion de Firestore para evitar race conditions
router.post('/u/:uid/follow', isAuthenticated, async (req, res) => {
  try {
    const targetUid = req.params.uid;
    const currentUid = getUid(req);
    if (targetUid === currentUid) return res.json({ success: false }); // no te puedes seguir a ti mismo

    const targetRef = db.collection('users').doc(targetUid);
    const myRef = db.collection('users').doc(currentUid);

    // Transaccion: lee ambos docs y actualiza atomicamente para consistencia
    const result = await db.runTransaction(async (t) => {
      const targetDoc = await t.get(targetRef);
      const myDoc = await t.get(myRef);
      if (!targetDoc.exists || !myDoc.exists) throw "User not found";
      const targetData = targetDoc.data();
      const myData = myDoc.data();
      const followers = targetData.followers || [];

      if (followers.includes(currentUid)) {
        // Ya lo sigue = unfollow (quitar de ambos arrays)
        t.update(targetRef, { followers: admin.firestore.FieldValue.arrayRemove(currentUid) });
        t.update(myRef, { following: admin.firestore.FieldValue.arrayRemove(targetUid) });
        return { action: 'unfollow' };
      } else {
        // No lo sigue = follow (agregar a ambos arrays)
        t.update(targetRef, { followers: admin.firestore.FieldValue.arrayUnion(currentUid) });
        t.update(myRef, { following: admin.firestore.FieldValue.arrayUnion(targetUid) });
        return { action: 'follow', targetData, myData };
      }
    });

    // Solo loguear actividad y notificar si fue un follow (no en unfollow)
    if (result.action === 'follow') {
      const myUsername = result.myData.username || req.user.username;
      const myAvatar = result.myData.photoUrl || req.user.avatarUrl || null;
      await logActivity(currentUid, myUsername, myAvatar, 'follow', targetUid, result.targetData.username, {});
      createNotification(targetUid, {
        type: "follow",
        message: `${myUsername} started following you`,
        icon: "fas fa-user-plus",
        link: "/profile",
      }).then(() => {
        console.log(`Notification sent to ${targetUid}: ${myUsername} followed`);
      }).catch((err) => {
        console.error("Follow notification error:", err);
      });
    }
    res.redirect(`/profile/u/${targetUid}`);
  } catch (error) {
    res.redirect(`/profile/u/${req.params.uid}`);
  }
});

module.exports = router;
