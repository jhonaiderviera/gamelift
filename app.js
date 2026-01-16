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
const profileRouter = require("./routes/profile"); 
const igdbRouter = require("./routes/igdb");
const steamGridDbRouter = require("./routes/steamgriddb");

// Firebase Service
const { db } = require("./services/firebase");

const app = express();

// Configuración del motor de vistas
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));

// --- ¡ESTO ES LO IMPORTANTE PARA QUE FUNCIONEN LOS FORMS! ---
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// -----------------------------------------------------------

app.use(cookieParser()); 
app.use(express.static(path.join(__dirname, "public")));

// --- MIDDLEWARE DE SESIÓN GLOBAL ---
app.use((req, res, next) => {
  if (req.cookies.session) {
    try {
      const userSession = JSON.parse(req.cookies.session);
      
      // 1. Disponible para las vistas (EJS)
      res.locals.user = userSession;
      
      // 2. Disponible para las rutas (games.js, etc.)
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

// --- REGISTRO DE RUTAS ---
app.use("/", indexRouter);
app.use("/auth", authRouter);
app.use("/profile", profileRouter);
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
  
  // Renderizado seguro de error
  res.render("error", {
    title: "Error | GameLift",
    page: "error",
    status: err.status || 500,
    details: req.app.get("env") === "development" ? err.stack : null,
    data: {} 
  });
});

module.exports = app;