const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
require("dotenv").config();

// Rutas
const indexRouter = require("./routes/index");
const gamesRouter = require("./routes/games");
const featuresRouter = require("./routes/features"); // <--- NUEVO: Importar rutas de Features
const igdbRouter = require("./routes/igdb");
const steamGridDbRouter = require("./routes/steamgriddb");

const app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Routes Setup
app.use("/", indexRouter);
app.use("/games", gamesRouter);
app.use("/features", featuresRouter); // <--- NUEVO: Habilitar la ruta /features
app.use("/api/igdb", igdbRouter);
app.use("/api/steamgriddb", steamGridDbRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  
  // Pasamos 'page: error' para que el layout sepa que no cargar CSS específico
  res.render("error", {
    title: err.status === 404 ? "Not Found | GameLift" : "Error | GameLift",
    page: "error", 
    status: err.status || 500,
    details: req.app.get("env") === "development" ? err.stack : null,
    data: {} // Evita error si el layout busca data
  });
});

module.exports = app;