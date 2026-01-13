(function () {
  document.querySelectorAll("[data-slider]").forEach((block) => {
    const track = block.querySelector("[data-slider-track]");
    const prev = block.querySelector("[data-slider-prev]");
    const next = block.querySelector("[data-slider-next]");

    if (!track) return;

    const step = () => Math.round(track.clientWidth * 0.85);

    next?.addEventListener("click", () => track.scrollBy({ left: step(), behavior: "smooth" }));
    prev?.addEventListener("click", () => track.scrollBy({ left: -step(), behavior: "smooth" }));
  });

  // keyboard support: arrows when focused on card
  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    if (!active || !active.classList || !active.classList.contains("game-card")) return;

    const track = active.closest("[data-slider-track]");
    if (!track) return;

    const step = () => Math.round(track.clientWidth * 0.85);

    if (e.key === "ArrowRight") {
      e.preventDefault();
      track.scrollBy({ left: step(), behavior: "smooth" });
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      track.scrollBy({ left: -step(), behavior: "smooth" });
    }
  });
})();
