const express = require("express");
const router = express.Router();

// Reutilizamos igdbClient para autenticacion y queries
// Esto elimina la duplicacion del token fetch que antes estaba en index.js
const { getGameDetails } = require("../services/igdbClient");

// Helper: query IGDB directamente con el sistema de auth centralizado
// Necesitamos acceso directo a igdbQuery para companies (no hay funcion dedicada aun)
const IGDB_BASE_URL = "https://api.igdb.com/v4";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry) return cachedToken;

  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;

  const url = new URL(TWITCH_TOKEN_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");

  const res = await fetch(url.toString(), { method: "POST" });
  if (!res.ok) throw new Error(`Twitch token error: ${res.status}`);

  const json = await res.json();
  cachedToken = json.access_token;
  cachedTokenExpiry = now + ((json.expires_in || 3600) * 1000) - 60_000;
  return cachedToken;
}

async function igdbQuery(endpoint, body) {
  const clientId = process.env.IGDB_CLIENT_ID;
  const token = await getAccessToken();

  const res = await fetch(`${IGDB_BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
    },
    body,
  });

  if (!res.ok) throw new Error(`IGDB error ${res.status}`);
  return res.json();
}

// GET /companies/:id - Perfil de empresa
router.get('/:id', async (req, res) => {
  try {
    const companyId = req.params.id;

    // 1. Datos de la empresa
    const companyData = await igdbQuery('companies', `fields name, description, logo.image_id; where id = ${companyId};`);
    if (!companyData || companyData.length === 0) return res.redirect('/');

    const company = companyData[0];

    // 2. Juegos asociados
    const gamesData = await igdbQuery('games', `
      fields name, cover.image_id, first_release_date, artworks.image_id, total_rating;
      where involved_companies.company = ${companyId}
      & (category = 0 | category = 8 | category = 9)
      & cover != null;
      sort total_rating desc;
      limit 40;
    `);

    // Fondo
    let heroBackgroundUrl = '/images/default-hero-bg.jpg';
    if (Array.isArray(gamesData) && gamesData.length > 0) {
      const gArt = gamesData.find(g => g.artworks && g.artworks.length > 0);
      if (gArt) heroBackgroundUrl = `https://images.igdb.com/igdb/image/upload/t_1080p/${gArt.artworks[0].image_id}.jpg`;
    }

    const developedGames = Array.isArray(gamesData) ? gamesData.map(g => ({
      id: g.id,
      name: g.name,
      coverUrl: g.cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : '/images/no-cover.png',
      rating: g.total_rating ? Math.round(g.total_rating) : null,
      year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : 'N/A'
    })) : [];

    res.render('layout', {
      title: `${company.name} | GameLift`,
      page: 'company-profile',
      user: req.user || null,
      data: {
        id: company.id,
        name: company.name,
        description: company.description || `One of the world's leading game developers.`,
        logoUrl: company.logo ? `https://images.igdb.com/igdb/image/upload/t_logo_med/${company.logo.image_id}.png` : '/images/no-company-logo.png',
        heroBackgroundUrl,
        developed: developedGames
      }
    });

  } catch (error) {
    console.error("Error in Company Profile:", error);
    res.redirect('/');
  }
});

module.exports = router;
