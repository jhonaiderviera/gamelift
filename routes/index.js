const express = require("express");
const router = express.Router();
const { getRandomFeaturedGames } = require("../services/igdbClient");
const { getHeroMetaByGameName } = require("../services/steamGridClient");

function isHeroSharpEnough(meta) {
  if (!meta?.url) return false;
  const w = Number(meta.width || 0);
  const h = Number(meta.height || 0);
  const area = w * h;

  if (w >= 1600) return true;
  if (w >= 1200 && area >= 800000) return true;
  return false;
}

router.get("/", async (req, res, next) => {
  try {
    // Pool grande para que salga random de verdad
    const pool = await getRandomFeaturedGames(30);

    // Hero = 10 random
    const featured = pool.slice(0, 10);

    // Top 10 = otros 10 distintos (si hay)
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
      const heroMeta = await getHeroMetaByGameName(g.name);

      const heroUrl = isHeroSharpEnough(heroMeta) ? heroMeta.url : null;

      const imageUrl =
        heroUrl ||
        g.heroFallbackUrl ||
        g.coverUrl ||
        "/images/Community.png";

      heroSlides.push({
        title: g.name,
        subtitle: "Featured title",
        imageUrl,
        ctaText: "More Information",
        ctaHref: "/games",
      });
    }

    res.render("layout", {
      title: "Home | GameLift",
      page: "index",
      data: { heroSlides, topGames },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
