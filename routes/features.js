const express = require("express");
const router = express.Router();
const { getNewReleasesGames } = require("../services/igdbClient");

/* GET /features page. */
router.get("/", async (req, res, next) => {
  try {
    // Pedimos 24 juegos para llenar bien la pantalla
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