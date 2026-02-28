/* services/cheapsharkClient.js — CheapShark Price Tracker (API gratuita, sin key) */

// CheapShark compara precios de juegos entre tiendas digitales (Steam, GOG, Humble, etc.)
// No requiere API key — es completamente gratis
const BASE_URL = "https://www.cheapshark.com/api/1.0";
const FETCH_TIMEOUT = 3000; // 3s máximo para no frenar la carga de la página

// Wrapper de fetch con timeout para que la API externa no nos bloquee
function fetchWithTimeout(url, ms = FETCH_TIMEOUT) {
  return fetch(url, { signal: AbortSignal.timeout(ms) });
}

// ── Cache de tiendas (se carga una vez, nunca expira) ──
// La lista de tiendas casi nunca cambia, así que la cacheamos indefinidamente
let cachedStores = null;

// Carga la lista de tiendas de CheapShark y las mapea por ID para acceso rápido
async function getStores() {
  if (cachedStores) return cachedStores;
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/stores`);
    if (!res.ok) throw new Error(`CheapShark stores error: ${res.status}`);
    const stores = await res.json();
    // Transformamos el array a un objeto indexado por storeID para buscar por ID en O(1)
    cachedStores = {};
    stores.forEach(s => {
      if (s.isActive !== 0) { // Solo tiendas activas
        cachedStores[s.storeID] = {
          name: s.storeName,
          icon: `https://www.cheapshark.com${s.images.icon}`,
          logo: `https://www.cheapshark.com${s.images.logo}`,
        };
      }
    });
    console.log(`✅ CheapShark: ${Object.keys(cachedStores).length} stores cached`);
    return cachedStores;
  } catch (err) {
    console.error("❌ CheapShark getStores error:", err.message);
    return {};
  }
}

// ── Cache de deals por juego (TTL 30 min) ──
// Los precios cambian, pero no tan rápido — 30min es razonable para no sobrecargar la API
const dealsCache = new Map();
const DEALS_TTL = 1000 * 60 * 30;

// Busca ofertas activas para un juego por nombre
// Devuelve array con precio de venta, precio normal, % de descuento, y link a la tienda
async function searchDeals(gameName) {
  if (!gameName) return [];

  const cacheKey = gameName.toLowerCase().trim();
  const cached = dealsCache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) return cached.data;

  try {
    const stores = await getStores();
    const encodedName = encodeURIComponent(gameName);
    // Solo pedimos 8 deals, ordenados por precio, y que estén en oferta (onSale=1)
    const res = await fetchWithTimeout(
      `${BASE_URL}/deals?title=${encodedName}&limit=8&sortBy=Price&onSale=1`
    );
    if (!res.ok) throw new Error(`CheapShark deals error: ${res.status}`);
    const rawDeals = await res.json();

    // Filtrar solo deals que realmente coincidan con el juego buscado
    // CheapShark a veces devuelve resultados parciales tipo "Game X: DLC Edition"
    const deals = rawDeals
      .filter(d => {
        const dealTitle = d.title.toLowerCase();
        const searchTitle = gameName.toLowerCase();
        // Coincidencia exacta o que el título del deal contenga el nombre buscado
        return dealTitle === searchTitle || dealTitle.includes(searchTitle) || searchTitle.includes(dealTitle);
      })
      .map(d => {
        const store = stores[d.storeID] || { name: "Unknown", icon: "", logo: "" };
        const savings = parseFloat(d.savings) || 0;
        return {
          storeName: store.name,
          storeIcon: store.icon,
          storeLogo: store.logo,
          salePrice: parseFloat(d.salePrice).toFixed(2),
          normalPrice: parseFloat(d.normalPrice).toFixed(2),
          savingsPercent: Math.round(savings),
          isOnSale: savings > 0,
          isFree: parseFloat(d.salePrice) === 0,
          dealUrl: `https://www.cheapshark.com/redirect?dealID=${d.dealID}`,
        };
      })
      // Si un juego tiene varias ediciones en la misma tienda, nos quedamos solo con la primera
      .filter((deal, idx, arr) => arr.findIndex(d => d.storeName === deal.storeName) === idx);

    // Guardamos en caché para no repetir la búsqueda en los próximos 30 min
    dealsCache.set(cacheKey, { data: deals, expiry: Date.now() + DEALS_TTL });
    return deals;
  } catch (err) {
    console.error(`❌ CheapShark searchDeals("${gameName}") error:`, err.message);
    return [];
  }
}

module.exports = { getStores, searchDeals };
