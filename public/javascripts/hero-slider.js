// Carrusel de héroes - navegación automática y manual
(function () {
  // Obtener elementos del carrusel
  const root = document.querySelector("[data-carousel]");
  if (!root) return;

  const track = root.querySelector("[data-carousel-track]");
  const slides = Array.from(root.querySelectorAll("[data-carousel-slide]"));
  const btnPrev = root.querySelector("[data-carousel-prev]");
  const btnNext = root.querySelector("[data-carousel-next]");
  const dotsRoot = root.querySelector("[data-carousel-dots]");
  const dots = dotsRoot ? Array.from(dotsRoot.querySelectorAll("[data-carousel-dot]")) : [];

  let index = 0;
  let timer = null;
  const AUTO_MS = 6000; // Intervalo de avance automático

  // Establecer slide activo y actualizar UI
  function setActive(i) {
    // Calcular índice con wrap-around
    index = (i + slides.length) % slides.length;
    // Desplazar track horizontalmente
    track.style.transform = `translateX(${-index * 100}%)`;

    // Actualizar accesibilidad de slides
    slides.forEach((s, idx) => s.setAttribute("aria-hidden", idx === index ? "false" : "true"));
    // Actualizar estilos e accesibilidad de puntos
    dots.forEach((d, idx) => {
      d.classList.toggle("is-active", idx === index);
      d.setAttribute("aria-selected", idx === index ? "true" : "false");
    });
  }

  // Navegar al siguiente slide
  function next() { setActive(index + 1); }
  // Navegar al slide anterior
  function prev() { setActive(index - 1); }

  // Iniciar reproducción automática
  function startAuto() {
    stopAuto();
    timer = setInterval(next, AUTO_MS);
  }
  // Detener reproducción automática
  function stopAuto() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  // Listeners para botones de navegación
  btnNext?.addEventListener("click", () => { next(); startAuto(); });
  btnPrev?.addEventListener("click", () => { prev(); startAuto(); });

  // Listeners para puntos de navegación
  dots.forEach((d) => {
    d.addEventListener("click", () => {
      const targetIndex = Number(d.getAttribute("data-carousel-dot"));
      if (!Number.isNaN(targetIndex)) {\n        setActive(targetIndex);\n        startAuto();\n      }\n    });\n  });\n\n  // Atajos de teclado para navegación\n  root.addEventListener("keydown", (e) => {\n    if (e.key === "ArrowLeft") { prev(); startAuto(); }\n    if (e.key === "ArrowRight") { next(); startAuto(); }\n  });\n\n  // Pausar al pasar el ratón o recibir foco\n  root.addEventListener("mouseenter", stopAuto);\n  root.addEventListener("mouseleave", startAuto);\n  root.addEventListener("focusin", stopAuto);\n  root.addEventListener("focusout", startAuto);\n\n  // Inicializar\n  setActive(0);\n  startAuto();\n})();
