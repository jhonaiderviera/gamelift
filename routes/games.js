const express = require("express");
const router = express.Router();
const { db, admin } = require("../services/firebase");
const {
  getNewReleasesGames,
  getTrendingGames,
  getUpcomingGames,
  searchGames,
  getGameDetails
} = require("../services/igdbClient");
const { logActivity } = require("../services/activityLogger");
const { getUid, isAuthenticatedApi } = require("../middleware/auth");
const { searchDeals } = require("../services/cheapsharkClient");
const { incrementChallenge } = require("../services/challenges");
const { createNotification } = require("../services/notificationService");

// Este archivo maneja todo lo relacionado con juegos: catalogo, detalle, reviews, reacciones y comentarios

// Catalogo principal — trae las 3 secciones de IGDB en paralelo (nuevos, trending, proximos)
router.get("/", async (req, res) => {
  try {
    const [newReleases, popularGames, upcomingGames] = await Promise.all([
      getNewReleasesGames(10),
      getTrendingGames(10),
      getUpcomingGames(10)
    ]);
    res.render("layout", { title: "Games Catalog | GameLift", page: "games", active: "games", data: { newReleases, popularGames, upcomingGames, isCategoryView: false }, user: req.user });
  } catch (error) { res.render("layout", { title: "Games | GameLift", page: "games", active: "games", error: "Error loading games.", data: { newReleases: [], popularGames: [], upcomingGames: [] }, user: req.user }); }
});

// Busqueda dentro del catalogo de juegos via IGDB
router.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.redirect("/games");
  try {
    const results = await searchGames(query);
    res.render("layout", { title: `Search: ${query}`, page: "games", active: "games", data: { newReleases: results, popularGames: [], upcomingGames: [], sectionTitle: `Results for "${query}"`, isCategoryView: true, searchQuery: query }, user: req.user });
  } catch (error) { res.redirect("/games"); }
});

// Vista de categoria expandida — mismos datos que el catalogo pero con mas juegos (24)
router.get("/category/:type", async (req, res) => {
  const type = req.params.type;
  try {
    let games = [], title = "";
    if (type === "new") { games = await getNewReleasesGames(24); title = "All New Releases"; }
    else if (type === "popular") { games = await getTrendingGames(24); title = "All Trending Games"; }
    else if (type === "upcoming") { games = await getUpcomingGames(24); title = "Upcoming Releases"; }
    else { return res.redirect("/games"); }
    res.render("layout", { title: `${title}`, page: "games", active: "games", data: { newReleases: games, popularGames: [], upcomingGames: [], sectionTitle: title, isCategoryView: true }, user: req.user });
  } catch (error) { res.redirect("/games"); }
});

// Detalle del juego — la pagina mas pesada, carga datos de IGDB + reviews + deals + biblioteca
router.get("/:id", async (req, res) => {
  try {
    const gameId = req.params.id;
    // Primero traemos los datos del juego desde IGDB
    const gameData = await getGameDetails(gameId);
    if (!gameData) return res.status(404).render("error", { message: "Game not found", error: { status: 404 }, page: "error", data: {} });

    // Preparar queries paralelas: reviews de Firestore, deals de CheapShark, y datos de usuario
    const uid = req.user ? (req.user.uid || req.user.id) : null;

    // Reviews + deals siempre se cargan; colecciones y estado de biblioteca solo si hay usuario logueado
    const queries = [
      db.collection('reviews').where('gameId', '==', gameId).orderBy('createdAt', 'desc').get().catch(e => {
        console.warn("Firebase warning (Reviews):", e.message);
        return { empty: true, docs: [] };
      }),
      searchDeals(gameData.name).catch(e => { // CheapShark para comparar precios en tiendas
        console.warn("CheapShark error:", e.message);
        return [];
      })
    ];

    if (uid) {
      queries.push(
        db.collection('collections').where('userId', '==', uid).orderBy('createdAt', 'desc').get().catch(colError => {
          console.warn("Could not load collections:", colError.message);
          return { docs: [] };
        }),
        // Ver si el juego ya esta en la biblioteca del usuario (para mostrar el estado)
        db.collection('users').doc(uid).collection('library').doc(gameId).get().catch(libError => {
          console.warn("Error checking library status:", libError.message);
          return { exists: false };
        })
      );
    }

    const results = await Promise.all(queries);
    const reviewsSnap = results[0];
    const deals = results[1];
    const colSnap = uid ? results[2] : { docs: [] };
    const libDoc = uid ? results[3] : { exists: false };

    // Calcular el score promedio de GameLift a partir de todas las reviews
    let reviews = [];
    let gameliftScore = null;
    if (!reviewsSnap.empty) {
      reviews = reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const totalSum = reviews.reduce((acc, review) => acc + (review.average || 0), 0);
      if (reviews.length > 0) gameliftScore = Math.round(totalSum / reviews.length);
    }

    // Traer la reaccion del usuario para cada review (para marcar cual ya reacciono)
    if (uid && reviews.length > 0) {
      const reactionPromises = reviews.map(r =>
        db.collection('reviews').doc(r.id).collection('reactions').doc(uid).get().catch(() => null)
      );
      const reactionDocs = await Promise.all(reactionPromises);
      reactionDocs.forEach((doc, i) => {
        reviews[i].userReaction = (doc && doc.exists) ? doc.data().type : null;
      });
    }

    const userCollections = colSnap.docs.map(doc => ({ id: doc.id, title: doc.data().title }));
    const libraryStatus = libDoc.exists ? (libDoc.data().status || 'backlog') : null;

    res.render("layout", {
      title: `${gameData.name} | GameLift`, page: "game-detail", active: "games",
      data: {
        ...gameData,
        reviews,
        gameliftScore,
        reviewCount: reviews.length,
        userCollections,
        libraryStatus,
        deals
      },
      user: req.user
    });
  } catch (error) { console.error(error); res.redirect("/games"); }
});

// Publicar review — valida scores, checa duplicados y notifica a los que tienen el juego
router.post("/:id/reviews", async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "You must be logged in." });
  const { gameId, gameName, scores, text, hasSpoilers } = req.body;
  if (!gameId || !scores) return res.status(400).json({ message: "Missing data" });

  // Validar que los scores sean numeros entre 0 y 100
  const scoreFields = ['story', 'gameplay', 'graphics', 'sound'];
  for (const field of scoreFields) {
    const val = parseInt(scores[field]);
    if (isNaN(val) || val < 0 || val > 100) {
      return res.status(400).json({ message: `Invalid score for ${field}. Must be 0-100.` });
    }
  }

  // Limitar longitud del texto de review
  if (text && text.length > 5000) {
    return res.status(400).json({ message: "Review text too long (max 5000 characters)." });
  }

  let authorName = "User"; let authorAvatar = null;
  try {
    const uid = user.uid || user.id;

    // Verificar que no haya hecho review antes (un usuario = una review por juego)
    const existingReview = await db.collection('reviews')
      .where('gameId', '==', gameId)
      .where('userId', '==', uid)
      .get();

    if (!existingReview.empty) {
      return res.status(400).json({ message: "You have already reviewed this game!" });
    }

    // Traer datos del usuario de Firestore para el nombre y avatar de la review
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      authorName = userData.username || userData.name || user.displayName || user.email.split('@')[0];
      authorAvatar = userData.photoUrl || userData.picture || user.photoURL;
    } else {
      authorName = user.displayName || user.email.split('@')[0];
      authorAvatar = user.photoURL || user.picture;
    }
    if (authorName) authorName = authorName.charAt(0).toUpperCase() + authorName.slice(1);
    if (!authorAvatar) authorAvatar = `https://ui-avatars.com/api/?background=random&color=fff&name=${authorName}`;

    const average = Math.round((parseInt(scores.story) + parseInt(scores.gameplay) + parseInt(scores.graphics) + parseInt(scores.sound)) / 4);

    // ID compuesto gameId_uid para evitar duplicados a nivel de documento
    const reviewUniqueId = `${gameId}_${uid}`;

    const newReview = {
      gameId, gameName: gameName || "Unknown Game",
      userId: uid, userName: authorName, userAvatar: authorAvatar,
      scores: { story: parseInt(scores.story), gameplay: parseInt(scores.gameplay), graphics: parseInt(scores.graphics), sound: parseInt(scores.sound) },
      average, text: text || "", hasSpoilers: Boolean(hasSpoilers),
      reactionCounts: {}, commentCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // .set() con ID compuesto en vez de .add() — asi Firestore previene duplicados
    await db.collection('reviews').doc(reviewUniqueId).set(newReview);

    // Registrar en el feed de actividad para el Community Pulse
    await logActivity(uid, authorName, authorAvatar, 'review', gameId, gameName, { score: average });
    res.json({ success: true });

    // Challenges se actualizan en background, no importa si fallan
    incrementChallenge(uid, 'review_machine').catch(() => {});
    incrementChallenge(uid, 'consistent_gamer').catch(() => {});

    // Notificar a usuarios que tienen este juego en su biblioteca (max 10 para no pasarnos)
    try {
      const libSnap = await db.collectionGroup('library')
        .where('gameId', '==', gameId)
        .limit(10)
        .get();
      const notifiedUids = new Set();
      libSnap.docs.forEach(doc => {
        const ownerUid = doc.ref.parent.parent.id;
        if (ownerUid !== uid && !notifiedUids.has(ownerUid)) {
          notifiedUids.add(ownerUid);
          createNotification(ownerUid, {
            type: "review_on_game",
            message: `${authorName} reviewed ${gameName || 'a game'}`,
            icon: "fas fa-star",
            link: `/games/${gameId}#review-${reviewUniqueId}`,
          }).catch(() => {});
        }
      });
    } catch (notifErr) {
      console.warn("Review notification error:", notifErr.message);
    }
  } catch (error) {
    console.error("Error al guardar reseña:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Toggle de reaccion — si ya tiene la misma reaccion la quita, si es diferente la cambia
router.post("/:gameId/reviews/:reviewId/reactions", isAuthenticatedApi, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { type } = req.body;
    const uid = getUid(req);
    const validTypes = ["like", "love", "haha", "wow", "sad", "angry"];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: "Invalid reaction type" });
    }

    const reviewRef = db.collection("reviews").doc(reviewId);
    const reactionRef = reviewRef.collection("reactions").doc(uid);
    const reactionDoc = await reactionRef.get();

    // Usamos batch para actualizar la subcoleccion y el contador atomicamente
    const batch = db.batch();

    if (reactionDoc.exists) {
      const oldType = reactionDoc.data().type;
      if (oldType === type) {
        // Misma reaccion = quitarla (toggle off)
        batch.delete(reactionRef);
        batch.update(reviewRef, {
          [`reactionCounts.${oldType}`]: admin.firestore.FieldValue.increment(-1),
        });
        await batch.commit();
        const updatedReview = await reviewRef.get();
        return res.json({ reactionCounts: updatedReview.data().reactionCounts || {}, userReaction: null });
      } else {
        // Reaccion diferente = bajar la vieja y subir la nueva
        batch.set(reactionRef, { type, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        batch.update(reviewRef, {
          [`reactionCounts.${oldType}`]: admin.firestore.FieldValue.increment(-1),
          [`reactionCounts.${type}`]: admin.firestore.FieldValue.increment(1),
        });
        await batch.commit();
        const updatedReview = await reviewRef.get();
        return res.json({ reactionCounts: updatedReview.data().reactionCounts || {}, userReaction: type });
      }
    } else {
      // Primera vez que reacciona a esta review
      batch.set(reactionRef, { type, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      batch.update(reviewRef, {
        [`reactionCounts.${type}`]: admin.firestore.FieldValue.increment(1),
      });
      await batch.commit();

      // Notify review author (fire-and-forget)
      const reviewData = (await reviewRef.get()).data();
      if (reviewData && reviewData.userId !== uid) {
        const emojiMap = { like: "👍", love: "❤️", haha: "😂", wow: "😮", sad: "😢", angry: "😡" };
        const userName = req.user.displayName || req.user.username || req.user.email?.split("@")[0] || "Someone";
        createNotification(reviewData.userId, {
          type: "reaction_on_review",
          message: `${emojiMap[type]} ${userName} reacted to your review on ${reviewData.gameName || "a game"}`,
          icon: "fas fa-heart",
          link: `/games/${reviewData.gameId}#review-${reviewId}`,
        }).catch(() => {});
      }

      const updatedReview = await reviewRef.get();
      return res.json({ reactionCounts: updatedReview.data().reactionCounts || {}, userReaction: type });
    }
  } catch (err) {
    console.error("Reaction toggle error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Obtener comentarios de una review — ordenados cronologicamente, max 50
router.get("/:gameId/reviews/:reviewId/comments", async (req, res) => {
  try {
    const { reviewId } = req.params;
    const snap = await db.collection("reviews").doc(reviewId)
      .collection("comments")
      .orderBy("createdAt", "asc")
      .limit(50)
      .get();

    const comments = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        userId: d.userId,
        userName: d.userName,
        userAvatar: d.userAvatar,
        text: d.text,
        replyTo: d.replyTo || null,
        createdAt: d.createdAt ? d.createdAt.toMillis() : Date.now(),
      };
    });
    res.json({ comments });
  } catch (err) {
    console.error("Get comments error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Publicar comentario en una review — soporta replies con el campo replyTo
router.post("/:gameId/reviews/:reviewId/comments", isAuthenticatedApi, async (req, res) => {
  try {
    const { reviewId, gameId } = req.params;
    const { text, replyTo } = req.body;
    const uid = getUid(req);

    if (!text || typeof text !== "string" || text.trim().length === 0 || text.length > 1000) {
      return res.status(400).json({ error: "Comment must be 1-1000 characters" });
    }

    // Traer info del usuario que comenta para el avatar y nombre
    let userName = "User", userAvatar = null;
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.exists) {
      const u = userDoc.data();
      userName = u.username || u.name || req.user.displayName || req.user.email?.split("@")[0] || "User";
      userAvatar = u.photoUrl || u.picture || req.user.photoURL;
    } else {
      userName = req.user.displayName || req.user.email?.split("@")[0] || "User";
      userAvatar = req.user.photoURL || req.user.picture;
    }
    if (!userAvatar) userAvatar = `https://ui-avatars.com/api/?background=random&color=fff&name=${userName}`;

    const commentData = {
      userId: uid,
      userName,
      userAvatar,
      text: text.trim(),
      replyTo: replyTo || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Batch: guardar comentario + incrementar contador en la review atomicamente
    const reviewRef = db.collection("reviews").doc(reviewId);
    const commentRef = reviewRef.collection("comments").doc();

    const batch = db.batch();
    batch.set(commentRef, commentData);
    batch.update(reviewRef, { commentCount: admin.firestore.FieldValue.increment(1) });
    await batch.commit();

    // Notificar al autor de la review que alguien comento (no se espera la respuesta)
    const reviewData = (await reviewRef.get()).data();
    if (reviewData && reviewData.userId !== uid) {
      createNotification(reviewData.userId, {
        type: "comment_on_review",
        message: `${userName} commented on your review on ${reviewData.gameName || "a game"}`,
        icon: "fas fa-comment",
        link: `/games/${gameId}#review-${reviewId}`,
      }).catch(() => {});
    }

    // Si es un reply, tambien notificar al usuario al que le respondieron
    if (replyTo && replyTo.userId && replyTo.userId !== uid) {
      createNotification(replyTo.userId, {
        type: "reply_on_review",
        message: `${userName} replied to you on ${reviewData?.gameName || "a game"}`,
        icon: "fas fa-reply",
        link: `/games/${gameId}#review-${reviewId}`,
      }).catch(() => {});
    }

    // Log activity for Community Pulse (fire-and-forget)
    logActivity(uid, userName, userAvatar, "comment", gameId, reviewData?.gameName || "a game", {
      reviewId,
      commentPreview: text.trim().substring(0, 60),
    }).catch(() => {});

    res.json({
      comment: {
        id: commentRef.id,
        userId: uid,
        userName,
        userAvatar,
        text: text.trim(),
        replyTo: replyTo || null,
        createdAt: Date.now(),
      },
    });
  } catch (err) {
    console.error("Post comment error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Eliminar comentario propio — solo el autor puede borrarlo
router.delete("/:gameId/reviews/:reviewId/comments/:commentId", isAuthenticatedApi, async (req, res) => {
  try {
    const { reviewId, commentId } = req.params;
    const uid = getUid(req);

    const commentRef = db.collection("reviews").doc(reviewId).collection("comments").doc(commentId);
    const commentDoc = await commentRef.get();

    if (!commentDoc.exists) return res.status(404).json({ error: "Comment not found" });
    if (commentDoc.data().userId !== uid) return res.status(403).json({ error: "Not your comment" }); // solo el dueno

    // Eliminar el doc y decrementar el contador en un batch atomico
    const batch = db.batch();
    batch.delete(commentRef);
    batch.update(db.collection("reviews").doc(reviewId), {
      commentCount: admin.firestore.FieldValue.increment(-1),
    });
    await batch.commit();

    res.json({ success: true });
  } catch (err) {
    console.error("Delete comment error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;