document.addEventListener('DOMContentLoaded', () => {
    const reviewForm = document.getElementById('gameReviewForm');
    
    // Si no estamos en la página de detalle o no hay formulario, no hacemos nada
    if (!reviewForm) return;
  
    reviewForm.addEventListener('submit', async (e) => {
      e.preventDefault();
  
      // UI: Bloquear botón para evitar doble envío
      const submitBtn = reviewForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerText;
      submitBtn.disabled = true;
      submitBtn.innerText = "Sending...";
  
      // 1. Capturar datos del juego (desde los atributos data- del form)
      const gameId = reviewForm.dataset.gameId;
      const gameName = reviewForm.dataset.gameName;
  
      // 2. Capturar valores de los sliders
      const story = parseInt(document.getElementById('input-story').value) || 0;
      const gameplay = parseInt(document.getElementById('input-gameplay').value) || 0;
      const graphics = parseInt(document.getElementById('input-graphics').value) || 0;
      const sound = parseInt(document.getElementById('input-sound').value) || 0;
      
      // Capturar texto
      const text = reviewForm.querySelector('textarea').value;
  
      // 3. Crear el objeto a enviar
      const payload = {
        gameId,
        gameName,
        scores: { story, gameplay, graphics, sound },
        text: text.trim()
      };
  
      try {
        // 4. Enviar petición POST al servidor
        const res = await fetch(`/games/${gameId}/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
  
        if (res.ok) {
          // Éxito: Recargar la página para ver la nueva review en la lista
          window.location.reload(); 
        } else {
          // Error del servidor (ej: no logueado)
          const err = await res.json();
          alert("Error: " + (err.message || "Could not save review."));
        }
      } catch (error) {
        console.error(error);
        alert("Network error. Please try again.");
      } finally {
        // Restaurar botón
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
      }
    });
  });