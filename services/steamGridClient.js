// SteamGridDB nos da imágenes hero/banner de juegos — IGDB no siempre tiene buenas
const SGDB_BASE_URL = "https://www.steamgriddb.com/api/v2";

// Caché en memoria para no bombardear la API con requests repetidos
const cache = new Map(); // key -> { value, expiresAt }

// Devuelve el valor cacheado o null si expiró
function cacheGet(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

// Guarda en caché con TTL — por defecto 1 hora
function cacheSet(key, value, ttlMs = 1000 * 60 * 60) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// Hace un GET a la API de SteamGridDB con la API key del .env
// Timeout de 3s para que si la API está lenta no nos tranque la página
async function sgdbGet(path) {
  const key = mustGetEnv("STEAMGRIDDB_API_KEY");

  const res = await fetch(`${SGDB_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(3000), // 3s máximo — si no responde, tiramos error
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SteamGridDB error ${res.status}: ${text}`);
  }

  return res.json();
}

// Busca juegos por nombre en SteamGridDB — devuelve sugerencias para encontrar el ID correcto
async function autocomplete(term) {
  const safe = encodeURIComponent(term);
  return sgdbGet(`/search/autocomplete/${safe}`);
}

// Trae todas las imágenes hero disponibles de un juego por su ID de SteamGridDB
async function heroesByGameId(gameId) {
  return sgdbGet(`/heroes/game/${gameId}`);
}

// De todas las imágenes hero, elige la mejor: prioriza resolución alta y buen score
function pickBestHeroMeta(heroes) {
  const list = Array.isArray(heroes) ? heroes : [];
  if (!list.length) return null;

  const norm = (h) => {
    const w = Number(h.width || 0);
    const ht = Number(h.height || 0);
    return {
      url: h.url || null,
      width: w,
      height: ht,
      area: w * ht,
      score: Number(h.score || 0),
      mime: String(h.mime || ""),
    };
  };

  const sorted = list
    .map(norm)
    .filter((x) => x.url)
    .sort((a, b) => {
      if (b.area !== a.area) return b.area - a.area;
      if (b.score !== a.score) return b.score - a.score;
      return 0;
    });

  // Prefer image/* if mime exists
  const best = sorted.find((x) => x.mime.startsWith("image/")) || sorted[0];
  return best || null;
}

// Dado un nombre de juego, busca en SGDB y devuelve la mejor imagen hero
// Primero busca el juego por nombre (autocomplete), luego pide sus heroes
// Cachea resultados 6h si encuentra algo, 30min si no (para no reintentar muy seguido)
async function getHeroMetaByGameName(name) {
  const cacheKey = `heroMetaByName:${String(name).toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached !== null) return cached;

  try {
    const ac = await autocomplete(name);
    const first = ac?.data?.[0];
    if (!first?.id) {
      cacheSet(cacheKey, null, 1000 * 60 * 30); // 30min caché para "no encontrado"
      return null;
    }

    const heroes = await heroesByGameId(first.id);
    const meta = pickBestHeroMeta(heroes?.data);

    cacheSet(cacheKey, meta, 1000 * 60 * 60 * 6); // 6 horas de caché exitoso
    return meta;
  } catch (e) {
    cacheSet(cacheKey, null, 1000 * 60 * 30);
    return null;
  }
}

module.exports = {
  autocomplete,
  heroesByGameId,
  getHeroMetaByGameName,
};
