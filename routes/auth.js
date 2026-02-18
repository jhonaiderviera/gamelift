const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const { db } = require("../services/firebase");
const axios = require("axios");
const { getNewReleasesGames } = require("../services/igdbClient");

// Función auxiliar para obtener un fondo de pantalla aleatorio de juegos
async function getRandomBackground() {
  try {
    const games = await getNewReleasesGames(20);
    if (games && games.length > 0) {
      const randomGame = games[Math.floor(Math.random() * games.length)];
      let bgUrl = randomGame.coverUrl;
      // Intentamos mejorar la calidad de la imagen si viene de IGDB
      if (bgUrl) {
        bgUrl = bgUrl.replace("t_cover_big", "t_1080p").replace("t_thumb", "t_1080p");
      }
      return bgUrl || "/images/Community.png";
    }
  } catch (error) {
    console.error("Error obteniendo fondo:", error.message);
  }
  return "/images/Community.png"; // Fondo por defecto si falla la API
}

/* --- RUTAS GET (Vistas) --- */

// 1. Mostrar Pantalla de Login
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

// 2. Mostrar Pantalla de Registro
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

// 3. Cerrar Sesión
router.get("/logout", (req, res) => {
  res.clearCookie("session");
  res.redirect("/");
});

/* --- RUTAS POST (Lógica) --- */

// 4. Procesar Registro
router.post("/register", async (req, res) => {
  const { email, password, username, isDeveloper } = req.body;
  
  try {
    // Crear usuario en Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: username,
    });

    // Determinar Rol: Si marcó la casilla es 'developer', si no 'user'
    const userRole = (isDeveloper === 'true' || isDeveloper === 'on') ? 'developer' : 'user';

    // Guardar datos adicionales en Firestore
    await db.collection("users").doc(userRecord.uid).set({
      username: username,
      email: email,
      photoUrl: null,
      createdAt: new Date(),
      role: userRole // Guardamos la elección del usuario
    });

    // Redirigir al login tras éxito
    res.redirect("/auth/login");

  } catch (error) {
    console.error("Error creating user:", error);
    const bgImage = await getRandomBackground();
    
    // Volver a mostrar el formulario con el error
    res.render("layout", {
      title: "Register | GameLift",
      page: "register",
      active: "register",
      error: error.message,
      data: { bgImage }
    });
  }
});

// 5. Procesar Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const apiKey = process.env.FIREBASE_API_KEY;

  if (!apiKey) {
    return res.status(500).send("Falta configurar FIREBASE_API_KEY en .env");
  }

  try {
    // Validar contraseña usando la API REST de Google Identity
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
    
    const response = await axios.post(url, {
      email,
      password,
      returnSecureToken: true
    });

    const { idToken, localId } = response.data;

    // Obtener datos del perfil desde Firestore (para saber nombre y foto)
    const userDoc = await db.collection("users").doc(localId).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Crear la cookie de sesión
    const sessionData = { 
      uid: localId, 
      token: idToken, 
      email: email,
      username: userData.username || userData.name || "Gamer",
      avatarUrl: userData.photoUrl || null 
    };
    
    res.cookie("session", JSON.stringify(sessionData), { 
      httpOnly: true, 
      maxAge: 3600 * 1000 // 1 hora
    });

    res.redirect("/");

  } catch (error) {
    console.error("Login Error:", error.response?.data?.error?.message || error.message);
    
    // Mensajes de error amigables para el usuario
    let msg = "Invalid email or password.";
    const code = error.response?.data?.error?.message;
    if (code === "EMAIL_NOT_FOUND") msg = "User not found.";
    if (code === "INVALID_PASSWORD") msg = "Incorrect password.";
    if (code === "USER_DISABLED") msg = "This account has been disabled.";
    if (code === "TOO_MANY_ATTEMPTS_TRY_LATER") msg = "Too many attempts. Try again later.";

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