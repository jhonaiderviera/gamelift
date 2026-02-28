const express = require("express");
const router = express.Router();
const { getRandomFeaturedGames } = require("../services/igdbClient");
const { db } = require("../services/firebase");
const { getUid } = require("../middleware/auth");

// Discover — estilo Tinder para descubrir juegos nuevos, ordena por generos que le gustan al usuario
router.get("/", async (req, res) => {
  try {
    // Traer 30 juegos aleatorios destacados de IGDB
    const pool = await getRandomFeaturedGames(30);

    let favoriteGenres = [];
    let libraryIds = new Set();

    // Si el usuario esta logueado, personalizar el orden segun sus gustos
    if (req.user) {
      const uid = getUid(req);

      // Reviews y library en paralelo para no hacer dos queries secuenciales
      const [reviewSnap, libSnap] = await Promise.all([
        db.collection("reviews").where("userId", "==", uid).limit(20).get().catch(() => ({ empty: true, docs: [] })),
        db.collection("users").doc(uid).collection("library").limit(100).get().catch(() => ({ empty: true, docs: [] }))
      ]);

      // Construir set de IDs de library (una sola vez)
      if (!libSnap.empty) {
        libSnap.docs.forEach(d => libraryIds.add(String(d.data().gameId || d.id)));
      }

      // Nivel 1: reviews del usuario -> extraer generos
      if (!reviewSnap.empty) {
        const reviewedGameIds = reviewSnap.docs.map(d => d.data().gameId);
        pool.forEach(g => {
          if (reviewedGameIds.includes(String(g.id))) {
            (g.genres || []).forEach(genre => favoriteGenres.push(genre));
          }
        });
      }

      // Nivel 2: si no hay generos de reviews, usar library
      if (favoriteGenres.length === 0 && !libSnap.empty) {
        const libGameIds = libSnap.docs.map(d => String(d.data().gameId || d.id));
        pool.forEach(g => {
          if (libGameIds.includes(String(g.id))) {
            (g.genres || []).forEach(genre => favoriteGenres.push(genre));
          }
        });
      }
    }

    // Sacar los que ya tiene en library — no tiene sentido mostrarle juegos que ya agrego
    let games = pool.filter(g => !libraryIds.has(String(g.id)));

    // Los juegos con generos que mas juega aparecen primero en el swiper
    if (favoriteGenres.length > 0) {
      const genreCounts = {};
      favoriteGenres.forEach(g => { genreCounts[g] = (genreCounts[g] || 0) + 1; });

      games.sort((a, b) => {
        const scoreA = (a.genres || []).reduce((sum, g) => sum + (genreCounts[g] || 0), 0);
        const scoreB = (b.genres || []).reduce((sum, g) => sum + (genreCounts[g] || 0), 0);
        return scoreB - scoreA;
      });
    }

    const discoverGames = games.map(g => ({
      id: String(g.id),
      name: g.name,
      coverUrl: g.coverUrl || "/images/no-cover.png",
      heroUrl: g.heroFallbackUrl || g.coverUrl || "/images/no-cover.png",
      genres: (g.genres || []).slice(0, 3),
      rating: g.rating ? Math.round(g.rating) : null,
    }));

    res.render("layout", {
      title: "Discover | GameLift",
      page: "discover",
      active: "discover",
      data: { games: discoverGames },
      user: req.user,
    });
  } catch (err) {
    console.error("Discover error:", err);
    res.render("layout", {
      title: "Discover | GameLift",
      page: "discover",
      active: "discover",
      data: { games: [] },
      user: req.user,
    });
  }
});

module.exports = router;
