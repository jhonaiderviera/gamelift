const express = require("express");
const router = express.Router();

// Importamos Firebase desde el servicio (asegúrate de que services/firebase.js esté bien)
const { db, admin } = require("../services/firebase");

// Importamos funciones de IGDB
const { 
  getNewReleasesGames, 
  getTrendingGames, 
  getUpcomingGames, 
  searchGames, 
  getGameDetails 
} = require("../services/igdbClient");

// ==========================================
// 1. PORTADA PRINCIPAL (/games)
// ==========================================
router.get("/", async (req, res) => {
  try {
    const newReleases = await getNewReleasesGames(10);
    const popularGames = await getTrendingGames(10); 
    const upcomingGames = await getUpcomingGames(10);

    res.render("layout", {
      title: "Games Catalog | GameLift",
      page: "games",
      active: "games",
      data: { 
        newReleases, 
        popularGames,
        upcomingGames,
        isCategoryView: false 
      }
    });
  } catch (error) {
    console.error("Error fetching games:", error);
    res.render("layout", {
      title: "Games | GameLift",
      page: "games",
      active: "games",
      error: "Error loading games.",
      data: { newReleases: [], popularGames: [], upcomingGames: [] }
    });
  }
});

// ==========================================
// 2. BUSCADOR (/games/search)
// ==========================================
router.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.redirect("/games");

  try {
    const results = await searchGames(query);
    
    res.render("layout", {
      title: `Search: ${query} | GameLift`,
      page: "games",
      active: "games",
      data: {
        newReleases: results,
        popularGames: [],
        upcomingGames: [],
        sectionTitle: `Results for "${query}"`,
        isCategoryView: true, 
        searchQuery: query
      }
    });
  } catch (error) {
    console.error(error);
    res.redirect("/games");
  }
});

// ==========================================
// 3. CATEGORÍAS (/games/category/:type)
// ==========================================
router.get("/category/:type", async (req, res) => {
  const type = req.params.type;
  
  try {
    let games = [];
    let title = "";

    if (type === "new") {
      games = await getNewReleasesGames(24);
      title = "All New Releases";
    } else if (type === "popular") {
      games = await getTrendingGames(24);
      title = "All Trending Games";
    } else if (type === "upcoming") {
      games = await getUpcomingGames(24);
      title = "Upcoming Releases";
    } else {
      return res.redirect("/games");
    }

    res.render("layout", {
      title: `${title} | GameLift`,
      page: "games",
      active: "games",
      data: {
        newReleases: games,
        popularGames: [],
        upcomingGames: [],
        sectionTitle: title,
        isCategoryView: true
      }
    });

  } catch (error) {
    console.error(error);
    res.redirect("/games");
  }
});

// ==========================================
// 4. DETALLE DEL JUEGO (GET) + LEER REVIEWS
// ==========================================
router.get("/:id", async (req, res) => {
  try {
    const gameId = req.params.id;
    
    // A. Pedir datos a IGDB
    const gameData = await getGameDetails(gameId);

    if (!gameData) {
      return res.status(404).render("error", { 
        message: "Game not found", 
        error: { status: 404 },
        page: "error",
        data: {}
      });
    }

    // B. Pedir Reviews a Firebase
    let reviews = [];
    try {
      const snapshot = await db.collection('reviews')
        .where('gameId', '==', gameId)
        .orderBy('createdAt', 'desc')
        .get();

      if (!snapshot.empty) {
        reviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
    } catch (firebaseError) {
      console.warn("Firebase warning: Could not fetch reviews:", firebaseError.message);
    }

    res.render("layout", {
      title: `${gameData.name} | GameLift`,
      page: "game-detail",
      active: "games",
      data: {
        ...gameData,
        reviews: reviews
      }
    });

  } catch (error) {
    console.error("Error loading game details:", error);
    res.redirect("/games");
  }
});

// ==========================================
// 5. GUARDAR REVIEW (POST)
// ==========================================
router.post("/:id/reviews", async (req, res) => {
  console.log("👉 Recibiendo petición POST de Review...");

  // 1. Obtener usuario (o usar el Tester por defecto)
  let user = req.user || (req.session && req.session.user);

  // --- MODO PRUEBA ACTIVADO ---
  if (!user) {
     console.log("⚠️ No hay usuario logueado. Usando usuario 'Tester'.");
     user = { uid: "guest-123", displayName: "Tester", photoURL: null };
  }
  // ----------------------------

  const { gameId, gameName, scores, text } = req.body;

  console.log("Datos recibidos:", req.body); // DEBUG

  // 2. Validación
  if (!gameId || !scores) {
    console.error("❌ Faltan datos en el body");
    return res.status(400).json({ message: "Missing data" });
  }

  // 3. Calcular promedio
  const average = Math.round((parseInt(scores.story) + parseInt(scores.gameplay) + parseInt(scores.graphics) + parseInt(scores.sound)) / 4);

  try {
    const newReview = {
      gameId,
      gameName: gameName || "Unknown Game",
      userId: user.uid,
      userName: user.displayName || "Anonymous",
      userAvatar: user.photoURL || null,
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

    // 4. Guardar en Firestore
    await db.collection('reviews').add(newReview);
    console.log("✅ Review guardada en Firebase correctamente.");
    
    res.json({ success: true });
  } catch (error) {
    console.error("❌ Error guardando en Firebase:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;