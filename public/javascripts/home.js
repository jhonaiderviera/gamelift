(function () {
    const grid = document.getElementById("trendingGrid");
    const errorBox = document.getElementById("trendingError");
  
    const modal = document.getElementById("quickViewModal");
    const qvTitle = document.getElementById("qvTitle");
    const qvGenres = document.getElementById("qvGenres");
    const qvSummary = document.getElementById("qvSummary");
    const qvImg = document.getElementById("qvImg");
    const qvScore = document.getElementById("qvScore");
    const qvMore = document.getElementById("qvMore");
  
    let lastFocusedEl = null;
  
    function escapeText(s) {
      return (s ?? "").toString();
    }
  
    function scoreClass(score) {
      if (score >= 75) return "score-good";
      if (score >= 60) return "score-mid";
      return "score-bad";
    }
  
    function openModal(data) {
      lastFocusedEl = document.activeElement;
  
      qvTitle.textContent = escapeText(data.name);
      qvGenres.textContent = data.genres?.length ? data.genres.join(" • ") : "—";
      qvSummary.textContent = escapeText(data.summary || "No summary available.");
      qvMore.setAttribute("href", "/games");
  
      if (data.coverUrl) {
        qvImg.src = data.coverUrl;
        qvImg.alt = `${data.name} cover`;
      } else {
        qvImg.removeAttribute("src");
        qvImg.alt = "";
      }
  
      const score = typeof data.rating === "number" ? data.rating : null;
      qvScore.textContent = score !== null ? String(score) : "—";
      qvScore.className = `score-pill ${score !== null ? scoreClass(score) : ""}`;
  
      modal.classList.remove("hidden");
      document.body.classList.add("no-scroll");
  
      // Focus close for accessibility
      const closeBtn = modal.querySelector("[data-modal-close].modal-close");
      closeBtn && closeBtn.focus();
    }
  
    function closeModal() {
      modal.classList.add("hidden");
      document.body.classList.remove("no-scroll");
      if (lastFocusedEl && typeof lastFocusedEl.focus === "function") lastFocusedEl.focus();
    }
  
    modal.addEventListener("click", (e) => {
      const target = e.target;
      if (target && target.matches("[data-modal-close]")) closeModal();
    });
  
    document.addEventListener("keydown", (e) => {
      if (!modal.classList.contains("hidden") && e.key === "Escape") closeModal();
    });
  
    function renderCards(items) {
      grid.innerHTML = "";
  
      items.forEach((g) => {
        const card = document.createElement("article");
        card.className = "game-card";
        card.tabIndex = 0;
  
        const cover = document.createElement("div");
        cover.className = "game-cover";
        cover.setAttribute("aria-hidden", "true");
  
        if (g.coverUrl) {
          const img = document.createElement("img");
          img.src = g.coverUrl;
          img.alt = `${g.name} cover`;
          img.loading = "lazy";
          cover.appendChild(img);
        } else {
          const fallback = document.createElement("div");
          fallback.className = "cover-fallback";
          fallback.textContent = "No image";
          cover.appendChild(fallback);
        }
  
        if (typeof g.rating === "number") {
          const score = document.createElement("span");
          score.className = `score ${scoreClass(g.rating)}`;
          score.textContent = String(g.rating);
          cover.appendChild(score);
        }
  
        const body = document.createElement("div");
        body.className = "game-body";
  
        const h3 = document.createElement("h3");
        h3.className = "h3";
        h3.textContent = escapeText(g.name);
  
        const chips = document.createElement("div");
        chips.className = "chips";
        if (g.genres?.length) {
          g.genres.slice(0, 2).forEach((x) => {
            const chip = document.createElement("span");
            chip.className = "chip";
            chip.textContent = escapeText(x);
            chips.appendChild(chip);
          });
        }
  
        const desc = document.createElement("p");
        desc.className = "game-desc muted";
        const summary = escapeText(g.summary || "");
        desc.textContent = summary.length > 120 ? summary.slice(0, 120) + "..." : (summary || "No summary.");
  
        const actions = document.createElement("div");
        actions.className = "game-actions";
  
        const quickBtn = document.createElement("button");
        quickBtn.className = "btn btn-ghost btn-sm";
        quickBtn.type = "button";
        quickBtn.textContent = "Quick view";
        quickBtn.addEventListener("click", () => openModal(g));
  
        const more = document.createElement("a");
        more.className = "btn btn-primary btn-sm";
        more.href = "/games";
        more.textContent = "Open";
  
        actions.appendChild(quickBtn);
        actions.appendChild(more);
  
        body.appendChild(h3);
        if (chips.childNodes.length) body.appendChild(chips);
        body.appendChild(desc);
        body.appendChild(actions);
  
        card.appendChild(cover);
        card.appendChild(body);
  
        // Open quick view with keyboard (Enter)
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter") openModal(g);
        });
  
        grid.appendChild(card);
      });
    }
  
    async function loadTrending() {
      try {
        const res = await fetch("/api/igdb/trending?limit=6");
        const json = await res.json();
  
        if (!json.ok) throw new Error("Trending not ok");
  
        renderCards(json.data || []);
      } catch (e) {
        // keep skeleton? better show error
        grid.innerHTML = "";
        errorBox.classList.remove("hidden");
      }
    }
  
    loadTrending();
  })();
  