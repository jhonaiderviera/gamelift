/* discover-swiper.js — Swiper estilo Tinder para descubrir juegos nuevos */

(function () {
  // Los juegos vienen inyectados desde el server en variables globales del EJS
  const games = window.__discoverGames || [];
  const isLoggedIn = window.__isLoggedIn;

  // Referencias al DOM del swiper
  const stack = document.getElementById("cardStack");
  const counter = document.getElementById("discoverCounter");
  const emptyState = document.getElementById("discoverEmpty");
  const actions = document.getElementById("discoverActions");
  const btnSkip = document.getElementById("btnSkip");
  const btnBacklog = document.getElementById("btnBacklog");
  const btnInfo = document.getElementById("btnInfo");

  let currentIndex = 0;
  const SWIPE_THRESHOLD = 100; // pixeles minimos para que cuente como swipe
  const MAX_VISIBLE = 3; // cuantas tarjetas se ven apiladas

  // Renderizar las tarjetas visibles en el stack (maximo MAX_VISIBLE)
  function renderCards() {
    stack.innerHTML = "";
    if (games.length === 0) {
      showEmpty();
      return;
    }
    updateCounter();

    // Las renderizamos en orden inverso para que la primera quede arriba en z-index
    const end = Math.min(currentIndex + MAX_VISIBLE, games.length);
    for (let i = end - 1; i >= currentIndex; i--) {
      const game = games[i];
      const depth = i - currentIndex; // 0 = top, 1 = behind, 2 = further
      const card = createCard(game, depth);
      stack.appendChild(card);
    }
  }

  // Crear el DOM de una tarjeta — depth indica su posicion en la pila (0 = arriba, visible)
  function createCard(game, depth) {
    const card = document.createElement("div");
    card.className = "swipe-card";
    card.dataset.gameId = game.id;
    card.dataset.depth = depth;

    // Efecto de stack: cada tarjeta detras es un poco mas chica y esta mas abajo
    const scale = 1 - depth * 0.04;
    const translateY = depth * 12;
    card.style.transform = `scale(${scale}) translateY(${translateY}px)`;
    card.style.zIndex = 10 - depth;
    if (depth > 0) card.style.pointerEvents = "none";

    const ratingHtml = game.rating
      ? `<div class="card-rating"><i class="fas fa-star"></i> ${game.rating}</div>`
      : "";

    const genresHtml = game.genres.length > 0
      ? game.genres.map(g => `<span class="card-genre">${g}</span>`).join("")
      : "";

    card.innerHTML = `
      <div class="card-image" style="background-image: url('${game.heroUrl}');"></div>
      <div class="card-overlay"></div>
      <div class="stamp stamp-like"><i class="fas fa-plus"></i> BACKLOG</div>
      <div class="stamp stamp-nope"><i class="fas fa-times"></i> SKIP</div>
      <div class="card-info">
        ${ratingHtml}
        <h2 class="card-title">${game.name}</h2>
        <div class="card-genres">${genresHtml}</div>
      </div>
    `;

    if (depth === 0) attachSwipe(card); // solo la tarjeta de arriba es swipeable
    return card;
  }

  // Logica de swipe — soporta tanto mouse (desktop) como touch (movil)
  function attachSwipe(card) {
    let startX = 0, startY = 0, currentX = 0, isDragging = false;

    function onStart(x, y) {
      isDragging = true;
      startX = x;
      startY = y;
      card.style.transition = "none";
    }

    // Mover la tarjeta con el dedo/mouse y rotarla ligeramente para el efecto visual
    function onMove(x) {
      if (!isDragging) return;
      currentX = x - startX;
      const rotate = currentX * 0.08;
      card.style.transform = `translateX(${currentX}px) rotate(${rotate}deg)`;

      // Mostrar el sello de BACKLOG o SKIP segun la direccion del swipe
      const likeStamp = card.querySelector(".stamp-like");
      const nopeStamp = card.querySelector(".stamp-nope");
      const opacity = Math.min(Math.abs(currentX) / SWIPE_THRESHOLD, 1);

      if (currentX > 20) {
        likeStamp.style.opacity = opacity;
        nopeStamp.style.opacity = 0;
      } else if (currentX < -20) {
        nopeStamp.style.opacity = opacity;
        likeStamp.style.opacity = 0;
      } else {
        likeStamp.style.opacity = 0;
        nopeStamp.style.opacity = 0;
      }
    }

    // Al soltar: si paso el umbral, ejecutar la accion. Si no, volver a su lugar (snap back)
    function onEnd() {
      if (!isDragging) return;
      isDragging = false;
      card.style.transition = "transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.4s";

      if (currentX > SWIPE_THRESHOLD) {
        flyOut(card, "right");
        addToBacklog(games[currentIndex]);
      } else if (currentX < -SWIPE_THRESHOLD) {
        flyOut(card, "left");
        skipGame();
      } else {
        // Snap back
        card.style.transform = "translateX(0) rotate(0)";
        card.querySelector(".stamp-like").style.opacity = 0;
        card.querySelector(".stamp-nope").style.opacity = 0;
      }
      currentX = 0;
    }

    // Eventos de mouse para desktop
    card.addEventListener("mousedown", (e) => {
      e.preventDefault();
      onStart(e.clientX, e.clientY);
    });
    document.addEventListener("mousemove", (e) => onMove(e.clientX));
    document.addEventListener("mouseup", () => onEnd());

    // Eventos touch para movil — passive:true para no bloquear el scroll del browser
    card.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      onStart(t.clientX, t.clientY);
    }, { passive: true });
    card.addEventListener("touchmove", (e) => {
      onMove(e.touches[0].clientX);
    }, { passive: true });
    card.addEventListener("touchend", () => onEnd());
  }

  // Animacion de salida — la tarjeta "vuela" hacia la izq o derecha y se desvanece
  function flyOut(card, direction) {
    const x = direction === "right" ? window.innerWidth : -window.innerWidth;
    card.style.transform = `translateX(${x}px) rotate(${direction === "right" ? 30 : -30}deg)`;
    card.style.opacity = "0";
    card.style.pointerEvents = "none";

    setTimeout(() => {
      currentIndex++;
      if (currentIndex >= games.length) {
        showEmpty();
      } else {
        renderCards();
      }
    }, 300);
  }

  // Agregar juego al backlog del usuario via POST — solo si esta logueado
  function addToBacklog(game) {
    if (!isLoggedIn || !game) return;
    fetch("/users/library/toggle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": getCsrfToken(),
      },
      body: JSON.stringify({
        gameId: game.id,
        gameName: game.name,
        coverUrl: game.coverUrl,
        status: "backlog",
        fromDiscover: true,
      }),
    }).catch((err) => console.error("Error adding to backlog:", err));
  }

  // Skip = simplemente pasar al siguiente, no se guarda nada en el server
  function skipGame() {
  }

  // Cuando se acaban los juegos, mostrar el estado vacio y ocultar todo lo demas
  function showEmpty() {
    stack.style.display = "none";
    actions.style.display = "none";
    emptyState.style.display = "flex";
    counter.style.display = "none";
  }

  function updateCounter() {
    const remaining = games.length - currentIndex;
    counter.textContent = `${remaining} game${remaining !== 1 ? "s" : ""} left`;
  }

  // Botones de accion — skip (izq), backlog (der), info (abre detalle en nueva tab)
  btnSkip.addEventListener("click", () => {
    const topCard = stack.querySelector('.swipe-card[data-depth="0"]');
    if (!topCard) return;
    topCard.style.transition = "transform 0.4s, opacity 0.4s";
    flyOut(topCard, "left");
  });

  btnBacklog.addEventListener("click", () => {
    const topCard = stack.querySelector('.swipe-card[data-depth="0"]');
    if (!topCard) return;
    topCard.style.transition = "transform 0.4s, opacity 0.4s";
    addToBacklog(games[currentIndex]);
    flyOut(topCard, "right");
  });

  btnInfo.addEventListener("click", () => {
    const game = games[currentIndex];
    if (game) window.open(`/games/${game.id}`, "_blank");
  });

  // Atajo de teclado: flechas izq/der para skip/backlog (solo si estamos en la pagina discover)
  document.addEventListener("keydown", (e) => {
    if (!document.querySelector(".discover-container")) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      btnSkip.click();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      btnBacklog.click();
    }
  });

  // ── Init ──
  renderCards();
})();
