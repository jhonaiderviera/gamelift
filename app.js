const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
require("dotenv").config();

const indexRouter = require("./routes/index");
const gamesRouter = require("./routes/games");
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

// Routes
app.use("/", indexRouter);
app.use("/games", gamesRouter);
app.use("/api/igdb", igdbRouter);
app.use("/api/steamgriddb", steamGridDbRouter);

// catch 404
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  res.status(err.status || 500);
  res.render("error", {
    title: err.status === 404 ? "Not Found | GameLift" : "Error | GameLift",
    status: err.status || 500,
    details: req.app.get("env") === "development" ? err.stack : null,
  });
});

module.exports = app;
