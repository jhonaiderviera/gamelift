/* public/javascripts/review-interactions.js — Reacciones y comentarios en reviews */

document.addEventListener("DOMContentLoaded", () => {
  // Mapeo de emojis y labels para las reacciones tipo Facebook
  const EMOJI_MAP = { like: "👍", love: "❤️", haha: "😂", wow: "😮", sad: "😢", angry: "😡" };
  const LABEL_MAP = { like: "Like", love: "Love", haha: "Haha", wow: "Wow", sad: "Sad", angry: "Angry" };

  // Convertir timestamp a formato relativo ("5m", "2h", "3d")
  function timeAgo(ts) {
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w`;
    return new Date(ts).toLocaleDateString();
  }

  // Escapar HTML para prevenir XSS — usamos un div temporal como truco
  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  // Si la URL tiene un hash tipo #review-xyz, hacer scroll hasta esa review y resaltarla
  if (window.location.hash && window.location.hash.startsWith("#review-")) {
    const target = document.querySelector(window.location.hash);
    if (target) {
      setTimeout(() => {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.style.boxShadow = "0 0 0 2px var(--primary, #8b5cf6), 0 0 20px rgba(139, 92, 246, 0.3)";
        target.style.transition = "box-shadow 0.3s";
        setTimeout(() => { target.style.boxShadow = ""; }, 3000);
      }, 400);
    }
  }

  // Inicializar cada bloque de interaccion (reacciones + comentarios) de cada review
  document.querySelectorAll(".review-interactions").forEach(initBlock);

  function initBlock(block) {
    const reviewId = block.dataset.reviewId;
    const gameId = block.dataset.gameId;
    if (!reviewId || !gameId) return;

    // --- Reacciones ---
    const btnReact = block.querySelector(".btn-react");
    const picker = block.querySelector(".emoji-picker");
    let hoverTimer = null;
    let pickerOpen = false;

    if (btnReact && picker) {
      // Click rapido = toggle Like, si ya hay picker abierto lo cierra
      btnReact.addEventListener("click", (e) => {
        e.stopPropagation();
        if (pickerOpen) {
          closePicker();
          return;
        }
        const current = btnReact.dataset.current;
        toggleReaction(reviewId, gameId, current ? current : "like", block);
      });

      // Hover con delay de 500ms para mostrar el picker de emojis (como Facebook)
      const wrapper = block.querySelector(".reaction-btn-wrapper");
      wrapper.addEventListener("mouseenter", () => {
        hoverTimer = setTimeout(() => openPicker(), 500);
      });
      wrapper.addEventListener("mouseleave", () => {
        clearTimeout(hoverTimer);
        setTimeout(() => {
          if (!picker.matches(":hover") && !btnReact.matches(":hover")) closePicker();
        }, 300);
      });
      picker.addEventListener("mouseleave", () => {
        setTimeout(() => {
          if (!picker.matches(":hover") && !wrapper.matches(":hover")) closePicker();
        }, 300);
      });

      // Cada boton del picker envia la reaccion seleccionada y cierra el picker
      picker.querySelectorAll("button[data-reaction]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const type = btn.dataset.reaction;
          toggleReaction(reviewId, gameId, type, block);
          closePicker();
        });
      });

      function openPicker() { picker.classList.add("show"); pickerOpen = true; }
      function closePicker() { picker.classList.remove("show"); pickerOpen = false; }
    }

    // --- Seccion de comentarios ---
    const btnComment = block.querySelector(".btn-comment-toggle");
    const commentsSection = block.querySelector(".review-comments-section");
    const commentCountSummary = block.querySelector(".comment-count-summary");
    let commentsLoaded = false; // lazy load: solo cargamos los comentarios la primera vez que se abren

    if (btnComment && commentsSection) {
      btnComment.addEventListener("click", () => toggleComments());

      // Tambien se puede abrir clickeando en "X comments"
      if (commentCountSummary) {
        commentCountSummary.addEventListener("click", () => toggleComments());
      }

      function toggleComments() {
        const isHidden = commentsSection.hasAttribute("hidden");
        if (isHidden) {
          commentsSection.removeAttribute("hidden");
          if (!commentsLoaded) {
            loadComments(reviewId, gameId, block);
            commentsLoaded = true;
          }
          // Focus input
          const input = commentsSection.querySelector(".comment-input");
          if (input) setTimeout(() => input.focus(), 100);
        } else {
          commentsSection.setAttribute("hidden", "");
        }
      }
    }

    // --- Envio de comentarios ---
    const sendBtn = block.querySelector(".btn-send-comment");
    const commentInput = block.querySelector(".comment-input");
    let replyTo = null; // guarda a quien estamos respondiendo (null si es comentario normal)

    if (sendBtn && commentInput) {
      sendBtn.addEventListener("click", () => submitComment());
      commentInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          submitComment();
        }
        // Si el user borra el @mention, limpiamos el replyTo
        if (replyTo && !commentInput.value.startsWith(`@${replyTo.userName}`)) {
          replyTo = null;
        }
      });

      // Exponemos setReplyTo en el bloque para que los botones de reply puedan usarlo
      block._setReplyTo = (userId, userName) => {
        replyTo = { userId, userName };
        commentInput.value = `@${userName} `;
        commentInput.focus();
      };

      function submitComment() {
        const text = commentInput.value.trim();
        if (!text) return;
        postComment(reviewId, gameId, text, replyTo, block);
        commentInput.value = "";
        replyTo = null;
      }
    }
  }

  // Cerrar todos los pickers de emoji al hacer click fuera
  document.addEventListener("click", () => {
    document.querySelectorAll(".emoji-picker.show").forEach((p) => p.classList.remove("show"));
  });

  // ═══════════════════════════════
  //  LLAMADAS A LA API
  // ═══════════════════════════════

  // Enviar reaccion al servidor — usamos optimistic UI para que se sienta instantaneo
  async function toggleReaction(reviewId, gameId, type, block) {
    const btnReact = block.querySelector(".btn-react");
    if (!btnReact) return;

    // Actualizamos la UI antes de que responda el server (optimistic update)
    const oldCurrent = btnReact.dataset.current;
    const isRemoving = oldCurrent === type;
    const newType = isRemoving ? null : type;

    updateReactButton(btnReact, newType);

    try {
      // POST al endpoint de reacciones con el tipo seleccionado
      const res = await fetch(`/games/${gameId}/reviews/${reviewId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ type }),
      });

      if (!res.ok) {
        // Si falla, revertimos el cambio visual al estado anterior
        updateReactButton(btnReact, oldCurrent || null);
        if (res.status === 401) {
          if (typeof showToast === "function") showToast("Log in to react", "error");
        }
        return;
      }

      const data = await res.json();
      updateReactButton(btnReact, data.userReaction);
      updateSummaryBar(block, data.reactionCounts);
    } catch (err) {
      console.error("Reaction error:", err);
      updateReactButton(btnReact, oldCurrent || null);
    }
  }

  // Actualizar el aspecto visual del boton de reaccion segun el tipo activo
  function updateReactButton(btn, type) {
    btn.dataset.current = type || "";
    const emojiSpan = btn.querySelector(".react-emoji");
    const labelSpan = btn.querySelector(".react-label");

    // Remove old classes
    btn.className = "btn-react";
    if (type) {
      btn.classList.add("active", `reaction-${type}`);
      emojiSpan.textContent = EMOJI_MAP[type];
      labelSpan.textContent = LABEL_MAP[type];
    } else {
      emojiSpan.textContent = "👍";
      labelSpan.textContent = "Like";
    }
  }

  // Actualizar la barra resumen de reacciones (los top 3 emojis + total)
  function updateSummaryBar(block, reactionCounts) {
    const counts = reactionCounts || {};
    const total = Object.values(counts).reduce((s, v) => s + (v || 0), 0);
    const topEmojis = Object.entries(counts)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => EMOJI_MAP[k]);

    let bar = block.querySelector(".reaction-summary-bar");
    const commentCountEl = bar ? bar.querySelector(".reaction-summary-right") : null;

    if (total > 0) {
      if (!bar) {
        bar = document.createElement("div");
        bar.className = "reaction-summary-bar";
        block.insertBefore(bar, block.querySelector(".review-action-bar"));
      }
      // Rebuild left side
      let left = bar.querySelector(".reaction-summary-left");
      if (!left) {
        left = document.createElement("span");
        left.className = "reaction-summary-left";
        bar.insertBefore(left, bar.firstChild);
      }
      left.innerHTML = `<span class="reaction-emoji-icons">${topEmojis.join("")}</span><span class="reaction-total">${total}</span>`;

      // Keep right side if exists
      if (commentCountEl && !bar.contains(commentCountEl)) {
        bar.appendChild(commentCountEl);
      }
    } else if (bar) {
      const left = bar.querySelector(".reaction-summary-left");
      if (left) left.remove();
      // If nothing left, remove bar
      if (!bar.querySelector(".reaction-summary-right")) bar.remove();
    }
  }

  // ── Comentarios ──

  // Cargar comentarios del server la primera vez que se abre la seccion
  async function loadComments(reviewId, gameId, block) {
    const list = block.querySelector(".comments-list");
    if (!list) return;
    list.innerHTML = '<div class="comments-loading"><i class="fas fa-spinner fa-spin"></i> Loading comments...</div>';

    try {
      const res = await fetch(`/games/${gameId}/reviews/${reviewId}/comments`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();

      list.innerHTML = "";
      if (data.comments.length === 0) {
        list.innerHTML = '<div class="comments-empty">No comments yet. Be the first!</div>';
      } else {
        data.comments.forEach((c) => {
          list.appendChild(buildCommentEl(c, reviewId, gameId, block));
        });
        list.scrollTop = list.scrollHeight;
      }
    } catch (err) {
      console.error("Load comments error:", err);
      list.innerHTML = '<div class="comments-empty">Could not load comments</div>';
    }
  }

  // Enviar un nuevo comentario al servidor via POST
  async function postComment(reviewId, gameId, text, replyTo, block) {
    const list = block.querySelector(".comments-list");
    if (!list) return;

    // Quitar el mensaje "no hay comentarios" si estaba visible
    const empty = list.querySelector(".comments-empty");
    if (empty) empty.remove();

    try {
      const res = await fetch(`/games/${gameId}/reviews/${reviewId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ text, replyTo }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          if (typeof showToast === "function") showToast("Log in to comment", "error");
        } else {
          const errData = await res.json().catch(() => ({}));
          if (typeof showToast === "function") showToast(errData.error || "Error posting comment", "error");
        }
        return;
      }

      const data = await res.json();
      const el = buildCommentEl(data.comment, reviewId, gameId, block);
      list.appendChild(el);
      list.scrollTop = list.scrollHeight;

      // Actualizar el contador de comentarios en la barra resumen
      updateCommentCount(block, 1);
    } catch (err) {
      console.error("Post comment error:", err);
      if (typeof showToast === "function") showToast("Network error", "error");
    }
  }

  // Eliminar comentario con confirmacion del usuario antes de hacer el DELETE
  async function deleteComment(reviewId, gameId, commentId, block, el) {
    if (!confirm("Delete this comment?")) return;

    try {
      const res = await fetch(`/games/${gameId}/reviews/${reviewId}/comments/${commentId}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": getCsrfToken() },
      });

      if (!res.ok) {
        if (typeof showToast === "function") showToast("Error deleting comment", "error");
        return;
      }

      el.remove();
      updateCommentCount(block, -1);

      // Si era el ultimo comentario, mostrar el estado vacio
      const list = block.querySelector(".comments-list");
      if (list && list.children.length === 0) {
        list.innerHTML = '<div class="comments-empty">No comments yet. Be the first!</div>';
      }
    } catch (err) {
      console.error("Delete comment error:", err);
    }
  }

  // Construir el elemento DOM de un comentario (avatar, texto, botones reply/delete)
  function buildCommentEl(comment, reviewId, gameId, block) {
    const div = document.createElement("div");
    div.className = "comment-item";
    div.dataset.commentId = comment.id;

    const avatar = esc(comment.userAvatar || "https://ui-avatars.com/api/?name=U");
    const name = esc(comment.userName || "User");
    const userId = esc(comment.userId || "");
    const time = timeAgo(comment.createdAt);

    // Convertir @menciones en links clicables al perfil del usuario
    let textHtml = esc(comment.text);
    if (comment.replyTo && comment.replyTo.userName) {
      const mentionName = esc(comment.replyTo.userName);
      const mentionUid = esc(comment.replyTo.userId || "");
      const mentionTag = `<a class="mention-tag" href="/profile/u/${mentionUid}">@${mentionName}</a>`;
      // Replace @username at start of text
      const mentionPattern = `@${mentionName}`;
      if (comment.text.startsWith(mentionPattern)) {
        textHtml = mentionTag + esc(comment.text.slice(mentionPattern.length));
      } else {
        textHtml = mentionTag + " " + textHtml;
      }
    }

    // Verificar si el usuario actual puede borrar este comentario (solo el autor)
    const sessionEl = document.querySelector('meta[name="csrf-token"]');
    const commentInputRow = block.querySelector(".comment-input-row");
    const currentUid = block.closest(".reviews-list")?.dataset.currentUid || "";
    const canDelete = currentUid && currentUid === comment.userId;

    div.innerHTML = `
      <img class="comment-avatar" src="${avatar}" alt="">
      <div class="comment-body">
        <div class="comment-bubble">
          <a href="/profile/u/${userId}" class="comment-author">${name}</a>
          <div class="comment-text">${textHtml}</div>
        </div>
        <div class="comment-meta">
          <span class="comment-time">${time}</span>
          ${commentInputRow ? `<button class="btn-reply-comment" data-user-id="${userId}" data-user-name="${name}">Reply</button>` : ""}
          ${canDelete ? `<button class="btn-delete-comment" data-comment-id="${comment.id}">Delete</button>` : ""}
        </div>
      </div>
    `;

    // Boton de responder — prefill el input con @nombreUsuario
    const replyBtn = div.querySelector(".btn-reply-comment");
    if (replyBtn) {
      replyBtn.addEventListener("click", () => {
        if (block._setReplyTo) {
          block._setReplyTo(replyBtn.dataset.userId, replyBtn.dataset.userName);
        }
      });
    }

    // Boton de eliminar — solo visible si eres el autor del comentario
    const deleteBtn = div.querySelector(".btn-delete-comment");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        deleteComment(reviewId, gameId, comment.id, block, div);
      });
    }

    return div;
  }

  // Actualizar el conteo de comentarios en la barra resumen (+1 o -1 segun delta)
  function updateCommentCount(block, delta) {
    let bar = block.querySelector(".reaction-summary-bar");
    let right = bar ? bar.querySelector(".reaction-summary-right") : null;
    let countEl = right ? right.querySelector(".comment-count-summary") : null;

    // Parse current count
    let current = 0;
    if (countEl) {
      const match = countEl.textContent.match(/(\d+)/);
      if (match) current = parseInt(match[1]);
    }
    const newCount = Math.max(0, current + delta);

    if (newCount > 0) {
      const text = `${newCount} comment${newCount !== 1 ? "s" : ""}`;
      if (countEl) {
        countEl.textContent = text;
      } else {
        // Create bar if missing
        if (!bar) {
          bar = document.createElement("div");
          bar.className = "reaction-summary-bar";
          block.insertBefore(bar, block.querySelector(".review-action-bar"));
        }
        right = document.createElement("span");
        right.className = "reaction-summary-right";
        right.innerHTML = `<span class="comment-count-summary">${text}</span>`;
        bar.appendChild(right);
      }
    } else if (countEl) {
      right.remove();
      if (bar && !bar.querySelector(".reaction-summary-left") && !bar.querySelector(".reaction-summary-right")) {
        bar.remove();
      }
    }
  }
});
