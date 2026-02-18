/* Ubicación: /routes/games.js */
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

// --- 1. CATÁLOGO PRINCIPAL ---
router.get("/", async (req, res) => {
  try {
    const newReleases = await getNewReleasesGames(10);
    const popularGames = await getTrendingGames(10);
    const upcomingGames = await getUpcomingGames(10);
    res.render("layout", { title: "Games Catalog | GameLift", page: "games", active: "games", data: { newReleases, popularGames, upcomingGames, isCategoryView: false }, user: req.user });
  } catch (error) { res.render("layout", { title: "Games | GameLift", page: "games", active: "games", error: "Error loading games.", data: { newReleases: [], popularGames: [], upcomingGames: [] }, user: req.user }); }
});

// --- 2. BÚSQUEDA ---
router.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.redirect("/games");
  try {
    const results = await searchGames(query);
    res.render("layout", { title: `Search: ${query}`, page: "games", active: "games", data: { newReleases: results, popularGames: [], upcomingGames: [], sectionTitle: `Results for "${query}"`, isCategoryView: true, searchQuery: query }, user: req.user });
  } catch (error) { res.redirect("/games"); }
});

// --- 3. CATEGORÍAS ---
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

// --- 4. DETALLE DEL JUEGO (MODIFICADO) ---
router.get("/:id", async (req, res) => {
  try {
    const gameId = req.params.id;
    const gameData = await getGameDetails(gameId);
    if (!gameData) return res.status(404).render("error", { message: "Game not found", error: { status: 404 }, page: "error", data: {} });

    let reviews = [];
    let gameliftScore = null;
    try {
      const snapshot = await db.collection('reviews').where('gameId', '==', gameId).orderBy('createdAt', 'desc').get();
      if (!snapshot.empty) {
        reviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const totalSum = reviews.reduce((acc, review) => acc + (review.average || 0), 0);
        if (reviews.length > 0) gameliftScore = Math.round(totalSum / reviews.length);
      }
    } catch (e) { console.warn("Firebase warning (Reviews):", e.message); }

    // --- CARGAR COLECCIONES DEL USUARIO (SEGURO) ---
    let userCollections = [];
    if (req.user) {
      try {
        const uid = req.user.uid || req.user.id;
        const colSnap = await db.collection('collections').where('userId', '==', uid).orderBy('createdAt', 'desc').get();
        userCollections = colSnap.docs.map(doc => ({ id: doc.id, title: doc.data().title }));
      } catch (colError) {
        console.warn("⚠️ Aviso: No se cargaron las colecciones para el modal (falta índice).", colError.message);
        // userCollections se queda vacío [], así que el modal simplemente dirá "No tienes colecciones"
      }
    }
    // ----------------------------------------------

    res.render("layout", {
      title: `${gameData.name} | GameLift`, page: "game-detail", active: "games",
      // Pasamos userCollections a la vista
      data: { ...gameData, reviews, gameliftScore, reviewCount: reviews.length, userCollections },
      user: req.user
    });
  } catch (error) { console.error(error); res.redirect("/games"); }
});

// --- 5. PUBLICAR REVIEW ---
router.post("/:id/reviews", async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "You must be logged in." });
  const { gameId, gameName, scores, text, hasSpoilers } = req.body;
  if (!gameId || !scores) return res.status(400).json({ message: "Missing data" });

  let authorName = "User"; let authorAvatar = null;
  try {
    const uid = user.uid || user.id;
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

    const newReview = {
      gameId, gameName: gameName || "Unknown Game",
      userId: uid, userName: authorName, userAvatar: authorAvatar,
      scores: { story: parseInt(scores.story), gameplay: parseInt(scores.gameplay), graphics: parseInt(scores.graphics), sound: parseInt(scores.sound) },
      average, text: text || "", hasSpoilers: hasSpoilers || false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('reviews').add(newReview);
    await logActivity(uid, authorName, authorAvatar, 'review', gameId, gameName, { score: average });
    res.json({ success: true });
  } catch (error) {
    console.error("Error al guardar reseña:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;