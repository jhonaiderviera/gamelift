document.addEventListener("DOMContentLoaded", () => {
    // 1. Manejo de clicks en las tarjetas de juego (Navegación)
    const gameCards = document.querySelectorAll(".game-card");
  
    gameCards.forEach((card) => {
      card.addEventListener("click", (e) => {
        // Evitamos que salte si hacemos click en un botón específico dentro de la card (si lo hubiera)
        if (e.target.closest("button") || e.target.closest("a")) return;
  
        const gameId = card.getAttribute("data-game-id");
        if (gameId) {
          window.location.href = `/games/${gameId}`;
        }
      });
  
      // Accesibilidad: Permitir abrir con ENTER si la tarjeta tiene foco
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const gameId = card.getAttribute("data-game-id");
          if (gameId) window.location.href = `/games/${gameId}`;
        }
      });
    });
  
    // 2. Otros botones de la UI (Trending, Jump to Best, etc.)
    const jumpToBestBtn = document.getElementById("jumpToBest");
    if (jumpToBestBtn) {
      jumpToBestBtn.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("best")?.scrollIntoView({ behavior: "smooth" });
      });
    }
  
    const exploreTrendingBtn = document.getElementById("exploreTrending");
    if (exploreTrendingBtn) {
      exploreTrendingBtn.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("trending")?.scrollIntoView({ behavior: "smooth" });
      });
    }
    /* --- 3. Lógica del botón SEE ALL --- */
  const seeAllButtons = document.querySelectorAll(".btn-see-all");
  const normalMode = document.getElementById("normalMode");
  const searchMode = document.getElementById("searchMode");
  const resultsGrid = document.getElementById("resultsGrid");
  const resultsTitle = document.getElementById("resultsTitle");
  const resultsMeta = document.getElementById("resultsMeta");
  
  // Limpiamos estados previos
  const resetSearchMode = () => {
    resultsGrid.innerHTML = "";
    document.getElementById("resultsLoading").classList.add("hidden");
    document.getElementById("resultsEmpty").classList.add("hidden");
    document.getElementById("resultsError").classList.add("hidden");
  };

  seeAllButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const sectionId = btn.getAttribute("data-section-target");
      const sectionEl = document.getElementById(sectionId);
      
      if (!sectionEl) return;

      // 1. Obtener datos: Clonamos las cards del slider correspondiente
      const cards = sectionEl.querySelectorAll(".game-card");
      const sectionTitleText = sectionEl.querySelector(".slider-block__title").innerText;

      if (cards.length === 0) return;

      // 2. Preparar la vista de Grid
      resetSearchMode();
      
      // Cambiar título y añadir botón de volver
      resultsTitle.innerHTML = `
        <button id="btnBackToSliders" class="btn btn-ghost btn-sm" style="margin-right:10px;">← Back</button>
        ${sectionTitleText}
      `;
      resultsMeta.innerText = `Showing all ${cards.length} titles`;

      // 3. Insertar clones en el grid
      cards.forEach(card => {
        const clone = card.cloneNode(true);
        // Reactivar el evento click en el clon (porque cloneNode no copia eventos)
        clone.addEventListener("click", () => {
          const gid = clone.getAttribute("data-game-id");
          if(gid) window.location.href = `/games/${gid}`;
        });
        resultsGrid.appendChild(clone);
      });

      // 4. Cambiar visibilidad (Toggle)
      normalMode.classList.add("hidden");
      searchMode.classList.remove("hidden");
      searchMode.scrollIntoView({ behavior: "smooth" });

      // 5. Activar botón "Back"
      document.getElementById("btnBackToSliders").addEventListener("click", () => {
        searchMode.classList.add("hidden");
        normalMode.classList.remove("hidden");
        // Resetear título del search por si acaso
        resultsTitle.innerText = "Search Results";
        resultsMeta.innerText = "";
        resultsGrid.innerHTML = "";
      });
    });
  });
  });