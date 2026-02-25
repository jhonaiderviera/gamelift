/* Ubicación: /app.js */
const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
require("dotenv").config();
const session = require("express-session");
const flash = require("connect-flash");

// --- 1. IMPORTAR RUTAS ---
const indexRouter = require("./routes/index");
const gamesRouter = require("./routes/games");
const featuresRouter = require("./routes/features");
const authRouter = require("./routes/auth");
const profileRouter = require("./routes/profile");
const igdbRouter = require("./routes/igdb");
const steamGridDbRouter = require("./routes/steamgriddb");
const usersRouter = require("./routes/users");
const supportRouter = require("./routes/support");

const collectionsRouter = require("./routes/collections");
const versusRouter = require("./routes/versus");
const companiesRouter = require("./routes/companies");

const { doubleCsrf } = require("csrf-csrf");

const { db } = require("./services/firebase");

const app = express();

// Configurar motor de vistas EJS
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Middleware: Leer sesión desde cookie
app.use((req, res, next) => {
  if (req.cookies.session) {
    try {
      const userSession = JSON.parse(req.cookies.session);
      res.locals.user = userSession;
      req.user = userSession;
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

// Configurar el Middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'gamelift_secret_secure_key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60000 * 60 } // 1 hora
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
const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || "gamelift-csrf-secret-key",
  getSessionIdentifier: (req) => req.cookies.session || "anonymous",
  cookieName: "__csrf",
  cookieOptions: { httpOnly: true, sameSite: "strict", secure: false },
  getCsrfTokenFromRequest: (req) => req.body?._csrf || req.headers["x-csrf-token"],
});

app.use(doubleCsrfProtection);

// Generar token CSRF para todas las vistas y respuestas
app.use((req, res, next) => {
  const token = generateCsrfToken(req, res);
  res.locals.csrfToken = token;
  next();
});

// --- Registrar Rutas ---
app.use("/", indexRouter);
app.use("/auth", authRouter);
app.use("/profile", profileRouter);
app.use("/games", gamesRouter);
app.use("/features", featuresRouter);
app.use("/users", usersRouter);
app.use("/api/igdb", igdbRouter);
app.use("/api/steamgriddb", steamGridDbRouter);
app.use("/support-developers", supportRouter);

app.use("/collections", collectionsRouter);
app.use("/versus", versusRouter);
app.use("/companies", companiesRouter);

// Catch 404
app.use(function (req, res, next) {
  next(createError(404));
});

// Manejo de error CSRF
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

// Manejo de errores
app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};
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