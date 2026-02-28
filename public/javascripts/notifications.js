/* notifications.js — Sistema de campana de notificaciones con polling */

(function () {
  // Elementos del dropdown de notificaciones en el navbar
  const bell = document.getElementById("notifBell");
  const badge = document.getElementById("notifBadge");
  const dropdown = document.getElementById("notifDropdown");
  const list = document.getElementById("notifList");
  const readAllBtn = document.getElementById("notifReadAll");

  if (!bell || !dropdown) return;

  let isOpen = false;
  const POLL_INTERVAL = 180000; // Polling cada 3 min para ver si hay nuevas notificaciones (optimizado — 60s era excesivo)

  // Pedir al server cuantas notificaciones sin leer hay para actualizar el badge
  async function fetchUnreadCount() {
    try {
      const res = await fetch("/users/notifications/count", {
        headers: { "X-CSRF-Token": getCsrfToken() },
      });
      const data = await res.json();
      if (data.success) {
        updateBadge(data.count);
      }
    } catch (err) {
      // Silently fail
    }
  }

  // Mostrar/ocultar el numerito rojo del badge — si pasa de 99 mostramos "99+"
  function updateBadge(count) {
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : count;
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }
  }

  // Traer la lista completa de notificaciones cuando el user abre el dropdown
  async function fetchNotifications() {
    list.innerHTML = '<div class="notif-loading"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
      const res = await fetch("/users/notifications", {
        headers: { "X-CSRF-Token": getCsrfToken() },
      });
      const data = await res.json();
      if (data.success && data.notifications.length > 0) {
        renderNotifications(data.notifications);
      } else {
        list.innerHTML = '<div class="notif-empty"><i class="fas fa-bell-slash"></i><span>No notifications yet</span></div>';
      }
    } catch (err) {
      list.innerHTML = '<div class="notif-empty"><span>Error loading notifications</span></div>';
    }
  }

  // Renderizar cada notificacion como un link clicable con icono, mensaje y tiempo
  function renderNotifications(notifications) {
    list.innerHTML = notifications.map(n => {
      const timeStr = timeAgo(new Date(n.createdAt));
      const unreadClass = n.read ? "" : "unread";
      return `
        <a href="${n.link || '/'}" class="notif-item ${unreadClass}" data-id="${n.id}">
          <div class="notif-item-icon"><i class="${n.icon || 'fas fa-bell'}"></i></div>
          <div class="notif-item-body">
            <span class="notif-item-msg">${escapeHtml(n.message)}</span>
            <span class="notif-item-time">${timeStr}</span>
          </div>
          ${!n.read ? '<span class="notif-dot"></span>' : ''}
        </a>
      `;
    }).join("");

    // Al clickear una notificacion, la marcamos como leida antes de navegar
    list.querySelectorAll(".notif-item").forEach(item => {
      item.addEventListener("click", (e) => {
        const id = item.dataset.id;
        if (id && item.classList.contains("unread")) {
          markRead(id);
        }
      });
    });
  }

  // Marcar una sola notificacion como leida (POST silencioso, no molestamos al user si falla)
  async function markRead(id) {
    try {
      await fetch("/users/notifications/read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify({ id }),
      });
    } catch (err) { /* silent */ }
  }

  // Marcar TODAS como leidas — actualiza badge a 0 y quita el estilo unread de cada item
  async function markAllRead() {
    try {
      await fetch("/users/notifications/read-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify({}),
      });
      updateBadge(0);
      // Quitar la clase unread y el puntito azul de cada notificacion
      list.querySelectorAll(".notif-item.unread").forEach(item => {
        item.classList.remove("unread");
        const dot = item.querySelector(".notif-dot");
        if (dot) dot.remove();
      });
    } catch (err) { /* silent */ }
  }

  // Abrir/cerrar el dropdown — al abrir, carga las notificaciones frescas del server
  function toggleDropdown() {
    isOpen = !isOpen;
    dropdown.style.display = isOpen ? "flex" : "none";
    bell.classList.toggle("active", isOpen);
    if (isOpen) {
      fetchNotifications();
    }
  }

  // Cerrar el dropdown si el user hace click fuera de la campana y del dropdown
  document.addEventListener("click", (e) => {
    if (isOpen && !bell.contains(e.target) && !dropdown.contains(e.target)) {
      isOpen = false;
      dropdown.style.display = "none";
      bell.classList.remove("active");
    }
  });

  // Click en la campana para toggle del dropdown
  bell.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  if (readAllBtn) {
    readAllBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      markAllRead();
    });
  }

  // Formato de tiempo relativo para las notificaciones ("5m ago", "2h ago", etc)
  function timeAgo(date) {
    if (!date || isNaN(date.getTime())) return "";
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Arranque: pedir el conteo inicial y programar polling periodico
  fetchUnreadCount();
  setInterval(fetchUnreadCount, POLL_INTERVAL);
})();
