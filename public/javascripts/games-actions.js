// Manejo de acciones de la interfaz de juegos (navegación, botones y grid)
document.addEventListener("DOMContentLoaded", () => {
    // --- NAVEGACIÓN DE TARJETAS DE JUEGO ---
    // Manejar clicks en las tarjetas para ir al detalle del juego
    const gameCards = document.querySelectorAll(".game-card");
  
    gameCards.forEach((card) => {
      // Click en tarjeta para navegar al juego
      card.addEventListener("click", (e) => {
        // Evitar navegación si hacemos click en botones o enlaces dentro de la tarjeta
        if (e.target.closest("button") || e.target.closest("a")) return;
  
        const gameId = card.getAttribute("data-game-id");
        if (gameId) {
          window.location.href = `/games/${gameId}`;
        }
      });
  
      // Accesibilidad: Permitir abrir con tecla ENTER si la tarjeta tiene foco
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const gameId = card.getAttribute("data-game-id");
          if (gameId) window.location.href = `/games/${gameId}`;
        }
      });
    });
  
    // --- BOTONES DE NAVEGACIÓN RÁPIDA ---
    // Botón para ir a la sección de mejores juegos
    const jumpToBestBtn = document.getElementById("jumpToBest");
    if (jumpToBestBtn) {
      jumpToBestBtn.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("best")?.scrollIntoView({ behavior: "smooth" });
      });
    }
  
    // Botón para ir a la sección de juegos en tendencia
    const exploreTrendingBtn = document.getElementById("exploreTrending");
    if (exploreTrendingBtn) {
      exploreTrendingBtn.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("trending")?.scrollIntoView({ behavior: "smooth" });
      });
    }
    
    // --- BOTÓN "VER TODO" - EXPANDIR SLIDER A GRID ---
    const seeAllButtons = document.querySelectorAll(".btn-see-all");
    const normalMode = document.getElementById("normalMode");
    const searchMode = document.getElementById("searchMode");
    const resultsGrid = document.getElementById("resultsGrid");
    const resultsTitle = document.getElementById("resultsTitle");
    const resultsMeta = document.getElementById("resultsMeta");
    
    // Limpiar estados previos de carga y error
    const resetSearchMode = () => {
      resultsGrid.innerHTML = "";
      document.getElementById("resultsLoading").classList.add("hidden");
      document.getElementById("resultsEmpty").classList.add("hidden");
      document.getElementById("resultsError").classList.add("hidden");
    };

    // Agregar listener a cada botón "Ver todo"
    seeAllButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const sectionId = btn.getAttribute("data-section-target");
        const sectionEl = document.getElementById(sectionId);
        
        if (!sectionEl) return;

        // Obtener todas las tarjetas y título de la sección
        const cards = sectionEl.querySelectorAll(".game-card");
        const sectionTitleText = sectionEl.querySelector(".slider-block__title").innerText;

        if (cards.length === 0) return;

        // Limpiar grid previo
        resetSearchMode();
        
        // Actualizar título y contar juegos
        resultsTitle.innerHTML = `
          <button id="btnBackToSliders" class="btn btn-ghost btn-sm" style="margin-right:10px;">← Atrás</button>
          ${sectionTitleText}
        `;
        resultsMeta.innerText = `Mostrando todos los ${cards.length} juegos`;

        // Clonar tarjetas al grid (cloneNode no copia eventos)
        cards.forEach(card => {
          const clone = card.cloneNode(true);
          // Reactivar evento click en el clon
          clone.addEventListener("click", () => {
            const gid = clone.getAttribute("data-game-id");
            if(gid) window.location.href = `/games/${gid}`;
          });
          resultsGrid.appendChild(clone);
        });

        // Cambiar de vista (ocultar sliders, mostrar grid)
        normalMode.classList.add("hidden");
        searchMode.classList.remove("hidden");
        searchMode.scrollIntoView({ behavior: "smooth" });

        // Botón para volver a la vista de sliders
        document.getElementById("btnBackToSliders").addEventListener("click", () => {
          searchMode.classList.add("hidden");
          normalMode.classList.remove("hidden");
          // Limpiar grid
          resultsTitle.innerText = "Resultados de búsqueda";
          resultsMeta.innerText = "";
          resultsGrid.innerHTML = "";
        });
      });
    });
  });