const express = require("express");
const router = express.Router();

const { getTrendingGames, searchGames } = require("../services/igdbClient");

// GET /api/igdb/trending?limit=6
router.get("/trending", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(24, Number(req.query.limit || 6)));
    const data = await getTrendingGames(limit);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Failed to load trending games." });
  }
});

// GET /api/igdb/search?q=zelda&limit=20
router.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.max(1, Math.min(50, Number(req.query.limit || 20)));

    if (!q) return res.status(400).json({ ok: false, error: "Missing q." });

    const data = await searchGames(q, limit);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Search failed." });
  }
});

module.exports = router;
