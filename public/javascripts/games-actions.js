/* Acciones de juegos: agregar a libreria, favoritos, etc.
   Funciona tanto en tarjetas del catalogo como en la pagina de detalle */

document.addEventListener('DOMContentLoaded', () => {

  // Buscar todos los botones de accion — hay dos contextos: catalogo (.action-btn) y detalle (.js-manage-...)
  const btns = document.querySelectorAll('.action-btn, .js-manage-library, .js-manage-favorite');

  // Funcion principal: toggle de agregar/quitar un juego de la libreria o favoritos
  const toggleAction = async (btn) => {
    // Determinar si es accion de libreria o favorito para elegir el endpoint correcto
    const isLibrary = btn.classList.contains('library') || btn.classList.contains('js-manage-library');
    const endpoint = isLibrary ? '/users/library/toggle' : '/users/favorites/toggle';

    // Sacar los datos del juego — depende de si estamos en una tarjeta o en la vista detalle
    let card = btn.closest('.game-card');
    let gameId, gameName, coverUrl;

    if (card) {
      gameId = card.dataset.gameId || card.dataset.id;
      gameName = card.dataset.name;
      coverUrl = card.dataset.cover;
    } else {
      // En la vista detalle, los datos estan en el header
      const container = document.querySelector('.detail-header');
      if (container) {
        gameId = container.dataset.gameId;
        gameName = container.dataset.name;
        coverUrl = container.dataset.cover;
      }
    }

    if (!gameId) return console.error("No game ID found");

    // Guardamos el HTML original del boton por si falla el fetch y hay que revertir
    const originalContent = btn.innerHTML;
    // Hay dos tamanios de boton: grande (detalle) y chico (tarjeta del catalogo)
    const isDetailBtn = btn.tagName === 'BUTTON' && btn.classList.contains('btn'); 
    
    // Spinner de carga mientras esperamos la respuesta del server
    if (isDetailBtn) {
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    } else {
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    btn.disabled = true;

    try {
      // Peticion POST al toggle — el server decide si agrega o remueve
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
        body: JSON.stringify({ gameId, gameName, coverUrl })
      });

      if (response.status === 401) {
        // No esta logueado, lo mandamos al login
        window.location.href = '/auth/login';
        return;
      }

      const data = await response.json();

      // Invalidar caché de sessionStorage para que el proximo checkState traiga datos frescos
      sessionStorage.removeItem(CACHE_KEY);

      if (data.status === 'added') {
        // Juego agregado — actualizar icono y clase CSS
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
        // Juego removido — volver al icono original
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
      // En tarjetas, despues de 1.5s cambiamos el check a icono de carpeta (mas limpio visualmente)
      if (!isDetailBtn && isLibrary && btn.classList.contains('active')) {
        setTimeout(() => btn.innerHTML = '<i class="fas fa-folder"></i>', 1500);
      }
    }
  };

  // Registrar click en cada boton — prevenimos propagacion para que no se dispare el link de la tarjeta
  btns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleAction(btn);
    });
  });

  // Al cargar la pagina, pedimos la lista de juegos del usuario para marcar los botones correctamente
  // OPTIMIZADO: cachea en sessionStorage para no hacer fetch en cada navegacion (ahorra ~70 lecturas/pagina)
  const CACHE_KEY = 'gl_myGames';
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutos de caché — suficiente para navegar sin gastar lecturas

  const checkState = async () => {
    try {
      let library, favorites;

      // Intentar leer de caché primero
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.ts < CACHE_TTL) {
          library = parsed.library;
          favorites = parsed.favorites;
        }
      }

      // Si no hay caché valida, fetch al server
      if (!library) {
        const res = await fetch('/users/my-games');
        if (!res.ok) return;
        const data = await res.json();
        library = data.library;
        favorites = data.favorites;
        // Guardar en sessionStorage con timestamp
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ library, favorites, ts: Date.now() }));
      }

      // Marcar como activos los botones de juegos que ya estan en la libreria
      // library ahora puede ser un objeto {id: status} o un array — soportamos ambos
      const libraryIds = Array.isArray(library) ? library : Object.keys(library || {});
      libraryIds.forEach(id => {
        const selectors = [
          `.game-card[data-game-id="${id}"] .action-btn.library`,
          `.game-card[data-id="${id}"] .action-btn.library`,
          `.detail-header[data-game-id="${id}"] .js-manage-library`
        ];

        document.querySelectorAll(selectors.join(',')).forEach(btn => {
          btn.classList.add('active');
          if (btn.classList.contains('btn')) {
            btn.innerHTML = '<i class="fas fa-check"></i> In Library';
          } else {
            btn.innerHTML = '<i class="fas fa-folder"></i>';
          }
        });
      });

      // Lo mismo pero para los favoritos
      const favIds = Array.isArray(favorites) ? favorites : Object.keys(favorites || {});
      favIds.forEach(id => {
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