// Sacar el token CSRF del meta tag — lo necesitamos en cada fetch POST/DELETE para que el server no lo rechace
function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.getAttribute('content') : '';
}

// Notificacion toast global — si la pagina ya tiene un toast (ej: game-detail) lo reutiliza, si no crea uno dinamico
function showToast(message, type = 'success') {
  // Si existe un toast especifico de la pagina, usamos ese
  const existing = document.getElementById('toast-notification');
  if (existing) {
    const msgSpan = document.getElementById('toast-message');
    if (msgSpan) msgSpan.innerText = message;
    if (type === 'error') {
      existing.classList.add('error');
      const icon = existing.querySelector('i');
      if (icon) icon.className = 'fas fa-exclamation-circle toast-icon';
    } else {
      existing.classList.remove('error');
      const icon = existing.querySelector('i');
      if (icon) icon.className = 'fas fa-check-circle toast-icon';
    }
    existing.classList.add('show');
    setTimeout(() => existing.classList.remove('show'), 3000);
    return;
  }

  // No hay toast en la pagina, asi que creamos uno desde cero con estilos inline
  let container = document.getElementById('global-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'global-toast-container';
    Object.assign(container.style, {
      position: 'fixed', top: '24px', right: '24px', zIndex: '99999',
      display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'none'
    });
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const isError = type === 'error';
  Object.assign(toast.style, {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '14px 22px', borderRadius: '12px',
    background: isError ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
    border: '1px solid ' + (isError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'),
    color: isError ? '#fca5a5' : '#4ade80',
    fontSize: '0.92rem', fontWeight: '600', fontFamily: 'inherit',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    transform: 'translateX(120%)', transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
    pointerEvents: 'auto', maxWidth: '380px'
  });

  const icon = isError ? 'fa-exclamation-circle' : 'fa-check-circle';
  toast.innerHTML = '<i class="fas ' + icon + '" style="font-size:1.1rem;flex-shrink:0"></i><span>' + message + '</span>';
  container.appendChild(toast);

  // Doble requestAnimationFrame para que el navegador haga el paint antes de animar (truco clasico)
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { toast.style.transform = 'translateX(0)'; });
  });

  // Despues de 3.5s lo sacamos con animacion y lo eliminamos del DOM
  setTimeout(function() {
    toast.style.transform = 'translateX(120%)';
    setTimeout(function() { toast.remove(); }, 400);
  }, 3500);
}

// IIFE para el menu hamburguesa en movil — lo encapsulamos para no contaminar el scope global
(function () {
    const toggle = document.querySelector(".nav-toggle");
    const menu = document.querySelector("#navMenu");
  
    if (toggle && menu) {
      // Toggle del menu — tambien actualizamos aria-expanded para accesibilidad
      toggle.addEventListener("click", () => {
        const isOpen = menu.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(isOpen));
        toggle.setAttribute("aria-label", isOpen ? "Cerrar menú" : "Abrir menú");
      });
  
      // Cerrar el menu si el user hace click en cualquier parte que no sea el menu ni el boton
      document.addEventListener("click", (e) => {
        if (!menu.classList.contains("is-open")) return;
        const t = e.target;
        // Ignorar clicks dentro del menu o sobre el toggle
        if (menu.contains(t) || toggle.contains(t)) return;
        menu.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Abrir menú");
      });
    }
  })();
  