/* Ubicación: /public/javascripts/games-actions.js */

document.addEventListener('DOMContentLoaded', () => {
  
  // Detectar botones en Catálogo (clase .action-btn) y en Detalle (clase .js-manage-...)
  const btns = document.querySelectorAll('.action-btn, .js-manage-library, .js-manage-favorite');

  const toggleAction = async (btn) => {
    // Determinar tipo de acción (Librería o Favorito)
    const isLibrary = btn.classList.contains('library') || btn.classList.contains('js-manage-library');
    const endpoint = isLibrary ? '/users/library/toggle' : '/users/favorites/toggle';

    // Obtener datos del juego
    // Caso 1: Desde tarjeta del catálogo
    let card = btn.closest('.game-card');
    let gameId, gameName, coverUrl;

    if (card) {
      gameId = card.dataset.gameId || card.dataset.id;
      gameName = card.dataset.name;
      coverUrl = card.dataset.cover;
    } else {
      // Caso 2: Desde pantalla de detalle (buscamos el contenedor padre con los datos)
      const container = document.querySelector('.detail-header');
      if (container) {
        gameId = container.dataset.gameId;
        gameName = container.dataset.name;
        coverUrl = container.dataset.cover;
      }
    }

    if (!gameId) return console.error("No game ID found");

    // Guardar estado visual original para restaurar si falla
    const originalContent = btn.innerHTML;
    // Detectar si es un botón grande (pantalla detalle) o pequeño (tarjeta)
    const isDetailBtn = btn.tagName === 'BUTTON' && btn.classList.contains('btn'); 
    
    // Mostrar estado de carga
    if (isDetailBtn) {
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    } else {
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    btn.disabled = true;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, gameName, coverUrl })
      });

      if (response.status === 401) {
        // Si no está logueado, redirigir al login
        window.location.href = '/auth/login';
        return;
      }

      const data = await response.json();

      if (data.status === 'added') {
        // --- ESTADO: AGREGADO ---
        btn.classList.add('active');
        
        if (isDetailBtn) {
          // Botón grande de detalle
          if (isLibrary) btn.innerHTML = '<i class="fas fa-check"></i> In Library';
          else btn.innerHTML = '<i class="fas fa-heart"></i> Favorited';
        } else {
          // Botón pequeño de tarjeta
          if (isLibrary) btn.innerHTML = '<i class="fas fa-check"></i>';
          else btn.innerHTML = '<i class="fas fa-heart"></i>';
        }

      } else {
        // --- ESTADO: REMOVIDO ---
        btn.classList.remove('active');
        
        if (isDetailBtn) {
          if (isLibrary) btn.innerHTML = '<i class="fas fa-plus"></i> Add to Library';
          else btn.innerHTML = '<i class="far fa-heart"></i> Favorite';
        } else {
          if (isLibrary) btn.innerHTML = '<i class="fas fa-plus"></i>';
          else btn.innerHTML = '<i class="far fa-heart"></i>';
        }
      }

    } catch (err) {
      console.error(err);
      btn.innerHTML = originalContent;
    } finally {
      btn.disabled = false;
      // Restaurar icono de carpeta en tarjeta tras 1.5s si se agregó correctamente
      if (!isDetailBtn && isLibrary && btn.classList.contains('active')) {
        setTimeout(() => btn.innerHTML = '<i class="fas fa-folder"></i>', 1500);
      }
    }
  };

  // Asignar Click Listener a todos los botones detectados
  btns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleAction(btn);
    });
  });

  // Check inicial de estado (Cargar qué juegos tiene ya el usuario)
  const checkState = async () => {
    try {
      const res = await fetch('/users/my-games');
      if (!res.ok) return;
      const { library, favorites } = await res.json();

      // Actualizar botones de Librería
      library.forEach(id => {
        // Selectores para botones en catálogo y detalle
        const selectors = [
          `.game-card[data-game-id="${id}"] .action-btn.library`,
          `.game-card[data-id="${id}"] .action-btn.library`,
          `.detail-header[data-game-id="${id}"] .js-manage-library` // Selector específico detalle
        ];
        
        document.querySelectorAll(selectors.join(',')).forEach(btn => {
          btn.classList.add('active');
          if (btn.classList.contains('btn')) { // Es botón de detalle
            btn.innerHTML = '<i class="fas fa-check"></i> In Library';
          } else { // Es botón de tarjeta
            btn.innerHTML = '<i class="fas fa-folder"></i>';
          }
        });
      });

      // Actualizar botones de Favoritos
      favorites.forEach(id => {
        const selectors = [
          `.game-card[data-game-id="${id}"] .action-btn.favorite`,
          `.game-card[data-id="${id}"] .action-btn.favorite`,
          `.detail-header[data-game-id="${id}"] .js-manage-favorite`
        ];

        document.querySelectorAll(selectors.join(',')).forEach(btn => {
          btn.classList.add('active');
          if (btn.classList.contains('btn')) {
            btn.innerHTML = '<i class="fas fa-heart"></i> Favorited';
          } else {
            btn.innerHTML = '<i class="fas fa-heart"></i>';
          }
        });
      });

    } catch (e) { /* Usuario no logueado, ignorar */ }
  };

  checkState();
});