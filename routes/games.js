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

// --- 1. CATÁLOGO PRINCIPAL ---
router.get("/", async (req, res) => {
  try {
    const newReleases = await getNewReleasesGames(10);
    const popularGames = await getTrendingGames(10); 
    const upcomingGames = await getUpcomingGames(10);

    res.render("layout", {
      title: "Games Catalog | GameLift",
      page: "games", active: "games",
      data: { newReleases, popularGames, upcomingGames, isCategoryView: false },
      user: req.user
    });
  } catch (error) {
    console.error("Error fetching games:", error);
    res.render("layout", {
      title: "Games | GameLift", page: "games", active: "games",
      error: "Error loading games.",
      data: { newReleases: [], popularGames: [], upcomingGames: [] },
      user: req.user
    });
  }
});

// --- 2. BÚSQUEDA ---
router.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.redirect("/games");
  try {
    const results = await searchGames(query);
    res.render("layout", {
      title: `Search: ${query} | GameLift`, page: "games", active: "games",
      data: {
        newReleases: results, popularGames: [], upcomingGames: [],
        sectionTitle: `Results for "${query}"`, isCategoryView: true, searchQuery: query
      }, user: req.user
    });
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

    res.render("layout", {
      title: `${title} | GameLift`, page: "games", active: "games",
      data: { newReleases: games, popularGames: [], upcomingGames: [], sectionTitle: title, isCategoryView: true },
      user: req.user
    });
  } catch (error) { res.redirect("/games"); }
});

// --- 4. DETALLE DEL JUEGO ---
router.get("/:id", async (req, res) => {
  try {
    const gameId = req.params.id;
    const gameData = await getGameDetails(gameId);
    
    if (!gameData) {
      return res.status(404).render("error", { 
        message: "Game not found", error: { status: 404 }, page: "error", data: {} 
      });
    }

    // Obtener reviews de Firebase
    let reviews = [];
    let gameliftScore = null;
    try {
      const snapshot = await db.collection('reviews')
        .where('gameId', '==', gameId)
        .orderBy('createdAt', 'desc')
        .get();

      if (!snapshot.empty) {
        reviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Calcular promedio de la comunidad
        const totalSum = reviews.reduce((acc, review) => acc + (review.average || 0), 0);
        if(reviews.length > 0) gameliftScore = Math.round(totalSum / reviews.length);
      }
    } catch (e) { console.warn("Firebase warning:", e.message); }

    res.render("layout", {
      title: `${gameData.name} | GameLift`, page: "game-detail", active: "games",
      data: { ...gameData, reviews, gameliftScore, reviewCount: reviews.length },
      user: req.user
    });
  } catch (error) { 
    console.error(error);
    res.redirect("/games"); 
  }
});

// --- 5. PUBLICAR REVIEW (CORREGIDO) ---
router.post("/:id/reviews", async (req, res) => {
  const user = req.user;

  // A. Verificar sesión
  if (!user) return res.status(401).json({ message: "You must be logged in." });

  const { gameId, gameName, scores, text } = req.body;
  if (!gameId || !scores) return res.status(400).json({ message: "Missing data" });

  // B. Buscar Datos Frescos del Usuario (Base de Datos)
  // Esto arregla el problema de "User" y foto rota
  let authorName = "User";
  let authorAvatar = null;

  try {
    const uid = user.uid || user.id;
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      // Prioridad: Username DB > Name DB > Google > Email
      authorName = userData.username || userData.name || user.displayName || user.email.split('@')[0];
      // Prioridad: Foto DB > Foto Google
      authorAvatar = userData.photoUrl || userData.picture || user.photoURL;
    } else {
      // Fallback si no existe en DB users (raro)
      authorName = user.displayName || user.email.split('@')[0];
      authorAvatar = user.photoURL || user.picture;
    }

    // Capitalizar nombre
    if(authorName) authorName = authorName.charAt(0).toUpperCase() + authorName.slice(1);

    // Si aún no hay avatar, generar uno con iniciales
    if (!authorAvatar) {
      authorAvatar = `https://ui-avatars.com/api/?background=random&color=fff&name=${authorName}`;
    }

    // C. Calcular promedio
    const average = Math.round((parseInt(scores.story) + parseInt(scores.gameplay) + parseInt(scores.graphics) + parseInt(scores.sound)) / 4);

    // D. Crear objeto Review
    const newReview = {
      gameId,
      gameName: gameName || "Unknown Game",
      
      // Datos del Autor Confirmados
      userId: uid,
      userName: authorName,   // <--- Nombre correcto
      userAvatar: authorAvatar, // <--- Foto correcta
      
      scores: {
        story: parseInt(scores.story),
        gameplay: parseInt(scores.gameplay),
        graphics: parseInt(scores.graphics),
        sound: parseInt(scores.sound)
      },
      average,
      text: text || "",
      
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // E. Guardar
    await db.collection('reviews').add(newReview);
    
    res.json({ success: true });

  } catch (error) {
    console.error("Error al guardar reseña:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;