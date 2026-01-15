const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const { db } = require("../services/firebase");
const axios = require("axios");
const { getNewReleasesGames } = require("../services/igdbClient"); // Cliente IGDB para el fondo

// --- HELPER: Obtener fondo aleatorio ---
async function getRandomBackground() {
  try {
    // Pedimos 20 juegos recientes para tener variedad
    const games = await getNewReleasesGames(20);
    
    if (games && games.length > 0) {
      const randomGame = games[Math.floor(Math.random() * games.length)];
      let bgUrl = randomGame.coverUrl;

      // Intentamos mejorar la calidad de la imagen cambiando el sufijo de IGDB
      // t_cover_big (aprox 264x374) -> t_1080p (1920x1080) o t_720p
      if (bgUrl) {
        bgUrl = bgUrl.replace("t_cover_big", "t_1080p").replace("t_thumb", "t_1080p");
      }
      
      return bgUrl || "/images/Community.png";
    }
  } catch (error) {
    console.error("Error obteniendo fondo auth:", error.message);
  }
  // Fallback si falla la API
  return "/images/Community.png"; 
}

// === VISTAS (GET) ===

// GET /auth/login
router.get("/login", async (req, res) => {
  const bgImage = await getRandomBackground();

  res.render("layout", {
    title: "Login | GameLift",
    page: "login",
    active: "login",
    error: null,
    data: { bgImage } // Pasamos la imagen para el CSS
  });
});

// GET /auth/register
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

// GET /auth/logout
router.get("/logout", (req, res) => {
  res.clearCookie("session");
  res.redirect("/");
});

// === LÓGICA (POST) ===

// POST /auth/register
router.post("/register", async (req, res) => {
  const { email, password, username } = req.body;

  try {
    // 1. Crear usuario en Firebase Authentication (Admin SDK)
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: username,
    });

    // 2. Guardar datos extra en Firestore
    await db.collection("users").doc(userRecord.uid).set({
      username: username,
      email: email,
      createdAt: new Date(),
      role: "user"
    });

    // Éxito -> Redirigir a login
    res.redirect("/auth/login");

  } catch (error) {
    console.error("Error creating user:", error);
    
    // Si falla, necesitamos recargar el fondo para mostrar el error bonito
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