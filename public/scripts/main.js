// Menú de navegación móvil y carrusel de héroes
(function () {
    // --- MENÚ NAVEGACIÓN MÓVIL ---
    const toggle = document.querySelector(".nav-toggle");
    const menu = document.querySelector("#navMenu");
  
    if (toggle && menu) {
      // Abrir/cerrar menú al hacer click en toggle
      toggle.addEventListener("click", () => {
        const isOpen = menu.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(isOpen));
        toggle.setAttribute("aria-label", isOpen ? "Cerrar menú" : "Abrir menú");
      });
  
      // Cerrar menú al hacer click fuera
      document.addEventListener("click", (e) => {
        const target = e.target;
        if (!menu.classList.contains("is-open")) return;
        if (menu.contains(target) || toggle.contains(target)) return;
        menu.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Abrir menú");
      });
    }
  
    // --- CARRUSEL DE HÉROES ---
    const root = document.querySelector("[data-carousel]");
    if (!root) return;
  
    // Obtener elementos del carrusel
    const track = root.querySelector("[data-carousel-track]");
    const slides = Array.from(root.querySelectorAll("[data-carousel-slide]"));
    const btnPrev = root.querySelector("[data-carousel-prev]");
    const btnNext = root.querySelector("[data-carousel-next]");
    const dotsRoot = root.querySelector("[data-carousel-dots]");
    const dots = dotsRoot ? Array.from(dotsRoot.querySelectorAll("[data-carousel-dot]")) : [];
  
    let index = 0;
    let timer = null;
    const AUTO_MS = 6000; // Intervalo de avance automático
  
    // Establecer slide activo
    function setActive(i) {\n      index = (i + slides.length) % slides.length;\n      track.style.transform = `translateX(${-index * 100}%)`;\n  \n      // Actualizar accesibilidad de slides\n      slides.forEach((s, idx) => {\n        s.setAttribute("aria-hidden", idx === index ? "false" : "true");\n      });\n  \n      // Actualizar estilos e accesibilidad de puntos\n      dots.forEach((d, idx) => {\n        d.classList.toggle("is-active", idx === index);\n        d.setAttribute("aria-selected", idx === index ? "true" : "false");\n      });\n    }\n  \n    // Navegar al siguiente slide\n    function next() { setActive(index + 1); }\n    // Navegar al slide anterior\n    function prev() { setActive(index - 1); }\n  \n    // Iniciar reproducción automática\n    function startAuto() {\n      stopAuto();\n      timer = setInterval(next, AUTO_MS);\n    }\n    // Detener reproducción automática\n    function stopAuto() {\n      if (timer) clearInterval(timer);\n      timer = null;\n    }\n  \n    // Listeners para botones\n    if (btnNext) btnNext.addEventListener("click", () => { next(); startAuto(); });\n    if (btnPrev) btnPrev.addEventListener("click", () => { prev(); startAuto(); });\n  \n    // Listeners para puntos\n    dots.forEach((d) => {\n      d.addEventListener("click", () => {\n        const targetIndex = Number(d.getAttribute("data-carousel-dot"));\n        if (!Number.isNaN(targetIndex)) {\n          setActive(targetIndex);\n          startAuto();\n        }\n      });\n    });\n  \n    // Atajos de teclado\n    root.addEventListener("keydown", (e) => {\n      if (e.key === "ArrowLeft") { prev(); startAuto(); }\n      if (e.key === "ArrowRight") { next(); startAuto(); }\n    });\n  \n    // Pausar al pasar ratón o recibir foco\n    root.addEventListener("mouseenter", stopAuto);\n    root.addEventListener("mouseleave", startAuto);\n    root.addEventListener("focusin", stopAuto);\n    root.addEventListener("focusout", startAuto);\n  \n    // Inicializar carrusel\n    setActive(0);\n    startAuto();\n  })();
  