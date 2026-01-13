(function () {
    // Mobile nav toggle
    const toggle = document.querySelector(".nav-toggle");
    const menu = document.querySelector("#navMenu");
  
    if (toggle && menu) {
      toggle.addEventListener("click", () => {
        const isOpen = menu.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(isOpen));
        toggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
      });
  
      // Close on outside click (simple UX)
      document.addEventListener("click", (e) => {
        const target = e.target;
        if (!menu.classList.contains("is-open")) return;
        if (menu.contains(target) || toggle.contains(target)) return;
        menu.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open menu");
      });
    }
  
    // Carousel
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
    const AUTO_MS = 6000;
  
    function setActive(i) {
      index = (i + slides.length) % slides.length;
      track.style.transform = `translateX(${-index * 100}%)`;
  
      slides.forEach((s, idx) => {
        s.setAttribute("aria-hidden", idx === index ? "false" : "true");
      });
  
      dots.forEach((d, idx) => {
        d.classList.toggle("is-active", idx === index);
        d.setAttribute("aria-selected", idx === index ? "true" : "false");
      });
    }
  
    function next() { setActive(index + 1); }
    function prev() { setActive(index - 1); }
  
    function startAuto() {
      stopAuto();
      timer = setInterval(next, AUTO_MS);
    }
    function stopAuto() {
      if (timer) clearInterval(timer);
      timer = null;
    }
  
    if (btnNext) btnNext.addEventListener("click", () => { next(); startAuto(); });
    if (btnPrev) btnPrev.addEventListener("click", () => { prev(); startAuto(); });
  
    dots.forEach((d) => {
      d.addEventListener("click", () => {
        const targetIndex = Number(d.getAttribute("data-carousel-dot"));
        if (!Number.isNaN(targetIndex)) {
          setActive(targetIndex);
          startAuto();
        }
      });
    });
  
    // Keyboard support
    root.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { prev(); startAuto(); }
      if (e.key === "ArrowRight") { next(); startAuto(); }
    });
  
    // Pause on hover/focus for better UX
    root.addEventListener("mouseenter", stopAuto);
    root.addEventListener("mouseleave", startAuto);
    root.addEventListener("focusin", stopAuto);
    root.addEventListener("focusout", startAuto);
  
    // Init
    setActive(0);
    startAuto();
  })();
  