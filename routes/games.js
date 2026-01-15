const express = require("express");
const router = express.Router();

// Importamos las funciones del servicio de IGDB
const {
  getNewReleasesGames,
  getTrendingGames,
  getBestRatedGames,
  getGameDetails // <--- Nueva función importada
} = require("../services/igdbClient");

// Importamos el servicio de SteamGrid para imágenes HD
const { getHeroMetaByGameName } = require("../services/steamGridClient");

// --------------------------------------------------------------------------
// GET /games
// Pantalla principal de "Explorar Juegos" (Sliders: Nuevos, Trending, Top)
// --------------------------------------------------------------------------
router.get("/", async (req, res, next) => {
  try {
    const [newFeatures, trending, bestGames] = await Promise.all([
      getNewReleasesGames(10),
      getTrendingGames(10),
      getBestRatedGames(10),
    ]);

    res.render("layout", {
      title: "Games | GameLift",
      page: "games", // Carga views/games.ejs y public/stylesheets/games.css
      data: {
        hero: {
          title: "Discover Your Next Favorite Game",
          subtitle: "Explore new releases, trending titles, and the best-rated games — all in one place.",
          // Podríamos poner una imagen fija o aleatoria aquí
          bgImage: "/images/Gamelift.png" 
        },
        sections: [
          { id: "new", title: "New Features", items: newFeatures, cta: "See all" },
          { id: "trending", title: "Trending this week", items: trending, cta: "See all" },
          { id: "best", title: "Best Games", items: bestGames, cta: "See all" },
        ],
      },
    });
  } catch (e) {
    next(e);
  }
});

// --------------------------------------------------------------------------
// GET /games/:id
// Pantalla de Detalle del Juego (Ficha técnica, reviews, etc.)
// --------------------------------------------------------------------------
router.get("/:id", async (req, res, next) => {
  try {
    const gameId = req.params.id;

    // 1. Obtener detalles completos de IGDB
    const game = await getGameDetails(gameId);

    if (!game) {
      // Si no existe el juego, mostramos error 404
      const err = new Error("Game not found");
      err.status = 404;
      return next(err);
    }

    // 2. Intentar buscar arte "Hero" de alta calidad en SteamGridDB
    let heroUrl = game.heroFallback || game.coverUrl; // Valor por defecto (IGDB)

    try {
      const heroMeta = await getHeroMetaByGameName(game.name);
      // Solo usamos la imagen de SteamGrid si es suficientemente ancha (>1200px)
      if (heroMeta && heroMeta.width >= 1200) {
        heroUrl = heroMeta.url;
      }
    } catch (err) {
      console.error("SteamGrid Image fallback failed:", err.message);
      // No pasa nada, nos quedamos con la de IGDB
    }

    // 3. Renderizar la vista de detalle
    res.render("layout", {
      title: `${game.name} | GameLift`,
      page: "game-detail", // Carga views/game-detail.ejs (que creamos antes)
      data: {
        game,
        heroUrl
      },
    });

  } catch (e) {
    next(e);
  }
});

module.exports = router;