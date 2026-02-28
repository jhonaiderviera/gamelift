// URLs base de IGDB (pertenece a Twitch/Amazon, requiere credenciales de Twitch)
const IGDB_BASE_URL = "https://api.igdb.com/v4";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";

// Token de acceso cacheado — evita pedir uno nuevo en cada request
let cachedToken = null;
let cachedTokenExpiry = 0;

// Pool de juegos destacados cacheado por 6 horas para el carrusel del home
let cachedFeaturedPool = null;
let cachedFeaturedPoolExpiry = 0;

// Valida que una variable de entorno exista, si no lanza error para que no falle silenciosamente
function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// --- AUTENTICACIÓN ---
// Pide un token OAuth2 a Twitch (IGDB usa la misma auth que Twitch)
// El token se cachea hasta que expire, restando 60s de margen de seguridad
async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry) return cachedToken; // Si aún es válido, lo reutilizamos

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
  cachedTokenExpiry = now + expiresInMs - 60_000; // 60s antes de que expire para no cortar a mitad de request
  return cachedToken;
}

// --- UTILIDADES ---
// IGDB a veces devuelve URLs sin protocolo (ej: "//images.igdb.com/..."), esto le pone https
function normalizeIgdbImageUrl(url) {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

// Función genérica para hacer queries a cualquier endpoint de IGDB
// El body usa el lenguaje propio de IGDB (parecido a SQL pero con su sintaxis rara)
async function igdbQuery(endpoint, body) {
  const clientId = mustGetEnv("IGDB_CLIENT_ID");
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IGDB error ${res.status}: ${text}`);
  }
  return res.json();
}

// Mezcla aleatoria tipo Fisher-Yates — para que el carrusel no muestre siempre lo mismo
function shuffleCopy(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Busca la mejor imagen grande de un juego: prioriza artwork > screenshot > cover
function pickIgdbBigHeroFallback(g) {
  const art = g.artworks?.[0]?.url || null;
  const shot = g.screenshots?.[0]?.url || null;
  const cover = g.cover?.url || null;
  const raw = art || shot || cover;
  if (!raw) return null;

  return normalizeIgdbImageUrl(raw)
    .replace("t_thumb", "t_1080p")
    .replace("t_screenshot_med", "t_1080p")
    .replace("t_cover_big", "t_1080p");
}

// Transforma la respuesta cruda de IGDB a un objeto limpio para las tarjetas de juego
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

// --- FUNCIONES API ---
// Cada función hace una query distinta a IGDB y devuelve los juegos ya formateados

// Juegos trending — los que más reviews tienen (rating_count > 200)
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

// Busca juegos por nombre — sanitiza las comillas para evitar inyección en la query de IGDB
async function searchGames(query, limit = 20) {
  const safe = String(query || "").replace(/"/g, "");
  const body = `
    search "${safe}";
    fields id,name,slug,summary,rating,rating_count,cover.url,genres.name;
    limit ${limit};
  `;
  const games = await igdbQuery("games", body);
  return (games || []).map((g) => ({
    id: g.id,
    name: g.name,
    slug: g.slug,
    summary: g.summary || "",
    rating: typeof g.rating === "number" ? Math.round(g.rating) : null,
    ratingCount: g.rating_count || 0,
    coverUrl: normalizeIgdbImageUrl(g.cover?.url)
      ? normalizeIgdbImageUrl(g.cover.url).replace("t_thumb", "t_cover_big")
      : null,
    genres: (g.genres || []).map((x) => x.name).slice(0, 2),
  }));
}

// Carga un pool grande de juegos destacados y lo cachea por 6 horas
// De ahí después se toman subconjuntos aleatorios para el carrusel del home
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
  cachedFeaturedPoolExpiry = now + 1000 * 60 * 60 * 6; // 6 horas de caché
  return cachedFeaturedPool;
}

// Devuelve juegos aleatorios del pool cacheado — para que el carrusel varíe en cada visita
async function getRandomFeaturedGames(limit = 10) {
  const pool = await getFeaturedPool(100);
  return shuffleCopy(pool).slice(0, limit);
}

// Lanzamientos recientes — busca juegos de los últimos 4 meses con al menos 5 reviews
async function getNewReleasesGames(limit = 10) {
  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - 120 * 24 * 60 * 60; // 4 meses atrás en segundos UNIX
  const body = `
    fields id,name,slug,rating,rating_count,first_release_date,cover.url,artworks.url,screenshots.url;
    where first_release_date != null
      & first_release_date > ${fromSec}
      & rating_count != null
      & rating_count > 5;
    sort first_release_date desc;
    limit ${limit};
  `;
  const games = await igdbQuery("games", body);
  return (games || []).map(mapGameCard);
}

// Mejor calificados de todos los tiempos — rating_count > 500 para filtrar juegos nicho
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

// --- DETALLE DEL JUEGO ---
// Trae toda la info de un juego para la página de detalle (screenshots, videos, plataformas, etc.)
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
      platforms.id, platforms.name, platforms.abbreviation; 
    where id = ${id};
  `;
  
  const games = await igdbQuery("games", body);
  const g = games?.[0];

  if (!g) return null;

  return {
    id: g.id,
    name: g.name,
    slug: g.slug,
    summary: g.summary || g.storyline || "No description available.",
    storyline: g.storyline,
    year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : "N/A",
    rating: g.rating ? Math.round(g.rating) : null,
    rating_count: g.rating_count || 0,
    coverUrl: normalizeIgdbImageUrl(g.cover?.url)?.replace("t_thumb", "t_cover_big"),
    backdropUrl: pickIgdbBigHeroFallback(g),
    
    // Arrays simples para mostrar texto
    genres: (g.genres || []).map(x => x.name).join(", "),
    companies: (g.involved_companies || []).map(c => c.company.name).join(", "),
    
    // Array de objetos para las Plataformas (ID + Nombre)
    platforms: (g.platforms || []).map(p => ({
      id: p.id,
      name: p.name,
      abbreviation: p.abbreviation || p.name
    })),
    
    screenshots: (g.screenshots || []).map(s => normalizeIgdbImageUrl(s.url)?.replace("t_thumb", "t_1080p")).slice(0, 4),
    videos: (g.videos || []).map(v => ({ video_id: v.video_id }))
  };
}

// Próximos lanzamientos — juegos con fecha futura y algo de hype (hypes > 5)
async function getUpcomingGames(limit = 10) {
  const nowSec = Math.floor(Date.now() / 1000);
  
  const body = `
    fields id,name,slug,first_release_date,cover.url,rating,rating_count;
    where first_release_date > ${nowSec} 
      & cover != null 
      & hypes > 5; 
    sort first_release_date asc; 
    limit ${limit};
  `;
  const games = await igdbQuery("games", body);
  return (games || []).map(mapGameCard);
}

module.exports = {
  igdbQuery,
  getTrendingGames,
  searchGames,
  getRandomFeaturedGames,
  getNewReleasesGames,
  getBestRatedGames,
  getGameDetails,
  getUpcomingGames
};