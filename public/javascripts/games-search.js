// Modulo de busqueda de juegos — incluye busqueda en tiempo real con debounce y seleccion aleatoria
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
  
    // Si falta algun elemento esencial, no inicializamos nada (puede ser otra pagina)
    if (!form || !input || !btnSearch || !btnRandom || !normalMode || !searchMode || !resultsGrid) return;
  
    // Helpers para toggle de visibilidad con clase CSS "hidden"
    function show(el) { el && el.classList.remove("hidden"); }
    function hide(el) { el && el.classList.add("hidden"); }
  
    // Alternar entre modo "browse" (catalogo normal) y "search" (resultados de busqueda)
    function setMode(mode) {
      if (mode === "browse") {
        show(normalMode);
        hide(searchMode);
      } else {
        hide(normalMode);
        show(searchMode);
      }
    }
  
    // Limpiar estados de carga y errores
    function resetStates() {
      hide(stateLoading);
      hide(stateEmpty);
      hide(stateError);
    }
  
    // Escapar caracteres especiales HTML
    function escapeHtml(str) {
      return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
  
    // La API puede devolver array directo, { data: [] }, o { results: [] } — normalizamos a array
    function normalizeApiResponse(payload) {
      if (!payload) return [];
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload.data)) return payload.data;
      if (Array.isArray(payload.results)) return payload.results;
      return [];
    }
  
    // Generar el HTML de una tarjeta de juego para el grid de resultados
    function buildCard(game) {
      const name = escapeHtml(game?.name || "Unknown");
      const cover = escapeHtml(game?.coverUrl || game?.heroFallbackUrl || "/images/Community.png");
      const year = game?.year || "";
      const genre = game?.genres?.[0]?.name || "";
      const sub = escapeHtml(year && genre ? `${year} · ${genre}` : year || genre || "");

      // Badge de rating coloreado segun la nota (verde >75, amarillo >50, rojo <50)
      const rating = (game?.rating !== null && game?.rating !== undefined) ? Math.round(game.rating) : null;
      const ratingClass = rating ? (rating >= 75 ? "rating-good" : (rating >= 50 ? "rating-mid" : "rating-bad")) : "";
      const ratingBadge = rating
        ? `<span class="rating-badge-float ${ratingClass}">${rating}</span>`
        : "";

      return `
        <article class="game-card" tabindex="0" data-game-id="${escapeHtml(game?.id ?? "")}" style="cursor: pointer;">
          <a class="card-link-wrapper">
            <div class="game-card__media">
              <img src="${cover}" alt="${name} cover" loading="lazy" />
              <div class="card-overlay-actions">
                <button class="action-btn library" title="Add to Library"><i class="fas fa-plus"></i></button>
                <button class="action-btn favorite" title="Favorite"><i class="far fa-heart"></i></button>
              </div>
              ${ratingBadge}
            </div>
            <div class="game-card__body">
              <h3 class="game-card__title" title="${name}">${name}</h3>
              ${sub ? `<p class="game-card__sub"><span class="muted">${sub}</span></p>` : ""}
            </div>
          </a>
        </article>
      `;
    }
  
    // Renderizar resultados de búsqueda en la cuadrícula
    function renderResults(list, title, meta) {
      if (resultsTitle) resultsTitle.textContent = title;
      if (resultsMeta) resultsMeta.textContent = meta;
      resultsGrid.innerHTML = list.map(buildCard).join("");
    }
  
    let debounceTimer = null;
    let inFlightController = null; // AbortController para cancelar peticiones en vuelo
    let stickySearchMode = false; // true cuando se muestra la seleccion random (no volver a browse al limpiar)
  
    // Fetch con abort automatico — si hay una peticion anterior pendiente, la cancelamos
    async function fetchJson(url) {
      if (inFlightController) inFlightController.abort();
      inFlightController = new AbortController();
  
      const res = await fetch(url, { signal: inFlightController.signal });
      const payload = await res.json().catch(() => null);
  
      // Validar respuesta exitosa
      if (!res.ok || !payload || payload.ok === false) {
        throw new Error(payload?.error || payload?.message || "Request failed");
      }
  
      return normalizeApiResponse(payload);
    }
  
    // Busqueda principal — peticion GET a /api/igdb/search con el termino del usuario
    async function doSearch(q) {
      const query = (q || "").trim();
  
      // Sin termino de busqueda — volvemos al browse normal (salvo que haya random activo)
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
        // Peticion GET al proxy IGDB de nuestro servidor
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
  
    // Cargar 20 juegos aleatorios — el boton de "dado" del UI
    async function loadRandom() {
      stickySearchMode = true;
      setMode("search");
      resetStates();
      show(stateLoading);
      resultsGrid.innerHTML = "";
      if (resultsMeta) resultsMeta.textContent = "";
  
      try {
        // Obtener 20 juegos aleatorios del servidor
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
  
    // Debounce de 350ms — no queremos hacer un fetch por cada tecla que se presiona
    function scheduleSearch(q) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => doSearch(q), 350);
    }
  
    // --- EVENTOS ---

    // Boton X para limpiar la busqueda y volver al catalogo
    const btnClear = document.getElementById("btnClearSearch");
    if (btnClear) {
      btnClear.addEventListener("click", () => {
        stickySearchMode = false;
        input.value = "";
        if (inFlightController) inFlightController.abort();
        resetStates();
        resultsGrid.innerHTML = "";
        setMode("browse");
        input.focus();
      });
    }

    // Submit del form — previene el comportamiento default y busca directo
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearTimeout(debounceTimer);
      doSearch(input.value);
    });
  
    // Cada vez que cambia el input, programamos una busqueda con debounce
    input.addEventListener("input", () => {
      const q = input.value;
      if (!q.trim()) {
        doSearch("");
        return;
      }
      scheduleSearch(q);
    });
  
    // Enter = buscar inmediato (sin esperar debounce), Escape = limpiar todo
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
  
    // Click en botón de búsqueda
    btnSearch.addEventListener("click", (e) => {
      e.preventDefault();
      clearTimeout(debounceTimer);
      doSearch(input.value);
    });
  
    // Click en botón de selección aleatoria
    btnRandom.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      loadRandom();
    });
  
    // Delegacion de eventos en el grid — al clickear una tarjeta, ir al detalle del juego
    resultsGrid.addEventListener("click", (e) => {
      const card = e.target.closest(".game-card");
      if (card && card.dataset.gameId) {
        window.location.href = `/games/${card.dataset.gameId}`;
      }
    });
  
    // Init
    setMode("browse");
  })();