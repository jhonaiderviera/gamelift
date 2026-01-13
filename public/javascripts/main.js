(function () {
    const toggle = document.querySelector(".nav-toggle");
    const menu = document.querySelector("#navMenu");
  
    if (toggle && menu) {
      toggle.addEventListener("click", () => {
        const isOpen = menu.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(isOpen));
        toggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
      });
  
      document.addEventListener("click", (e) => {
        if (!menu.classList.contains("is-open")) return;
        const t = e.target;
        if (menu.contains(t) || toggle.contains(t)) return;
        menu.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open menu");
      });
    }
  })();
  