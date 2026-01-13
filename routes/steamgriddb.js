const express = require("express");
const router = express.Router();
const { autocomplete, heroesByGameId, getHeroByGameName } = require("../services/steamGridClient");

// GET /api/steamgriddb/autocomplete?term=elden
router.get("/autocomplete", async (req, res) => {
  try {
    const term = String(req.query.term || "").trim();
    if (!term) return res.status(400).json({ ok: false, error: "Missing term." });

    const data = await autocomplete(term);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: "SteamGridDB autocomplete failed." });
  }
});

// GET /api/steamgriddb/heroes?gameId=123
router.get("/heroes", async (req, res) => {
  try {
    const gameId = String(req.query.gameId || "").trim();
    if (!gameId) return res.status(400).json({ ok: false, error: "Missing gameId." });

    const data = await heroesByGameId(gameId);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: "SteamGridDB heroes failed." });
  }
});

// GET /api/steamgriddb/hero-by-name?name=Elden%20Ring
router.get("/hero-by-name", async (req, res) => {
  try {
    const name = String(req.query.name || "").trim();
    if (!name) return res.status(400).json({ ok: false, error: "Missing name." });

    const url = await getHeroByGameName(name);
    res.json({ ok: true, url });
  } catch (e) {
    res.status(500).json({ ok: false, error: "SteamGridDB hero-by-name failed." });
  }
});

module.exports = router;
