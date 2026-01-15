const axios = require("axios"); // Mantenemos si lo usas, aunque usamos fetch nativo abajo

const IGDB_BASE_URL = "https://api.igdb.com/v4";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";

let cachedToken = null;
let cachedTokenExpiry = 0;

// Cached pool for random featured carousel (6h)
let cachedFeaturedPool = null;
let cachedFeaturedPoolExpiry = 0;

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry) return cachedToken;

  const clientId = mustGetEnv("IGDB_CLIENT_ID");
  const clientSecret = mustGetEnv("IGDB_CLIENT_SECRET");

  const url = new URL(TWITCH_TOKEN_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");

  const res = await fetch(url.toString(), { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twitch token error: ${res.status} ${text}`);
  }

  const json = await res.json();
  cachedToken = json.access_token;

  const expiresInMs = (json.expires_in || 3600) * 1000;
  cachedTokenExpiry = now + expiresInMs - 60_000;

  return cachedToken;
}

function normalizeIgdbImageUrl(url) {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

async function igdbQuery(endpoint, body) {
  const clientId = mustGetEnv("IGDB_CLIENT_ID");
  const token = await getAccessToken();

  const res = await fetch(`${IGDB_BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IGDB error ${res.status}: ${text}`);
  }

  return res.json();
}

function shuffleCopy(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickIgdbBigHeroFallback(g) {
  const art = g.artworks?.[0]?.url || null;
  const shot = g.screenshots?.[0]?.url || null;
  const cover = g.cover?.url || null;

  const raw = art || shot || cover;
  if (!raw) return null;

  const url = normalizeIgdbImageUrl(raw);

  return url
    .replace("t_thumb", "t_1080p")
    .replace("t_screenshot_med", "t_1080p")
    .replace("t_cover_big", "t_1080p");
}

function mapGameCard(g) {
  const cover = normalizeIgdbImageUrl(g.cover?.url)
    ? normalizeIgdbImageUrl(g.cover.url).replace("t_thumb", "t_cover_big")
    : null;

  return {
    id: g.id,
    name: g.name,
    slug: g.slug,
    rating: typeof g.rating === "number" ? Math.round(g.rating) : null,
    ratingCount: typeof g.rating_count === "number" ? g.rating_count : null,
    coverUrl: cover,
    heroFallbackUrl: pickIgdbBigHeroFallback(g),
  };
}

// ---------- Existing API helpers ----------
async function getTrendingGames(limit = 10) {
  const body = `
    fields id,name,slug,rating,rating_count,cover.url,artworks.url,screenshots.url;
    where rating != null & rating_count != null & rating_count > 200;
    sort rating_count desc;
    limit ${limit};
  `;
  const games = await igdbQuery("games", body);
  return (games || []).map(mapGameCard);
}

async function searchGames(query, limit = 20) {
  const safe = String(query || "").replace(/"/g, "");
  const body = `
    search "${safe}";
    fields id,name,slug,summary,rating,cover.url,genres.name;
    limit ${limit};
  `;
  const games = await igdbQuery("games", body);

  return (games || []).map((g) => ({
    id: g.id,
    name: g.name,
    slug: g.slug,
    summary: g.summary || "",
    rating: typeof g.rating === "number" ? Math.round(g.rating) : null,
    coverUrl: normalizeIgdbImageUrl(g.cover?.url)
      ? normalizeIgdbImageUrl(g.cover.url).replace("t_thumb", "t_cover_big")
      : null,
    genres: (g.genres || []).map((x) => x.name).slice(0, 2),
  }));
}

// ---------- HOME: random featured pool ----------
async function getFeaturedPool(poolSize = 300) {
  const now = Date.now();
  if (cachedFeaturedPool && now < cachedFeaturedPoolExpiry) return cachedFeaturedPool;

  const body = `
    fields id,name,slug,summary,rating,rating_count,
      cover.url,genres.name,
      artworks.url,screenshots.url;
    where rating != null & rating_count != null & rating_count > 500;
    sort rating_count desc;
    limit ${poolSize};
  `;

  const games = await igdbQuery("games", body);

  cachedFeaturedPool = (games || []).map((g) => ({
    id: g.id,
    name: g.name,
    slug: g.slug,
    summary: g.summary || "",
    rating: typeof g.rating === "number" ? Math.round(g.rating) : null,
    coverUrl: normalizeIgdbImageUrl(g.cover?.url)
      ? normalizeIgdbImageUrl(g.cover.url).replace("t_thumb", "t_cover_big")
      : null,
    heroFallbackUrl: pickIgdbBigHeroFallback(g),
    genres: (g.genres || []).map((x) => x.name).slice(0, 2),
  }));

  cachedFeaturedPoolExpiry = now + 1000 * 60 * 60 * 6;
  return cachedFeaturedPool;
}

async function getRandomFeaturedGames(limit = 10) {
  const pool = await getFeaturedPool(300);
  return shuffleCopy(pool).slice(0, limit);
}

// ---------- /games page data ----------
async function getNewReleasesGames(limit = 10) {
  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - 120 * 24 * 60 * 60;

  const body = `
    fields id,name,slug,rating,rating_count,first_release_date,cover.url,artworks.url,screenshots.url;
    where first_release_date != null
      & first_release_date > ${fromSec}
      & rating_count != null
      & rating_count > 20;
    sort first_release_date desc;
    limit ${limit};
  `;
  const games = await igdbQuery("games", body);
  return (games || []).map(mapGameCard);
}

async function getBestRatedGames(limit = 10) {
  const body = `
    fields id,name,slug,rating,rating_count,cover.url,artworks.url,screenshots.url;
    where rating != null & rating_count != null & rating_count > 500;
    sort rating desc;
    limit ${limit};
  `;
  const games = await igdbQuery("games", body);
  return (games || []).map(mapGameCard);
}

// ---------- DETALLE DEL JUEGO (NUEVO) ----------
async function getGameDetails(id) {
  const body = `
    fields 
      name, slug, summary, storyline,
      first_release_date,
      rating, rating_count,
      cover.url, 
      artworks.url, 
      screenshots.url, screenshots.image_id,
      videos.video_id,
      genres.name, 
      involved_companies.company.name, involved_companies.developer, involved_companies.publisher,
      platforms.name, platforms.abbreviation;
    where id = ${id};
  `;
  
  const games = await igdbQuery("games", body);
  const g = games?.[0];

  if (!g) return null;

  // Normalizar datos
  return {
    id: g.id,
    name: g.name,
    slug: g.slug,
    summary: g.summary || g.storyline || "No description available.",
    releaseDate: g.first_release_date 
      ? new Date(g.first_release_date * 1000).toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' })
      : "TBA",
    rating: g.rating ? Math.round(g.rating) : null,
    ratingCount: g.rating_count || 0,
    coverUrl: normalizeIgdbImageUrl(g.cover?.url)?.replace("t_thumb", "t_cover_big"),
    heroFallback: pickIgdbBigHeroFallback(g),
    genres: (g.genres || []).map(x => x.name),
    companies: (g.involved_companies || []).map(c => ({
      name: c.company.name,
      role: c.developer ? "Developer" : (c.publisher ? "Publisher" : "Support")
    })),
    platforms: (g.platforms || []).map(p => p.abbreviation || p.name),
    screenshots: (g.screenshots || []).map(s => normalizeIgdbImageUrl(s.url)?.replace("t_thumb", "t_1080p")).slice(0, 6),
    videos: (g.videos || []).map(v => `https://www.youtube.com/embed/${v.video_id}`),
    communityScore: null // Placeholder
  };
}

// IMPORTANTÍSIMO: Asegúrate de que getGameDetails esté en este objeto
module.exports = {
  getTrendingGames,
  searchGames,
  getRandomFeaturedGames,
  getNewReleasesGames,
  getBestRatedGames,
  getGameDetails // <--- ¡AQUÍ ESTABA EL PROBLEMA!
};