// /public/javascripts/games-search.js
// Realtime search + Random picks logic
(function () {
    const form = document.getElementById("gamesSearchForm");
    const input = document.getElementById("searchInput");
    const btnSearch = document.getElementById("btnSearch");
    const btnRandom = document.getElementById("btnRandom");
  
    const normalMode = document.getElementById("normalMode");
    const searchMode = document.getElementById("searchMode");
  
    const resultsTitle = document.getElementById("resultsTitle");
    const resultsMeta = document.getElementById("resultsMeta");
  
    const stateLoading = document.getElementById("resultsLoading");
    const stateEmpty = document.getElementById("resultsEmpty");
    const stateError = document.getElementById("resultsError");
  
    const resultsGrid = document.getElementById("resultsGrid");
  
    // Guard: if accidentally loaded on another page, do nothing
    if (!form || !input || !btnSearch || !btnRandom || !normalMode || !searchMode || !resultsGrid) return;
  
    function show(el) { el && el.classList.remove("hidden"); }
    function hide(el) { el && el.classList.add("hidden"); }
  
    function setMode(mode) {
      if (mode === "browse") {
        show(normalMode);
        hide(searchMode);
      } else {
        hide(normalMode);
        show(searchMode);
      }
    }
  
    function resetStates() {
      hide(stateLoading);
      hide(stateEmpty);
      hide(stateError);
    }
  
    function escapeHtml(str) {
      return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
  
    function normalizeApiResponse(payload) {
      if (!payload) return [];
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload.data)) return payload.data;
      if (Array.isArray(payload.results)) return payload.results;
      return [];
    }
  
    function buildCard(game) {
      const name = escapeHtml(game?.name || "Unknown");
      // Usamos una imagen por defecto si no hay cover
      const cover = escapeHtml(game?.coverUrl || game?.heroFallbackUrl || "/images/Community.png");
      const rating = (game?.rating !== null && game?.rating !== undefined) ? Math.round(game.rating) : "—";
      const votes = game?.ratingCount ? `${Number(game.ratingCount).toLocaleString()} votes` : "No votes yet";
  
      // Nota: Añadimos tabindex y cursor pointer para accesibilidad
      return `
        <article class="game-card" tabindex="0" data-game-id="${escapeHtml(game?.id ?? "")}" style="cursor: pointer;">
          <div class="game-card__media">
            <img src="${cover}" alt="${name} cover" loading="lazy" />
            <div class="game-card__overlay">
              <div class="game-card__meta">
                <span class="pill">View details</span>
                <span class="rating-badge">${rating}</span>
              </div>
            </div>
          </div>
          <div class="game-card__body">
            <h3 class="game-card__title" title="${name}">${name}</h3>
            <p class="game-card__sub"><span class="muted">${escapeHtml(votes)}</span></p>
          </div>
        </article>
      `;
    }
  
    function renderResults(list, title, meta) {
      if (resultsTitle) resultsTitle.textContent = title;
      if (resultsMeta) resultsMeta.textContent = meta;
      resultsGrid.innerHTML = list.map(buildCard).join("");
    }
  
    let debounceTimer = null;
    let inFlightController = null;
    let stickySearchMode = false; // true when random is displayed
  
    async function fetchJson(url) {
      if (inFlightController) inFlightController.abort();
      inFlightController = new AbortController();
  
      const res = await fetch(url, { signal: inFlightController.signal });
      const payload = await res.json().catch(() => null);
  
      if (!res.ok || !payload || payload.ok === false) {
        throw new Error(payload?.error || payload?.message || "Request failed");
      }
  
      return normalizeApiResponse(payload);
    }
  
    async function doSearch(q) {
      const query = (q || "").trim();
  
      if (!query) {
        if (stickySearchMode) {
          setMode("search");
          resetStates();
          return;
        }
  
        if (inFlightController) inFlightController.abort();
        setMode("browse");
        resetStates();
        resultsGrid.innerHTML = "";
        if (resultsTitle) resultsTitle.textContent = "Search results";
        if (resultsMeta) resultsMeta.textContent = "";
        return;
      }
  
      stickySearchMode = false;
      setMode("search");
      resetStates();
      show(stateLoading);
      resultsGrid.innerHTML = "";
      if (resultsMeta) resultsMeta.textContent = "";
  
      try {
        const list = await fetchJson(`/api/igdb/search?q=${encodeURIComponent(query)}`);
        resetStates();
  
        if (!list.length) {
          renderResults([], `Search results for "${query}"`, "0 results");
          show(stateEmpty);
          return;
        }
        renderResults(list, `Search results for "${query}"`, `${list.length} results`);
      } catch (e) {
        if (e?.name === "AbortError") return;
        resetStates();
        show(stateError);
        renderResults([], "Search results", "");
      } finally {
        hide(stateLoading);
      }
    }
  
    async function loadRandom() {
      stickySearchMode = true;
      setMode("search");
      resetStates();
      show(stateLoading);
      resultsGrid.innerHTML = "";
      if (resultsMeta) resultsMeta.textContent = "";
  
      try {
        const list = await fetchJson(`/api/igdb/random?limit=20`);
        resetStates();
  
        if (!list.length) {
          renderResults([], "Random picks", "0 results");
          show(stateEmpty);
          return;
        }
        renderResults(list, "Random picks", `${list.length} results`);
      } catch (e) {
        if (e?.name === "AbortError") return;
        resetStates();
        show(stateError);
        renderResults([], "Random picks", "");
      } finally {
        hide(stateLoading);
      }
    }
  
    function scheduleSearch(q) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => doSearch(q), 350);
    }
  
    // --- EVENTS ---
  
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearTimeout(debounceTimer);
      doSearch(input.value);
    });
  
    input.addEventListener("input", () => {
      const q = input.value;
      if (!q.trim()) {
        doSearch("");
        return;
      }
      scheduleSearch(q);
    });
  
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(debounceTimer);
        doSearch(input.value);
      }
      if (e.key === "Escape") {
        stickySearchMode = false;
        input.value = "";
        doSearch("");
      }
    });
  
    btnSearch.addEventListener("click", (e) => {
      e.preventDefault();
      clearTimeout(debounceTimer);
      doSearch(input.value);
    });
  
    btnRandom.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      loadRandom();
    });
  
    // --- NUEVO: LISTENER DE NAVEGACIÓN ---
    // Detecta clicks en las tarjetas generadas dinámicamente y redirige
    resultsGrid.addEventListener("click", (e) => {
      // Busca la tarjeta más cercana al elemento clickeado
      const card = e.target.closest(".game-card");
      
      // Si existe la tarjeta y tiene ID, navegamos
      if (card && card.dataset.gameId) {
        window.location.href = `/games/${card.dataset.gameId}`;
      }
    });
  
    // Init
    setMode("browse");
  })();