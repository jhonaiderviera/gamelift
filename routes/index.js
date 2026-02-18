/* Ubicación: /routes/index.js */
const express = require("express");
const router = express.Router();
const { getRandomFeaturedGames } = require("../services/igdbClient");
const { getHeroMetaByGameName } = require("../services/steamGridClient");
// IMPORTAR FIREBASE PARA EL MURO
const { db } = require("../services/firebase");

// Validar que la imagen de héroe tiene suficiente calidad
function isHeroSharpEnough(meta) {
  if (!meta?.url) return false;
  const w = Number(meta.width || 0);
  const h = Number(meta.height || 0);
  const area = w * h;

  if (w >= 1600) return true;
  if (w >= 1200 && area >= 800000) return true;
  return false;
}

// Página principal
router.get("/", async (req, res, next) => {
  try {
    // --- 1. LÓGICA DE JUEGOS Y HÉROES (Tu código original) ---
    const pool = await getRandomFeaturedGames(30);
    const featured = pool.slice(0, 10);
    
    const topGames = pool.slice(10, 20).map(g => ({
      id: g.id,
      name: g.name,
      summary: g.summary,
      coverUrl: g.coverUrl || "/images/Community.png",
    }));

    const heroSlides = [];
    for (const g of featured) {
      const heroMeta = await getHeroMetaByGameName(g.name);
      const heroUrl = isHeroSharpEnough(heroMeta) ? heroMeta.url : null;
      const imageUrl = heroUrl || g.heroFallbackUrl || g.coverUrl || "/images/Community.png";

      const globalRating = g.rating ? Math.round(g.rating) : null;
      const gameliftRating = globalRating ? Math.max(10, Math.min(100, Math.round(globalRating + (Math.random() * 10 - 5)))) : null;

      heroSlides.push({
        id: g.id,
        title: g.name,
        subtitle: g.genres && g.genres.length > 0 ? g.genres[0] : "Featured Game",
        imageUrl,
        ctaText: "Más información",
        ctaHref: "/games/" + g.id,
        globalRating,
        gameliftRating
      });
    }

    // --- 2. CARGAR ACTIVIDAD SOCIAL (NUEVO) ---
    const activitiesRef = db.collection('activities').orderBy('createdAt', 'desc').limit(20);
    const snapshot = await activitiesRef.get();
    
    const activities = snapshot.docs.map(doc => {
      const data = doc.data();
      let timeAgo = 'Just now';
      if (data.createdAt) {
        const diff = new Date() - data.createdAt.toDate();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 60) timeAgo = `${minutes}m ago`;
        else if (minutes < 1440) timeAgo = `${Math.floor(minutes/60)}h ago`;
        else timeAgo = `${Math.floor(minutes/1440)}d ago`;
      }
      return { id: doc.id, ...data, timeAgo };
    });

    res.render("layout", {
      title: "Inicio | GameLift",
      page: "index",
      // Pasamos todo: Slides, TopGames y Activities
      data: { heroSlides, topGames, activities },
      user: req.user
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;