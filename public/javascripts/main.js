// Menú de navegación móvil - toggle y cierre
(function () {
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
        if (!menu.classList.contains("is-open")) return;
        const t = e.target;
        // No cerrar si hacemos click en el menú o en el toggle
        if (menu.contains(t) || toggle.contains(t)) return;
        menu.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Abrir menú");
      });
    }
  })();
  