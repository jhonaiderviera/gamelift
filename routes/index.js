const express = require("express");
const router = express.Router();
const { getRandomFeaturedGames, getGameDetails, searchGames, igdbQuery } = require("../services/igdbClient");
const { getHeroMetaByGameName } = require("../services/steamGridClient");
const { db } = require("../services/firebase");

// Servicios principales: IGDB para datos de juegos, SteamGridDB para hero images, Firebase para datos de usuarios

// Cache in-memory para reviews de hero slides — evita 8 queries de reviews en cada visita al home
const heroReviewCache = new Map();
const HERO_REVIEW_TTL = 1000 * 60 * 15; // 15 minutos

// Helper: tiempo relativo ("5m ago", "2h ago", "3d ago")
function timeAgo(date) {
  if (!date) return '';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Cache in-memory para localTop (evita cargar TODOS los reviews en cada visita)
// OPTIMIZADO: subido de 10min a 30min — el ranking local no cambia tan rapido y 200 lecturas cada 10min es costoso
let cachedLocalTop = null;
let cachedLocalTopExpiry = 0;
const LOCAL_TOP_TTL = 1000 * 60 * 30; // 30 minutos

// Calcula el top de juegos segun reviews de nuestra plataforma (no IGDB, esto es interno)
async function getLocalTop() {
  const now = Date.now();
  if (cachedLocalTop && now < cachedLocalTopExpiry) return cachedLocalTop;

  // Traer solo reviews con promedio >= 70 para no cargar toda la coleccion
  const goodReviewsSnap = await db.collection('reviews')
    .where('average', '>=', 70)
    .orderBy('average', 'desc')
    .limit(200)
    .get();

  // Agrupar reviews por juego y sumar sus scores para sacar promedio
  const reviewMap = {};
  goodReviewsSnap.forEach(doc => {
    const data = doc.data();
    const gid = data.gameId;
    if (!reviewMap[gid]) {
      reviewMap[gid] = { id: gid, name: data.gameName, totalScore: 0, count: 0 };
    }
    reviewMap[gid].totalScore += (data.average || 0);
    reviewMap[gid].count += 1;
  });

  const processedGames = Object.values(reviewMap)
    .map(g => ({ id: g.id, name: g.name, rating: Math.round(g.totalScore / g.count), count: g.count }))
    .filter(g => g.rating >= 70)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 4);

  // Para cada juego top, traer su cover de IGDB (porque en Firestore solo guardamos scores)
  const result = await Promise.all(processedGames.map(async (localGame) => {
    try {
      const apiData = await getGameDetails(localGame.id);
      return { ...localGame, coverUrl: apiData ? apiData.coverUrl : '/images/no-cover.svg', summary: apiData ? apiData.summary : 'No summary available.' };
    } catch (err) {
      return { ...localGame, coverUrl: '/images/no-cover.svg', summary: '' };
    }
  }));

  cachedLocalTop = result;
  cachedLocalTopExpiry = now + LOCAL_TOP_TTL;
  return result;
}

// Filtra heroes de baja resolucion para que el slider no se vea pixelado
function isHeroSharpEnough(meta) {
  if (!meta?.url) return false;
  const w = Number(meta.width || 0);
  const h = Number(meta.height || 0);
  const area = w * h;
  if (w >= 1600) return true;
  if (w >= 1200 && area >= 800000) return true;
  return false;
}

// Ruta principal — carga hero slider, top global, top local, actividad y versus
router.get("/", async (req, res, next) => {
  try {
    // Traer 16 juegos destacados de IGDB; 8 van al hero slider y los mejores al top global
    const pool = await getRandomFeaturedGames(16);
    const featured = pool.slice(0, 8);
    const globalTop = pool
      .filter(g => g.rating && g.rating >= 85)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 4);

    // Helpers — convierte docs de Firestore a objetos con timeAgo legible
    const mapActivity = (d) => {
      const data = d.data();
      const date = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
      return { id: d.id, ...data, timeAgo: timeAgo(date) };
    };

    // Evitar actividades duplicadas del mismo usuario sobre el mismo target
    const deduplicateActivities = (acts) => {
      const seen = new Set();
      return acts.filter(act => {
        const key = `${act.userId}_${act.type}_${act.targetId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const fetchGlobalActivities = async () => {
      const actSnap = await db.collection('activities').orderBy('createdAt', 'desc').limit(20).get();
      return actSnap.docs.map(mapActivity);
    };

    // Las 4 secciones del home son independientes, asi que las corremos todas en paralelo
    const [heroSlides, localTop, activityResult, versusResult] = await Promise.all([
      // Hero Slides — para cada juego traemos su hero de SteamGridDB y reviews de Firestore
      // OPTIMIZADO: cache de reviews por gameId para no hacer 8 queries en cada visita
      Promise.all(featured.map(async (g) => {
        const gameIdStr = String(g.id);
        let gameliftRating = null;
        let reviewCount = 0;

        // Revisar cache de reviews primero
        const cached = heroReviewCache.get(gameIdStr);
        const now = Date.now();
        if (cached && (now - cached.ts) < HERO_REVIEW_TTL) {
          gameliftRating = cached.gameliftRating;
          reviewCount = cached.reviewCount;
        } else {
          // No hay cache — hacer query a Firestore
          try {
            const reviewsSnap = await db.collection('reviews').where('gameId', '==', gameIdStr).get();
            if (!reviewsSnap.empty) {
              const reviews = reviewsSnap.docs.map(doc => doc.data());
              const sum = reviews.reduce((acc, curr) => acc + (curr.average || 0), 0);
              reviewCount = reviews.length;
              if (reviewCount > 0) gameliftRating = Math.round(sum / reviewCount);
            }
          } catch (e) { /* si falla, simplemente no mostramos rating local */ }
          heroReviewCache.set(gameIdStr, { gameliftRating, reviewCount, ts: now });
        }

        // Hero image de SteamGridDB (ya tiene su propio cache interno)
        const heroMeta = await getHeroMetaByGameName(g.name);
        const heroUrl = isHeroSharpEnough(heroMeta) ? heroMeta.url : null;

        return {
          id: g.id,
          title: g.name,
          subtitle: g.genres && g.genres.length > 0 ? g.genres[0] : "Featured",
          imageUrl: heroUrl || g.heroFallbackUrl || g.coverUrl || "/images/Community.png",
          ctaText: "View Details",
          ctaHref: "/games/" + g.id,
          globalRating: g.rating ? Math.round(g.rating) : null,
          gameliftRating,
          reviewCount
        };
      })),

      // 2. Local Top (cached)
      getLocalTop().catch(e => { console.error("Error calculating local top:", e); return []; }),

      // Community Pulse — si el usuario sigue gente, muestra actividad de ellos; si no, actividad global
      (async () => {
        let activities = [];
        let activityMode = 'global';
        try {
          const uid = req.user?.uid;
          let following = [];
          if (uid) {
            const userDoc = await db.collection('users').doc(uid).get();
            following = userDoc.exists ? (userDoc.data().following || []) : [];
          }

          if (following.length > 0) {
            activityMode = 'following';
            try {
              // Firestore limita 'in' a 30 elementos, hay que dividir en chunks
              const chunks = [];
              for (let i = 0; i < following.length; i += 30) {
                chunks.push(following.slice(i, i + 30));
              }
              const results = await Promise.all(
                chunks.map(chunk =>
                  db.collection('activities')
                    .where('userId', 'in', chunk)
                    .orderBy('createdAt', 'desc')
                    .limit(20)
                    .get()
                )
              );
              const allDocs = results.flatMap(snap => snap.docs);
              allDocs.sort((a, b) => (b.data().createdAt?.toDate?.() || 0) - (a.data().createdAt?.toDate?.() || 0));
              activities = deduplicateActivities(allDocs.slice(0, 20).map(mapActivity));
            } catch (followErr) {
              console.error("Following query failed, falling back to global:", followErr.message);
              activityMode = 'global';
              activities = deduplicateActivities(await fetchGlobalActivities());
            }
          } else {
            activities = deduplicateActivities(await fetchGlobalActivities());
          }
        } catch (e) { console.error("Error activities:", e.message); }
        return { activities, activityMode };
      })(),

      // Versus del dia — batalla diaria entre dos juegos + historial de batallas pasadas
      (async () => {
        let versusHistory = [];
        let todaysBattle = null;
        try {
          const todayStr = new Date().toISOString().split('T')[0];
          // Traer la batalla de hoy y las ultimas 4 anteriores en paralelo
          const [todayDoc, historySnap] = await Promise.all([
            db.collection('daily_versus').doc(todayStr).get(),
            db.collection('daily_versus').where('date', '<', todayStr).orderBy('date', 'desc').limit(4).get()
          ]);

          // Calcular porcentajes de votos para la barra del versus
          if (todayDoc.exists) {
            const d = todayDoc.data();
            const total = (d.game1.votes || 0) + (d.game2.votes || 0);
            const p1 = total === 0 ? 50 : Math.round((d.game1.votes / total) * 100);
            todaysBattle = { ...d, p1, p2: 100 - p1, totalVotes: total };
          }

          versusHistory = historySnap.docs.map(doc => {
            const d = doc.data();
            const w1 = d.game1.votes || 0;
            const w2 = d.game2.votes || 0;
            let winnerGame, winnerColor;
            if (w1 > w2) { winnerGame = d.game1; winnerColor = 'red'; }
            else if (w2 > w1) { winnerGame = d.game2; winnerColor = 'blue'; }
            else { winnerGame = { name: "Tie", coverUrl: "/images/no-cover.svg", id: null }; winnerColor = 'gray'; }
            return { date: d.date, winner: winnerGame, winnerColor, game1: d.game1, game2: d.game2 };
          });
        } catch (e) { console.error("Error loading versus:", e.message); }
        return { versusHistory, todaysBattle };
      })()
    ]);

    const { activities, activityMode } = activityResult;
    const { versusHistory, todaysBattle } = versusResult;

    res.render("layout", {
      title: "Home | GameLift",
      page: "index",
      data: { heroSlides, globalTop, localTop, activities, activityMode, todaysBattle, versusHistory },
      user: req.user
    });
  } catch (err) { next(err); }
});

// Buscador global — busca juegos y empresas en IGDB al mismo tiempo
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.redirect('/');

    // Buscar juegos via el servicio centralizado de IGDB
    const gamesResult = await searchGames(query, 12);
    const games = gamesResult.map(g => ({
      id: g.id,
      name: g.name,
      coverUrl: g.coverUrl || '/images/no-cover.svg',
      rating: g.rating,
      year: 'N/A' // searchGames no devuelve year, pero mantiene compatibilidad
    }));

    // Buscar empresas usando igdbQuery directo (no hay helper dedicado para companies)
    let companies = [];
    try {
      const safeQuery = String(query).replace(/"/g, ""); // sanitizar comillas para la query IGDB
      const companiesResult = await igdbQuery('companies', `search "${safeQuery}"; fields name, logo.image_id, developed.name; limit 4;`);

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
