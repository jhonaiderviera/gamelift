document.addEventListener('DOMContentLoaded', () => {
    const reviewForm = document.getElementById('gameReviewForm');
    
    // Si no estamos en la página de detalle, no hacemos nada
    if (!reviewForm) return;
  
    reviewForm.addEventListener('submit', async (e) => {
      e.preventDefault();
  
      // Bloquear botón para evitar doble envío
      const submitBtn = reviewForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerText;
      submitBtn.disabled = true;
      submitBtn.innerText = "Enviando...";
  
      // Obtener datos del juego desde atributos data-
      const gameId = reviewForm.dataset.gameId;
      const gameName = reviewForm.dataset.gameName;
  
      // Obtener valores de los sliders
      const story = parseInt(document.getElementById('input-story').value) || 0;
      const gameplay = parseInt(document.getElementById('input-gameplay').value) || 0;
      const graphics = parseInt(document.getElementById('input-graphics').value) || 0;
      const sound = parseInt(document.getElementById('input-sound').value) || 0;
      const text = reviewForm.querySelector('textarea').value;
  
      // Crear objeto a enviar
      const payload = {
        gameId,
        gameName,
        scores: { story, gameplay, graphics, sound },
        text: text.trim()
      };
  
      try {
        // Enviar reseña al servidor
        const res = await fetch(`/games/${gameId}/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
  
        if (res.ok) {
          window.location.reload(); 
        } else {
          const err = await res.json();
          alert("Error: " + (err.message || "No se pudo guardar la reseña."));
        }
      } catch (error) {
        console.error(error);
        alert("Error de conexión. Intenta de nuevo.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
      }
    });
  });