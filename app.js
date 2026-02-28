/* Ubicación: /app.js */
// Dependencias principales de Express y utilidades del servidor
const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser"); // Para leer/escribir cookies (sesion del usuario)
const logger = require("morgan"); // Logger de requests HTTP en consola
const compression = require("compression"); // Compresión gzip/brotli para respuestas más livianas
require("dotenv").config(); // Carga las variables de entorno del .env antes que todo
const session = require("express-session"); // Sesiones del servidor (para flash messages)
const flash = require("connect-flash"); // Mensajes temporales tipo "Se guardó correctamente"

// --- 1. IMPORTAR RUTAS ---
// Cada archivo en /routes maneja un grupo de endpoints de la app
const indexRouter = require("./routes/index");
const gamesRouter = require("./routes/games");
const featuresRouter = require("./routes/features");
const authRouter = require("./routes/auth");
const profileRouter = require("./routes/profile");
const igdbRouter = require("./routes/igdb"); // Proxy para llamadas a IGDB desde el frontend
const steamGridDbRouter = require("./routes/steamgriddb"); // Proxy para imágenes de SteamGridDB
const usersRouter = require("./routes/users");
const supportRouter = require("./routes/support");

const collectionsRouter = require("./routes/collections");
const versusRouter = require("./routes/versus");
const companiesRouter = require("./routes/companies");
const discoverRouter = require("./routes/discover");
const challengesRouter = require("./routes/challenges");
const contactRouter = require("./routes/contact");

// Protección CSRF con patrón "double-submit cookie" — previene ataques de formularios externos
const { doubleCsrf } = require("csrf-csrf");

// Conexión a Firestore (base de datos NoSQL de Firebase)
const { db } = require("./services/firebase");

const app = express();

// Configurar motor de vistas EJS
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Gzip/brotli compression — reduces payload size ~70-80%
app.use(compression());

// Logging: verbose in dev, minimal in production
app.use(logger(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Parsear body de requests — JSON para APIs, urlencoded para formularios HTML
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser()); // Sin esto no podríamos leer la cookie de sesión

// Static files with aggressive caching (1 day for assets, ETag for freshness)
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
  etag: true,
  lastModified: true,
  immutable: false
}));

// Middleware que lee la cookie "session" y pone al usuario en req.user y res.locals
// Así todas las vistas EJS pueden usar "user" directamente para saber quién está logueado
app.use((req, res, next) => {
  if (req.cookies.session) {
    try {
      const userSession = JSON.parse(req.cookies.session);
      res.locals.user = userSession; // Disponible en las vistas EJS
      req.user = userSession; // Disponible en los controladores/rutas
    } catch (e) {
      console.error("Error parsing session cookie:", e);
      res.locals.user = null;
      req.user = null;
    }
  } else {
    res.locals.user = null;
    req.user = null;
  }
  next();
});

// Sesión de Express — solo se usa para los flash messages, NO para la auth del usuario
// La auth real viene de la cookie "session" que se parsea arriba
app.use(session({
  secret: process.env.SESSION_SECRET || 'gamelift_secret_secure_key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60000 * 60 } // 1 hora de vida
}));

app.use(flash());

// Middleware para pasar los mensajes a TODAS las vistas automáticamente
app.use((req, res, next) => {
  res.locals.success = req.flash('success'); // Pasa el mensaje verde al HTML
  res.locals.error = req.flash('error');     // Pasa el mensaje rojo al HTML
  res.locals.user = req.user || null;        // (Opcional) Pasa el usuario logueado
  next();
});

// --- CSRF Protection (double-submit cookie) ---
// Cada formulario necesita un token CSRF para prevenir que sitios maliciosos hagan requests en nombre del user
const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || "gamelift-csrf-secret-key",
  getSessionIdentifier: (req) => req.cookies.session || "anonymous",
  cookieName: "__csrf",
  cookieOptions: { httpOnly: true, sameSite: "strict", secure: false },
  // El token puede venir en el body del form (_csrf) o en un header (para fetch/AJAX)
  getCsrfTokenFromRequest: (req) => req.body?._csrf || req.headers["x-csrf-token"],
});

app.use(doubleCsrfProtection);

// Genera un token CSRF nuevo y lo pone en res.locals para que las vistas EJS lo inyecten en los forms
app.use((req, res, next) => {
  const token = generateCsrfToken(req, res);
  res.locals.csrfToken = token;
  next();
});

// --- Registrar Rutas ---
// Cada router maneja un prefijo de URL distinto; el orden no importa mucho aquí
app.use("/", indexRouter); // Home, about, landing
app.use("/auth", authRouter); // Login, register, logout
app.use("/profile", profileRouter); // Perfil del usuario logueado
app.use("/games", gamesRouter); // Detalle de juego, reviews
app.use("/features", featuresRouter);
app.use("/users", usersRouter); // Perfil público, follow, library
app.use("/api/igdb", igdbRouter); // Endpoints proxy que el frontend llama via fetch
app.use("/api/steamgriddb", steamGridDbRouter);
app.use("/support-developers", supportRouter);

app.use("/collections", collectionsRouter);
app.use("/versus", versusRouter); // Comparación de juegos
app.use("/companies", companiesRouter); // Info de compañías desde IGDB
app.use("/discover", discoverRouter); // Descubrir juegos al azar (Tinder-style)
app.use("/challenges", challengesRouter); // Retos mensuales
app.use("/contact", contactRouter);

// Si ninguna ruta matcheó, es un 404 — mostramos nuestra página custom
app.use(function (req, res) {
  res.status(404).render("layout", {
    title: "404 — Page Not Found | GameLift",
    page: "404",
    active: "",
    data: {},
  });
});

// Manejo específico del error CSRF — si el token es inválido o falta, respondemos 403
// Diferenciamos entre peticiones JSON (API) y peticiones normales (renderizar página)
app.use((err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN" || err.message?.includes("csrf")) {
    res.status(403);
    if (req.headers['content-type']?.includes('application/json')) {
      return res.json({ error: "Invalid CSRF token. Please refresh and try again." });
    }
    return res.render("error", {
      title: "Forbidden | GameLift", page: "error",
      status: 403, details: "Invalid or missing CSRF token.",
      data: {}, message: "Forbidden - Invalid CSRF token"
    });
  }
  next(err);
});

// Manejo general de errores — captura cualquier error que no sea CSRF
// En desarrollo muestra el stack trace completo, en producción solo el mensaje genérico
app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  // Usar nombre distinto para no sobreescribir res.locals.error de flash messages
  res.locals.devError = req.app.get("env") === "development" ? err : {};
  res.status(err.status || 500);
  res.render("error", {
    title: "Error | GameLift",
    page: "error",
    status: err.status || 500,
    details: req.app.get("env") === "development" ? err.stack : null,
    data: {}
  });
});

module.exports = app;