const express = require("express");
const router = express.Router();
const { getRandomFeaturedGames } = require("../services/igdbClient");
const { getHeroMetaByGameName } = require("../services/steamGridClient");

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

// Página principal con juegos destacados y carrusel héroe
router.get("/", async (req, res, next) => {
  try {
    // Obtener grupo grande de juegos aleatorios
    const pool = await getRandomFeaturedGames(30);

    // Primeros 10 para el héroe
    const featured = pool.slice(0, 10);

    // Siguientes 10 para los juegos recomendados
    const topGames = pool
      .slice(10, 20)
      .map(g => ({
        id: g.id,
        name: g.name,
        summary: g.summary,
        coverUrl: g.coverUrl || "/images/Community.png",
      }));

    const heroSlides = [];
    for (const g of featured) {
      // Obtener imagen héroe de mejor calidad
      const heroMeta = await getHeroMetaByGameName(g.name);
      const heroUrl = isHeroSharpEnough(heroMeta) ? heroMeta.url : null;
      const imageUrl = heroUrl || g.heroFallbackUrl || g.coverUrl || "/images/Community.png";

      // LÓGICA DE PUNTUACIONES:
      // 1. Global Rating (IGDB): Viene de la API externa
      const globalRating = g.rating ? Math.round(g.rating) : null;
      
      // 2. GameLift Score (Tu plataforma):
      // SIMULACIÓN: Variamos un poco la nota para que se vea diferente visualmente.
      // (En el futuro, aquí harás: await getAverageScoreFromFirebase(g.id))
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

    res.render("layout", {
      title: "Inicio | GameLift",
      page: "index",
      data: { heroSlides, topGames },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;