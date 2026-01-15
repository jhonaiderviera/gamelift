const SGDB_BASE_URL = "https://www.steamgriddb.com/api/v2";

const cache = new Map(); // key -> { value, expiresAt }

function cacheGet(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function cacheSet(key, value, ttlMs = 1000 * 60 * 60) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function sgdbGet(path) {
  const key = mustGetEnv("SGDB_API_KEY");

  const res = await fetch(`${SGDB_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SteamGridDB error ${res.status}: ${text}`);
  }

  return res.json();
}

async function autocomplete(term) {
  const safe = encodeURIComponent(term);
  return sgdbGet(`/search/autocomplete/${safe}`);
}

async function heroesByGameId(gameId) {
  return sgdbGet(`/heroes/game/${gameId}`);
}

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

/**
 * Returns best hero meta for a game name: { url, width, height }
 */
async function getHeroMetaByGameName(name) {
  const cacheKey = `heroMetaByName:${String(name).toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached !== null) return cached; // can be null

  try {
    const ac = await autocomplete(name);
    const first = ac?.data?.[0];
    if (!first?.id) {
      cacheSet(cacheKey, null, 1000 * 60 * 30);
      return null;
    }

    const heroes = await heroesByGameId(first.id);
    const meta = pickBestHeroMeta(heroes?.data);

    cacheSet(cacheKey, meta, 1000 * 60 * 60 * 6);
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
