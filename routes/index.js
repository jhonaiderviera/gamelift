/* Ubicación: /routes/index.js */
const express = require("express");
const router = express.Router();
const { getRandomFeaturedGames, getGameDetails } = require("../services/igdbClient"); // Añadimos getGameDetails
const { getHeroMetaByGameName } = require("../services/steamGridClient");
const { db } = require("../services/firebase");

// Validar calidad de imagen
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
    // --- 1. PREPARAR JUEGOS GLOBALES (IGDB) ---
    // Pedimos juegos populares/destacados para el Slider y la sección Global
    const pool = await getRandomFeaturedGames(40);

    // Separamos para el slider (los primeros 10)
    const featured = pool.slice(0, 8);

    // Separamos para el "Global Top Rated" (ordenados por rating de la API)
    // Filtramos los que tengan rating alto real
    const globalTop = pool
      .filter(g => g.rating && g.rating >= 85)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 4); // Top 4 Globales

    // --- 2. LOGICA HERO SLIDER (Con Scores Reales) ---
    const heroSlides = [];

    // Procesamos cada juego del slider en paralelo
    await Promise.all(featured.map(async (g) => {
      const heroMeta = await getHeroMetaByGameName(g.name);
      const heroUrl = isHeroSharpEnough(heroMeta) ? heroMeta.url : null;
      const imageUrl = heroUrl || g.heroFallbackUrl || g.coverUrl || "/images/Community.png";
      const globalRating = g.rating ? Math.round(g.rating) : null;

      // BUSCAR SCORE REAL EN GAMELIFT (FIREBASE)
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
        gameliftRating, // Ahora es real o null
        reviewCount     // Para saber si mostrar "No reviews"
      });
    }));

    // --- 3. LOGICA TOP GAMELIFT (Comunidad) ---
    let localTop = [];
    try {
      // Traemos todas las reviews (Para una app pequeña está bien, en producción se haría con agregaciones)
      const allReviewsSnap = await db.collection('reviews').get();
      const reviewMap = {};

      // Agrupar reviews por juego
      allReviewsSnap.forEach(doc => {
        const data = doc.data();
        const gid = data.gameId;
        if (!reviewMap[gid]) {
          reviewMap[gid] = {
            id: gid,
            name: data.gameName,
            totalScore: 0,
            count: 0,
            // Intentamos recuperar cover si existe, si no, luego la pedimos
            coverUrl: null
          };
        }
        reviewMap[gid].totalScore += (data.average || 0);
        reviewMap[gid].count += 1;
      });

      // Calcular promedios y convertir a array
      let processedGames = Object.values(reviewMap).map(g => ({
        id: g.id,
        name: g.name,
        rating: Math.round(g.totalScore / g.count),
        count: g.count
      }));

      // Filtrar juegos con buena nota (> 70) y ordenarlos
      processedGames = processedGames.filter(g => g.rating >= 70).sort((a, b) => b.rating - a.rating).slice(0, 4);

      // Enriquecer con datos de IGDB (Portadas) porque Firebase a veces no tiene la cover
      localTop = await Promise.all(processedGames.map(async (localGame) => {
        try {
          const apiData = await getGameDetails(localGame.id);
          return {
            ...localGame,
            coverUrl: apiData ? apiData.coverUrl : '/images/no-cover.png',
            summary: apiData ? apiData.summary : 'No summary available.'
          };
        } catch (err) {
          return { ...localGame, coverUrl: '/images/no-cover.png', summary: '' };
        }
      }));

    } catch (e) { console.error("Error calculating local top:", e); }


    // --- 4. EXTRAS (Actividad y Versus) ---

    // Actividad (Community Pulse)
    let activities = [];
    try {
      const actRef = db.collection('activities').orderBy('createdAt', 'desc').limit(8);
      const actSnap = await actRef.get();
      activities = actSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        timeAgo: 'Recently' // Puedes usar una función de tiempo real si la tienes
      }));
    } catch (e) { console.error("Error activities:", e); }

    // Versus System (Live + Hall of Legends)
    let versusHistory = [];
    let todaysBattle = null;

    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // A. BATALLA ACTIVA (LIVE)
      const todayDoc = await db.collection('daily_versus').doc(todayStr).get();
      if (todayDoc.exists) {
        const d = todayDoc.data();
        const total = (d.game1.votes || 0) + (d.game2.votes || 0);
        const p1 = total === 0 ? 50 : Math.round((d.game1.votes / total) * 100);
        todaysBattle = { ...d, p1, p2: 100 - p1, totalVotes: total };
      }

      // B. HISTORIAL (HALL OF LEGENDS) - ¡RESTAURADO!
      const historyRef = db.collection('daily_versus')
        .where('date', '<', todayStr)
        .orderBy('date', 'desc')
        .limit(4);

      const historySnap = await historyRef.get();
      versusHistory = historySnap.docs.map(doc => {
        const d = doc.data();
        const w1 = d.game1.votes || 0;
        const w2 = d.game2.votes || 0;

        let winnerGame = null;
        let winnerColor = '';

        if (w1 > w2) { winnerGame = d.game1; winnerColor = 'red'; }
        else if (w2 > w1) { winnerGame = d.game2; winnerColor = 'blue'; }
        else { winnerGame = { name: "Tie", coverUrl: "/images/no-cover.png", id: null }; winnerColor = 'gray'; }

        return {
          date: d.date,
          winner: winnerGame,
          winnerColor: winnerColor,
          game1: d.game1,
          game2: d.game2
        };
      });
    } catch (e) { console.error("Error loading versus:", e.message); }


    // --- RENDER ---
    res.render("layout", {
      title: "Home | GameLift",
      page: "index",
      data: {
        heroSlides,
        globalTop,   // Top de la API
        localTop,    // Top de Tu Comunidad
        activities,
        todaysBattle,
        versusHistory
      },
      user: req.user
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;