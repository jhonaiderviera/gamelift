const express = require("express");
const router = express.Router();
const { getRandomFeaturedGames, getGameDetails, searchGames } = require("../services/igdbClient");
const { getHeroMetaByGameName } = require("../services/steamGridClient");
const { db } = require("../services/firebase");

// Cache in-memory para localTop (evita cargar TODOS los reviews en cada visita)
let cachedLocalTop = null;
let cachedLocalTopExpiry = 0;
const LOCAL_TOP_TTL = 1000 * 60 * 10; // 10 minutos

async function getLocalTop() {
  const now = Date.now();
  if (cachedLocalTop && now < cachedLocalTopExpiry) return cachedLocalTop;

  const allReviewsSnap = await db.collection('reviews').get();
  const reviewMap = {};
  allReviewsSnap.forEach(doc => {
    const data = doc.data();
    const gid = data.gameId;
    if (!reviewMap[gid]) {
      reviewMap[gid] = { id: gid, name: data.gameName, totalScore: 0, count: 0 };
    }
    reviewMap[gid].totalScore += (data.average || 0);
    reviewMap[gid].count += 1;
  });

  let processedGames = Object.values(reviewMap).map(g => ({
    id: g.id,
    name: g.name,
    rating: Math.round(g.totalScore / g.count),
    count: g.count
  }));

  processedGames = processedGames.filter(g => g.rating >= 70).sort((a, b) => b.rating - a.rating).slice(0, 4);
  const result = await Promise.all(processedGames.map(async (localGame) => {
    try {
      const apiData = await getGameDetails(localGame.id);
      return { ...localGame, coverUrl: apiData ? apiData.coverUrl : '/images/no-cover.png', summary: apiData ? apiData.summary : 'No summary available.' };
    } catch (err) {
      return { ...localGame, coverUrl: '/images/no-cover.png', summary: '' };
    }
  }));

  cachedLocalTop = result;
  cachedLocalTopExpiry = now + LOCAL_TOP_TTL;
  return result;
}

// Validar calidad de imagen hero
function isHeroSharpEnough(meta) {
  if (!meta?.url) return false;
  const w = Number(meta.width || 0);
  const h = Number(meta.height || 0);
  const area = w * h;
  if (w >= 1600) return true;
  if (w >= 1200 && area >= 800000) return true;
  return false;
}

// ==========================================
// RUTA HOME
// ==========================================
router.get("/", async (req, res, next) => {
  try {
    const pool = await getRandomFeaturedGames(40);
    const featured = pool.slice(0, 8);
    const globalTop = pool
      .filter(g => g.rating && g.rating >= 85)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 4);

    const heroSlides = [];
    await Promise.all(featured.map(async (g) => {
      const heroMeta = await getHeroMetaByGameName(g.name);
      const heroUrl = isHeroSharpEnough(heroMeta) ? heroMeta.url : null;
      const imageUrl = heroUrl || g.heroFallbackUrl || g.coverUrl || "/images/Community.png";
      const globalRating = g.rating ? Math.round(g.rating) : null;

      let gameliftRating = null;
      let reviewCount = 0;
      try {
        const reviewsSnap = await db.collection('reviews').where('gameId', '==', String(g.id)).get();
        if (!reviewsSnap.empty) {
          const reviews = reviewsSnap.docs.map(doc => doc.data());
          const sum = reviews.reduce((acc, curr) => acc + (curr.average || 0), 0);
          reviewCount = reviews.length;
          if (reviewCount > 0) {
            gameliftRating = Math.round(sum / reviewCount);
          }
        }
      } catch (e) { console.error("Error fetching hero score", e); }

      heroSlides.push({
        id: g.id,
        title: g.name,
        subtitle: g.genres && g.genres.length > 0 ? g.genres[0] : "Featured",
        imageUrl,
        ctaText: "View Details",
        ctaHref: "/games/" + g.id,
        globalRating,
        gameliftRating,
        reviewCount
      });
    }));

    // Local Top (cached 10 min para no cargar todos los reviews en cada visita)
    let localTop = [];
    try {
      localTop = await getLocalTop();
    } catch (e) { console.error("Error calculating local top:", e); }

    let activities = [];
    try {
      const actSnap = await db.collection('activities').orderBy('createdAt', 'desc').limit(8).get();
      activities = actSnap.docs.map(d => ({ id: d.id, ...d.data(), timeAgo: 'Recently' }));
    } catch (e) { console.error("Error activities:", e); }

    let versusHistory = [];
    let todaysBattle = null;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const todayDoc = await db.collection('daily_versus').doc(todayStr).get();
      if (todayDoc.exists) {
        const d = todayDoc.data();
        const total = (d.game1.votes || 0) + (d.game2.votes || 0);
        const p1 = total === 0 ? 50 : Math.round((d.game1.votes / total) * 100);
        todaysBattle = { ...d, p1, p2: 100 - p1, totalVotes: total };
      }
      const historySnap = await db.collection('daily_versus').where('date', '<', todayStr).orderBy('date', 'desc').limit(4).get();
      versusHistory = historySnap.docs.map(doc => {
        const d = doc.data();
        const w1 = d.game1.votes || 0;
        const w2 = d.game2.votes || 0;
        let winnerGame, winnerColor;
        if (w1 > w2) { winnerGame = d.game1; winnerColor = 'red'; }
        else if (w2 > w1) { winnerGame = d.game2; winnerColor = 'blue'; }
        else { winnerGame = { name: "Tie", coverUrl: "/images/no-cover.png", id: null }; winnerColor = 'gray'; }
        return { date: d.date, winner: winnerGame, winnerColor, game1: d.game1, game2: d.game2 };
      });
    } catch (e) { console.error("Error loading versus:", e.message); }

    res.render("layout", {
      title: "Home | GameLift",
      page: "index",
      data: { heroSlides, globalTop, localTop, activities, todaysBattle, versusHistory },
      user: req.user
    });
  } catch (err) { next(err); }
});

// ==========================================
// SUPER BUSCADOR (Juegos + Empresas)
// Usa igdbClient centralizado en vez de fetch directo
// ==========================================
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.redirect('/');

    // Usamos searchGames del servicio centralizado para juegos
    const gamesResult = await searchGames(query, 12);
    const games = gamesResult.map(g => ({
      id: g.id,
      name: g.name,
      coverUrl: g.coverUrl || '/images/no-cover.png',
      rating: g.rating,
      year: 'N/A' // searchGames no devuelve year, pero mantiene compatibilidad
    }));

    // Para companies, aun no hay funcion en igdbClient, pero reutilizamos credenciales correctamente
    // TODO: Mover a igdbClient.searchCompanies()
    let companies = [];
    try {
      const clientId = process.env.IGDB_CLIENT_ID;
      const clientSecret = process.env.IGDB_CLIENT_SECRET;

      const tokenUrl = new URL("https://id.twitch.tv/oauth2/token");
      tokenUrl.searchParams.set("client_id", clientId);
      tokenUrl.searchParams.set("client_secret", clientSecret);
      tokenUrl.searchParams.set("grant_type", "client_credentials");
      const authRes = await fetch(tokenUrl.toString(), { method: 'POST' });
      const { access_token } = await authRes.json();

      const headers = { 'Client-ID': clientId, 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' };
      const companiesQuery = `search "${query}"; fields name, logo.image_id, developed.name; limit 4;`;
      const compRes = await fetch('https://api.igdb.com/v4/companies', { method: 'POST', headers, body: companiesQuery });
      const companiesResult = await compRes.json();

      if (companiesResult && !companiesResult.title) {
        companies = companiesResult.map(c => ({
          id: c.id,
          name: c.name,
          logoUrl: c.logo ? `https://images.igdb.com/igdb/image/upload/t_logo_med/${c.logo.image_id}.png` : '/images/no-company-logo.png',
          knownFor: (c.developed && c.developed.length > 0) ? c.developed[0].name : 'Unknown Game'
        }));
      }
    } catch (compErr) {
      console.error("Error searching companies:", compErr.message);
    }

    res.render('layout', {
      title: `Search: ${query} | GameLift`,
      page: 'search-results',
      user: req.user || null,
      data: { query, games, companies }
    });
  } catch (error) {
    console.error("Error in search:", error);
    res.redirect('/');
  }
});

module.exports = router;
