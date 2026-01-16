const express = require("express");
const router = express.Router();

// Importar Firebase
const { db, admin } = require("../services/firebase");

// Importar funciones de búsqueda y detalles de juegos
const { 
  getNewReleasesGames, 
  getTrendingGames, 
  getUpcomingGames, 
  searchGames, 
  getGameDetails 
} = require("../services/igdbClient");

// Mostrar catálogo principal de juegos
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

// Búsqueda de juegos
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

// Mostrar categorías por tipo (nuevos, populares, próximos)
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

// Mostrar detalle del juego y sus reseñas
router.get("/:id", async (req, res) => {
  try {
    const gameId = req.params.id;
    
    // Obtener datos del juego desde IGDB
    const gameData = await getGameDetails(gameId);

    if (!gameData) {
      return res.status(404).render("error", { 
        message: "Game not found", 
        error: { status: 404 },
        page: "error",
        data: {}
      });
    }

    // Obtener reseñas de Firebase
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

// Guardar reseña de juego (solo usuarios autenticados)
router.post("/:id/reviews", async (req, res) => {
  
  // Verificar que el usuario está autenticado
  const user = req.user;

  if (!user) {
    console.warn("Intento de reseña sin autenticación bloqueado");
    return res.status(401).json({ message: "You must be logged in to post a review." });
  }

  const { gameId, gameName, scores, text } = req.body;

  // Validar que tenemos los datos necesarios
  if (!gameId || !scores) {
    return res.status(400).json({ message: "Missing data" });
  }

  // Calcular promedio de puntuaciones
  const average = Math.round((parseInt(scores.story) + parseInt(scores.gameplay) + parseInt(scores.graphics) + parseInt(scores.sound)) / 4);

  try {
    const newReview = {
      gameId,
      gameName: gameName || "Unknown Game",
      userId: user.uid || user.id,
      userName: user.displayName || user.name || "User",
      userAvatar: user.photoURL || user.avatar || null,
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

    // Guardar en Firestore
    await db.collection('reviews').add(newReview);
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error al guardar reseña:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;