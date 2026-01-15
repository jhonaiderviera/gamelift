const express = require("express");
const router = express.Router();

const {
  searchGames,
  getRandomFeaturedGames
} = require("../services/igdbClient");

// GET /api/igdb/search?q=...
router.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.json({ ok: true, data: [] });

    const data = await searchGames(q, 20);
    return res.json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Search failed" });
  }
});

// GET /api/igdb/random?limit=20
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
