/**
 * Middleware de autenticacion compartido.
 * Centraliza la logica que antes estaba duplicada en profile.js, collections.js y users.js.
 */

// Redirige a login si no hay sesion (para rutas que renderizan HTML)
const isAuthenticated = (req, res, next) => {
  if (req.user) return next();
  res.redirect('/auth/login');
};

// Responde 401 JSON si no hay sesion (para endpoints API)
const isAuthenticatedApi = (req, res, next) => {
  if (req.user) return next();
  res.status(401).json({ error: 'Not authenticated' });
};

// Helper: obtiene el UID del usuario de forma consistente
const getUid = (req) => req.user?.uid || req.user?.id || null;

module.exports = { isAuthenticated, isAuthenticatedApi, getUid };
