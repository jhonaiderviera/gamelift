const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
require("dotenv").config();

// Importar rutas
const indexRouter = require("./routes/index");
const gamesRouter = require("./routes/games");
const featuresRouter = require("./routes/features");
const authRouter = require("./routes/auth");
const profileRouter = require("./routes/profile"); 
const igdbRouter = require("./routes/igdb");
const steamGridDbRouter = require("./routes/steamgriddb");

// Importar servicio Firebase
const { db } = require("./services/firebase");

const app = express();

// Configurar motor de vistas EJS
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));

// Parsear JSON y formularios (necesario para que funcionen los forms)
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(cookieParser()); 
app.use(express.static(path.join(__dirname, "public")));

// Middleware: Leer sesión desde cookiee
app.use((req, res, next) => {
  if (req.cookies.session) {
    try {
      const userSession = JSON.parse(req.cookies.session);
      res.locals.user = userSession; // Para usar en vistas (EJS)
      req.user = userSession; // Para usar en rutas
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

// Registrar rutas
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