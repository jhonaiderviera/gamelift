const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
require("dotenv").config();

// --- RUTAS ---
const indexRouter = require("./routes/index");
const gamesRouter = require("./routes/games");
const featuresRouter = require("./routes/features");
const authRouter = require("./routes/auth");
const profileRouter = require("./routes/profile"); // <--- NUEVO: Ruta de Perfil
const igdbRouter = require("./routes/igdb");
const steamGridDbRouter = require("./routes/steamgriddb");

// Firebase Service (Para test de conexión opcional)
const { db } = require("./services/firebase");

const app = express();

// Configuración del motor de vistas
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser()); // Vital para leer la cookie de sesión
app.use(express.static(path.join(__dirname, "public")));

// --- MIDDLEWARE DE SESIÓN GLOBAL ---
// Revisa si hay cookie "session". Si la hay, pone al usuario en 'res.locals.user'
// para que esté disponible en el Navbar y en todas las vistas.
app.use((req, res, next) => {
  if (req.cookies.session) {
    try {
      res.locals.user = JSON.parse(req.cookies.session);
    } catch (e) {
      console.error("Error parsing session cookie:", e);
      res.locals.user = null;
    }
  } else {
    res.locals.user = null;
  }
  next();
});

// --- REGISTRO DE RUTAS ---
app.use("/", indexRouter);
app.use("/auth", authRouter);
app.use("/profile", profileRouter); // <--- NUEVO: Habilitamos /profile
app.use("/games", gamesRouter);
app.use("/features", featuresRouter);
app.use("/api/igdb", igdbRouter);
app.use("/api/steamgriddb", steamGridDbRouter);

// Catch 404
app.use(function (req, res, next) {
  next(createError(404));
});

// Error handler
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