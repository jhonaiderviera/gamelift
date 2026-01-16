const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const { db } = require("../services/firebase");
const axios = require("axios");
const { getNewReleasesGames } = require("../services/igdbClient");

// Obtener imagen de fondo aleatorio 
async function getRandomBackground() {
  try {
    const games = await getNewReleasesGames(20);
    if (games && games.length > 0) {
      const randomGame = games[Math.floor(Math.random() * games.length)];
      let bgUrl = randomGame.coverUrl;
      // Mejorar calidad: cambiar sufijo IGDB de cover_big a 1080p
      if (bgUrl) {
        bgUrl = bgUrl.replace("t_cover_big", "t_1080p").replace("t_thumb", "t_1080p");
      }
      return bgUrl || "/images/Community.png";
    }
  } catch (error) {
    console.error("Error obteniendo fondo:", error.message);
  }
  return "/images/Community.png";
}

// Vistas GET

// Mostrar página de login
router.get("/login", async (req, res) => {
  const bgImage = await getRandomBackground();
  res.render("layout", {
    title: "Login | GameLift",
    page: "login",
    active: "login",
    error: null,
    data: { bgImage }
  });
});

// Mostrar página de registro
router.get("/register", async (req, res) => {
  const bgImage = await getRandomBackground();
  res.render("layout", {
    title: "Register | GameLift",
    page: "register", 
    active: "register",
    error: null,
    data: { bgImage }
  });
});

// Cerrar sesión
router.get("/logout", (req, res) => {
  res.clearCookie("session");
  res.redirect("/");
});

// Lógica POST

router.post("/register", async (req, res) => {
  const { email, password, username } = req.body;
  try {
    // Crear usuario en Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: username,
    });
    // Guardar datos adicionales en Firestore
    await db.collection("users").doc(userRecord.uid).set({
      username: username,
      email: email,
      createdAt: new Date(),
      role: "user"
    });
    res.redirect("/auth/login");

  } catch (error) {
    console.error("Error creating user:", error);
    
    // Si falla
    const bgImage = await getRandomBackground();

    res.render("layout", {
      title: "Register | GameLift",
      page: "register",
      active: "register",
      error: error.message,
      data: { bgImage }
    });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const apiKey = process.env.FIREBASE_API_KEY;

  if (!apiKey) {
    return res.status(500).send("Falta configurar FIREBASE_API_KEY en .env");
  }

  try {
    // 1. Validar password usando la REST API de Firebase (El Admin SDK no valida pass)
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
    
    const response = await axios.post(url, {
      email,
      password,
      returnSecureToken: true
    });

    const { idToken, localId } = response.data;

    // 2. Crear sesión (Cookie simple firmada)
    const sessionData = { uid: localId, token: idToken, email };
    
    res.cookie("session", JSON.stringify(sessionData), { 
      httpOnly: true, 
      maxAge: 3600 * 1000 // 1 hora
    });

    res.redirect("/");

  } catch (error) {
    console.error("Login Error:", error.response?.data?.error?.message || error.message);
    
    // Mensajes de error amigables
    let msg = "Invalid email or password.";
    const code = error.response?.data?.error?.message;
    if (code === "EMAIL_NOT_FOUND") msg = "User not found.";
    if (code === "INVALID_PASSWORD") msg = "Incorrect password.";
    if (code === "USER_DISABLED") msg = "This account has been disabled.";
    if (code === "TOO_MANY_ATTEMPTS_TRY_LATER") msg = "Too many attempts. Try again later.";

    // Recargar fondo para la pantalla de error
    const bgImage = await getRandomBackground();

    res.render("layout", {
      title: "Login | GameLift",
      page: "login",
      active: "login",
      error: msg,
      data: { bgImage }
    });
  }
});

module.exports = router;