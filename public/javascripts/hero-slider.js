document.addEventListener("DOMContentLoaded", () => {
  const container = document.querySelector("[data-carousel]");
  if (!container) return;

  const track = container.querySelector("[data-carousel-track]");
  const slides = Array.from(container.querySelectorAll("[data-carousel-slide]"));
  const nextBtn = container.querySelector("[data-carousel-next]");
  const prevBtn = container.querySelector("[data-carousel-prev]");
  const dots = Array.from(container.querySelectorAll("[data-carousel-dot]"));

  let currentIndex = 0;
  let autoplayInterval;
  const AUTOPLAY_MS = 6000;

  // Actualiza el carrusel
  const updateSlide = (index) => {
    // Loop
    if (index < 0) index = slides.length - 1;
    if (index >= slides.length) index = 0;

    currentIndex = index;
    const amountToMove = `-${currentIndex * 100}%`;
    track.style.transform = `translateX(${amountToMove})`;

    // Actualizar atributos para CSS y Accesibilidad
    slides.forEach((slide, i) => {
      slide.setAttribute("aria-hidden", i === currentIndex ? "false" : "true");
    });
    
    dots.forEach((dot, i) => {
      dot.classList.toggle("is-active", i === currentIndex);
      dot.setAttribute("aria-selected", i === currentIndex);
    });
  };

  // Autoplay controls
  const startAutoplay = () => {
    stopAutoplay();
    autoplayInterval = setInterval(() => {
      updateSlide(currentIndex + 1);
    }, AUTOPLAY_MS);
  };

  const stopAutoplay = () => clearInterval(autoplayInterval);

  // Listeners
  if(nextBtn) nextBtn.addEventListener("click", () => {
    updateSlide(currentIndex + 1);
    startAutoplay();
  });

  if(prevBtn) prevBtn.addEventListener("click", () => {
    updateSlide(currentIndex - 1);
    startAutoplay();
  });

  dots.forEach((dot, idx) => {
    dot.addEventListener("click", () => {
      updateSlide(idx);
      startAutoplay();
    });
  });

  // Pausar interacción
  container.addEventListener("mouseenter", stopAutoplay);
  container.addEventListener("mouseleave", startAutoplay);
  
  // Teclado
  container.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { updateSlide(currentIndex - 1); startAutoplay(); }
    if (e.key === "ArrowRight") { updateSlide(currentIndex + 1); startAutoplay(); }
  });

  // Iniciar
  updateSlide(0);
  startAutoplay();
});