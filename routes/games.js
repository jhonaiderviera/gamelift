const express = require("express");
const router = express.Router();
const {
  getNewReleasesGames,
  getTrendingGames,
  getBestRatedGames,
  searchGames, // Nueva función para buscar juegos por nombre
} = require("../services/igdbClient");

router.get("/", async (req, res, next) => {
  try {
    const searchQuery = req.query.search || ''; // Obtener query de búsqueda
    const [newFeatures, trending, bestGames] = await Promise.all([
      getNewReleasesGames(10),
      getTrendingGames(10),
      getBestRatedGames(10),
    ]);

    const searchResults = searchQuery ? await searchGames(searchQuery) : [];

    res.render("layout", {
      title: "Games | GameLift",
      page: "games",
      data: {
        hero: {
          title: "Discover Your Next Favorite Game",
          subtitle:
            "Explore new releases, trending titles, and the best-rated games — all in one place.",
        },
        sections: [
          { id: "new", title: "New Features", items: newFeatures, cta: "See all" },
          { id: "trending", title: "Trending this week", items: trending, cta: "See all" },
          { id: "best", title: "Best Games", items: bestGames, cta: "See all" },
          { id: "search-results", title: `Search results for "${searchQuery}"`, items: searchResults, cta: "See all" },
        ],
      },
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
