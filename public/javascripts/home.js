// Modal de vista rápida y renderizado de juegos en tendencia
(function () {
    const grid = document.getElementById("trendingGrid");
    const errorBox = document.getElementById("trendingError");
  
    // Elementos del modal
    const modal = document.getElementById("quickViewModal");
    const qvTitle = document.getElementById("qvTitle");
    const qvGenres = document.getElementById("qvGenres");
    const qvSummary = document.getElementById("qvSummary");
    const qvImg = document.getElementById("qvImg");
    const qvScore = document.getElementById("qvScore");
    const qvMore = document.getElementById("qvMore");
  
    let lastFocusedEl = null;
  
    // Sanitizar texto para evitar XSS
    function escapeText(s) {
      return (s ?? "").toString();
    }
  
    // Determinar clase CSS según puntuación
    function scoreClass(score) {
      if (score >= 75) return "score-good";
      if (score >= 60) return "score-mid";
      return "score-bad";
    }
  
    // Abrir modal con datos del juego
    function openModal(data) {
      // Guardar elemento con foco anterior para restaurarlo después
      lastFocusedEl = document.activeElement;
  
      // Rellenar datos del modal
      qvTitle.textContent = escapeText(data.name);
      qvGenres.textContent = data.genres?.length ? data.genres.join(" • ") : "—";
      qvSummary.textContent = escapeText(data.summary || "No summary available.");
      qvMore.setAttribute("href", "/games");
  
      // Cargar imagen de portada
      if (data.coverUrl) {
        qvImg.src = data.coverUrl;
        qvImg.alt = `${data.name} cover`;
      } else {
        qvImg.removeAttribute("src");
        qvImg.alt = "";
      }
  
      // Mostrar puntuación con clase correspondiente
      const score = typeof data.rating === "number" ? data.rating : null;
      qvScore.textContent = score !== null ? String(score) : "—";
      qvScore.className = `score-pill ${score !== null ? scoreClass(score) : ""}`;
  
      // Mostrar modal y bloquear scroll del body
      modal.classList.remove("hidden");
      document.body.classList.add("no-scroll");
  
      // Enfocar botón de cerrar para accesibilidad
      const closeBtn = modal.querySelector("[data-modal-close].modal-close");
      closeBtn && closeBtn.focus();
    }
  
    // Cerrar modal y restaurar foco anterior
    function closeModal() {
      modal.classList.add("hidden");
      document.body.classList.remove("no-scroll");
      if (lastFocusedEl && typeof lastFocusedEl.focus === "function") lastFocusedEl.focus();
    }
  
    // Cerrar modal al hacer click en botón de cerrar
    modal.addEventListener("click", (e) => {
      const target = e.target;
      if (target && target.matches("[data-modal-close]")) closeModal();
    });
  
    // Cerrar modal con tecla Escape
    document.addEventListener("keydown", (e) => {
      if (!modal.classList.contains("hidden") && e.key === "Escape") closeModal();
    });
  
    // Renderizar tarjetas de juegos en la cuadrícula
    function renderCards(items) {
      grid.innerHTML = "";
  
      items.forEach((g) => {
        const card = document.createElement("article");
        card.className = "game-card";
        card.tabIndex = 0;
  
        // Sección de portada con imagen y puntuación
        const cover = document.createElement("div");
        cover.className = "game-cover";
        cover.setAttribute("aria-hidden", "true");
  
        if (g.coverUrl) {
          const img = document.createElement("img");
          img.src = g.coverUrl;
          img.alt = `${g.name} cover`;
          img.loading = "lazy";
          cover.appendChild(img);
        } else {
          // Mostrar fallback si no hay imagen
          const fallback = document.createElement("div");
          fallback.className = "cover-fallback";
          fallback.textContent = "No image";
          cover.appendChild(fallback);
        }
  
        // Mostrar puntuación si existe
        if (typeof g.rating === "number") {
          const score = document.createElement("span");
          score.className = `score ${scoreClass(g.rating)}`;
          score.textContent = String(g.rating);
          cover.appendChild(score);
        }
  
        // Sección del cuerpo con título, géneros y descripción
        const body = document.createElement("div");
        body.className = "game-body";
  
        const h3 = document.createElement("h3");
        h3.className = "h3";
        h3.textContent = escapeText(g.name);
  
        // Mostrar hasta 2 géneros
        const chips = document.createElement("div");
        chips.className = "chips";
        if (g.genres?.length) {
          g.genres.slice(0, 2).forEach((x) => {
            const chip = document.createElement("span");
            chip.className = "chip";
            chip.textContent = escapeText(x);
            chips.appendChild(chip);
          });
        }
  
        // Resumen truncado a 120 caracteres
        const desc = document.createElement("p");
        desc.className = "game-desc muted";
        const summary = escapeText(g.summary || "");
        desc.textContent = summary.length > 120 ? summary.slice(0, 120) + "..." : (summary || "No summary.");
  
        // Botones de acción (vista rápida y abrir)
        const actions = document.createElement("div");
        actions.className = "game-actions";
  
        const quickBtn = document.createElement("button");
        quickBtn.className = "btn btn-ghost btn-sm";
        quickBtn.type = "button";
        quickBtn.textContent = "Quick view";
        quickBtn.addEventListener("click", () => openModal(g));
  
        const more = document.createElement("a");
        more.className = "btn btn-primary btn-sm";
        more.href = "/games";
        more.textContent = "Open";
  
        actions.appendChild(quickBtn);
        actions.appendChild(more);
  
        body.appendChild(h3);
        if (chips.childNodes.length) body.appendChild(chips);
        body.appendChild(desc);
        body.appendChild(actions);
  
        card.appendChild(cover);
        card.appendChild(body);
  
        // Permitir abrir modal con tecla Enter
        card.addEventListener("keydown", (e) => {\n          if (e.key === "Enter") openModal(g);\n        });\n  \n        grid.appendChild(card);\n      });\n    }\n  \n    // Cargar juegos en tendencia del servidor\n    async function loadTrending() {\n      try {\n        const res = await fetch("/api/igdb/trending?limit=6");\n        const json = await res.json();\n  \n        if (!json.ok) throw new Error("Trending not ok");\n  \n        renderCards(json.data || []);\n      } catch (e) {\n        // Mostrar error si falla la carga\n        grid.innerHTML = "";\n        errorBox.classList.remove("hidden");\n      }\n    }\n  \n    // Cargar juegos al iniciar\n    loadTrending();\n  })();
  