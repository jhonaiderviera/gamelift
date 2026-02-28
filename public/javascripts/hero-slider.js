// Carrusel hero del home — autoplay con barra de progreso en los dots
document.addEventListener("DOMContentLoaded", () => {
  const container = document.querySelector("[data-carousel]");
  if (!container) return;

  // Elementos principales del carrusel
  const track = container.querySelector("[data-carousel-track]");
  const slides = Array.from(container.querySelectorAll("[data-carousel-slide]"));
  const nextBtn = container.querySelector("[data-carousel-next]");
  const prevBtn = container.querySelector("[data-carousel-prev]");
  const dots = Array.from(container.querySelectorAll("[data-carousel-dot]"));

  let currentIndex = 0;
  let autoplayInterval;
  const AUTOPLAY_MS = 4000; // cada 4 segundos cambia de slide
  let isPaused = false;

  // Inyectar una barra de progreso dentro de cada dot (se anima con CSS)
  dots.forEach(dot => {
    const bar = document.createElement("span");
    bar.className = "dot-progress";
    dot.appendChild(bar);
  });

  // Reiniciar la animacion de progreso — forzamos reflow para resetear el CSS animation
  const restartProgress = () => {
    dots.forEach((dot, i) => {
      const bar = dot.querySelector(".dot-progress");
      if (!bar) return;
      // Reset animation
      bar.style.animation = "none";
      void bar.offsetWidth; // force reflow
      if (i === currentIndex && !isPaused) {
        bar.style.animation = `dotFill ${AUTOPLAY_MS}ms linear forwards`;
      }
    });
  };

  // Mover el carrusel al slide indicado — maneja loop infinito (ultimo -> primero y viceversa)
  const updateSlide = (index) => {
    if (index < 0) index = slides.length - 1;
    if (index >= slides.length) index = 0;

    currentIndex = index;
    track.style.transform = `translateX(-${currentIndex * 100}%)`;

    slides.forEach((slide, i) => {
      slide.setAttribute("aria-hidden", i === currentIndex ? "false" : "true");
    });

    dots.forEach((dot, i) => {
      dot.classList.toggle("is-active", i === currentIndex);
      dot.setAttribute("aria-selected", i === currentIndex);
    });

    restartProgress();
  };

  // Iniciar autoplay — limpia el intervalo anterior por seguridad antes de crear uno nuevo
  const startAutoplay = () => {
    stopAutoplay();
    isPaused = false;
    restartProgress();
    autoplayInterval = setInterval(() => {
      updateSlide(currentIndex + 1);
    }, AUTOPLAY_MS);
  };

  // Pausar el autoplay y congelar la barra de progreso
  const stopAutoplay = () => {
    clearInterval(autoplayInterval);
    isPaused = true;
    dots.forEach(dot => {
      const bar = dot.querySelector(".dot-progress");
      if (bar) bar.style.animationPlayState = "paused";
    });
  };

  // Flechas de navegacion — reinician el autoplay al hacer click para dar tiempo al usuario
  if (nextBtn) nextBtn.addEventListener("click", () => {
    updateSlide(currentIndex + 1);
    startAutoplay();
  });

  if (prevBtn) prevBtn.addEventListener("click", () => {
    updateSlide(currentIndex - 1);
    startAutoplay();
  });

  // Click en los dots para ir directo a un slide especifico
  dots.forEach((dot, idx) => {
    dot.addEventListener("click", () => {
      updateSlide(idx);
      startAutoplay();
    });
  });

  // Pausar al pasar el mouse por encima para que el usuario pueda leer
  container.addEventListener("mouseenter", stopAutoplay);
  container.addEventListener("mouseleave", startAutoplay);

  // Soporte de teclado — flechas izquierda/derecha
  container.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { updateSlide(currentIndex - 1); startAutoplay(); }
    if (e.key === "ArrowRight") { updateSlide(currentIndex + 1); startAutoplay(); }
  });

  // Soporte tactil (swipe) — permite deslizar en movil para cambiar de slide
  let touchStartX = 0;
  let touchEndX = 0;
  const SWIPE_THRESHOLD = 50; // minimo de pixeles para considerar un swipe

  container.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
    stopAutoplay();
  }, { passive: true });

  container.addEventListener("touchend", (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;

    if (Math.abs(diff) > SWIPE_THRESHOLD) {
      if (diff > 0) {
        // Swipe hacia la izquierda — siguiente slide
        updateSlide(currentIndex + 1);
      } else {
        // Swipe hacia la derecha — slide anterior
        updateSlide(currentIndex - 1);
      }
    }
    startAutoplay();
  }, { passive: true });

  // Init
  updateSlide(0);
  startAutoplay();
});
