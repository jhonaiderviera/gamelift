const express = require("express");
const router = express.Router();
// Importamos todas las funciones del servicio (incluida la nueva getUpcomingGames)
const { 
  getNewReleasesGames, 
  getTrendingGames, 
  getUpcomingGames, 
  searchGames, 
  getGameDetails 
} = require("../services/igdbClient");

// 1. PORTADA PRINCIPAL (/games)
router.get("/", async (req, res) => {
  try {
    // Pedimos 10 de cada uno para los sliders de la Home
    const newReleases = await getNewReleasesGames(10);
    const popularGames = await getTrendingGames(10); 
    const upcomingGames = await getUpcomingGames(10); // <--- Nueva sección

    res.render("layout", {
      title: "Games Catalog | GameLift",
      page: "games",
      active: "games",
      data: { 
        newReleases, 
        popularGames,
        upcomingGames,
        isCategoryView: false // Estamos en la home, mostramos todos los sliders
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

// 2. BUSCADOR (Resultados completos)
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
        newReleases: results, // Usamos el grid principal para pintar resultados
        popularGames: [],     // Ocultamos otros sliders
        upcomingGames: [],
        sectionTitle: `Results for "${query}"`,
        isCategoryView: true, // Activamos modo vista única (muestra botón volver)
        searchQuery: query
      }
    });
  } catch (error) {
    console.error(error);
    res.redirect("/games");
  }
});

// 3. CATEGORÍAS "VER TODO" (/games/category/:type)
router.get("/category/:type", async (req, res) => {
  const type = req.params.type;
  
  try {
    let games = [];
    let title = "";

    // Aumentamos el límite a 24 para llenar la pantalla en "Ver todo"
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
        newReleases: games, // Usamos el grid principal
        popularGames: [],   // Vaciamos los secundarios
        upcomingGames: [],
        sectionTitle: title,
        isCategoryView: true // <--- Esto activa el botón "Back" y oculta los otros sliders
      }
    });

  } catch (error) {
    console.error(error);
    res.redirect("/games");
  }
});

// 4. DETALLE DEL JUEGO (/games/:id)
router.get("/:id", async (req, res) => {
  try {
    const gameId = req.params.id;
    const gameData = await getGameDetails(gameId);

    if (!gameData) {
      return res.status(404).render("error", { 
        message: "Game not found", 
        error: { status: 404 },
        page: "error",
        data: {}
      });
    }

    res.render("layout", {
      title: `${gameData.name} | GameLift`,
      page: "game-detail",
      active: "games",
      data: gameData
    });

  } catch (error) {
    console.error("Error loading game details:", error);
    res.redirect("/games");
  }
});

module.exports = router;