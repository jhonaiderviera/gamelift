async function cargarFondo() {
    try {
      const res = await fetch('/api/igdb/login-background');
      const data = await res.json();
  
      if (res.ok && data.backgroundUrl) {
        const hero = document.querySelector('.hero');
        hero.style.backgroundImage = `url('${data.backgroundUrl}')`;
  
        const titulo = document.querySelector('#heroJuego');
        if (titulo && data.gameName) titulo.textContent = data.gameName;
      }
    } catch (e) {}
  }
  
  // Construir URL de imagen
  function construirImagenCover(imageId) {
    return `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`;
  }
  
  // Buscar juego
  async function buscarJuego(q) {
    const res = await fetch(`/api/igdb/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
  
    if (!res.ok) throw new Error(data?.error || 'Error buscando');
  
    const game = data[0];
    if (!game) throw new Error('Sin resultados');
  
    const coverUrl = game.cover?.image_id ? construirImagenCover(game.cover.image_id) : null;
  
    return {
      name: game.name,
      summary: game.summary || 'Sin descripcion.',
      coverUrl
    };
  }
  
  // Mostrar juego encontrado
  function renderJuego(game) {
    const cont = document.querySelector('#resultado');
    cont.innerHTML = `
      <div class="card">
        <div class="card-grid">
          <div class="cover">
            ${game.coverUrl ? `<img src="${game.coverUrl}" alt="Portada de ${game.name}">` : `<div class="cover-vacia">Sin portada</div>`}
          </div>
          <div class="info">
            <h2>${game.name}</h2>
            <p>${game.summary}</p>
          </div>
        </div>
      </div>
    `;
  }
  
  // Mostrar error en búsqueda
  function renderError(msg) {
    const cont = document.querySelector('#resultado');
    cont.innerHTML = `<div class="card error">${msg}</div>`;
  }
  
  // Inicializar cuando carga la página
  document.addEventListener('DOMContentLoaded', () => {
    cargarFondo();
  
    const input = document.querySelector('#busqueda');
    const btn = document.querySelector('#btnBuscar');
  
    // Función para ejecutar la búsqueda
    async function ejecutar() {
      const q = input.value.trim();
      if (!q) return renderError('Escribe el nombre de un juego.');
  
      btn.disabled = true;
      btn.textContent = 'Buscando...';
  
      try {
        const game = await buscarJuego(q);
        renderJuego(game);
      } catch (e) {
        renderError(e.message || 'Error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Buscar';
      }
    }
  
    btn.addEventListener('click', ejecutar);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') ejecutar();
    });
  });
  