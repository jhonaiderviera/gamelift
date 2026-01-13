(function () {
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

    slides.forEach((s, idx) => s.setAttribute("aria-hidden", idx === index ? "false" : "true"));
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

  btnNext?.addEventListener("click", () => { next(); startAuto(); });
  btnPrev?.addEventListener("click", () => { prev(); startAuto(); });

  dots.forEach((d) => {
    d.addEventListener("click", () => {
      const targetIndex = Number(d.getAttribute("data-carousel-dot"));
      if (!Number.isNaN(targetIndex)) {
        setActive(targetIndex);
        startAuto();
      }
    });
  });

  root.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { prev(); startAuto(); }
    if (e.key === "ArrowRight") { next(); startAuto(); }
  });

  root.addEventListener("mouseenter", stopAuto);
  root.addEventListener("mouseleave", startAuto);
  root.addEventListener("focusin", stopAuto);
  root.addEventListener("focusout", startAuto);

  setActive(0);
  startAuto();
})();
