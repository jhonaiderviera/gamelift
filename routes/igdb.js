const express = require("express");
const router = express.Router();

const {
  searchGames,
  getRandomFeaturedGames
} = require("../services/igdbClient");

// Proxy de busqueda a IGDB — el frontend lo llama para el search bar y modales
router.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.json({ ok: true, data: [] });

    // Buscar hasta 20 juegos que coincidan con el termino
    const data = await searchGames(q, 20);
    return res.json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Search failed" });
  }
});

// Juegos aleatorios destacados — usado internamente para discover y otras secciones
router.get("/random", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 20);
    const data = await getRandomFeaturedGames(limit);
    return res.json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Random failed" });
  }
});

module.exports = router;
