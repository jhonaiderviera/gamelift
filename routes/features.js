const express = require("express");
const router = express.Router();
const { getNewReleasesGames } = require("../services/igdbClient");

// Pagina de lanzamientos recientes — trae juegos nuevos de IGDB
router.get("/", async (req, res, next) => {
  try {
    // 24 juegos para que la grid se vea llena en desktop
    const newGames = await getNewReleasesGames(24);

    res.render("layout", {
      title: "New Releases | GameLift",
      page: "features", // Esto cargará views/features.ejs
      active: "features", // Para iluminar el navbar
      data: {
        games: newGames
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;