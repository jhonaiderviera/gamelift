/**
 * Middleware de autenticacion compartido.
 * Centraliza la logica que antes estaba duplicada en profile.js, collections.js y users.js.
 */

// Para rutas HTML — si no hay sesión, te manda al login con redirect
// Se usa en rutas como /profile, /collections, etc.
const isAuthenticated = (req, res, next) => {
  if (req.user) return next();
  res.redirect('/auth/login');
};

// Para endpoints API (fetch desde el frontend) — responde 401 en vez de redirect
// Porque un redirect no tiene sentido en una llamada AJAX
const isAuthenticatedApi = (req, res, next) => {
  if (req.user) return next();
  res.status(401).json({ error: 'Not authenticated' });
};

// Saca el UID del usuario — chequea ambos campos porque Firebase usa "uid" y a veces guardamos "id"
const getUid = (req) => req.user?.uid || req.user?.id || null;

module.exports = { isAuthenticated, isAuthenticatedApi, getUid };
