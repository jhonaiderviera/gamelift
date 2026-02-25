const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const { db } = require("../services/firebase");
const axios = require("axios");
const { getNewReleasesGames } = require("../services/igdbClient");

const crypto = require("crypto");
const nodemailer = require("nodemailer");

// CONFIGURACION DE CORREO
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Fondo de pantalla aleatorio de juegos
async function getRandomBackground() {
  try {
    const games = await getNewReleasesGames(20);
    if (games && games.length > 0) {
      const randomGame = games[Math.floor(Math.random() * games.length)];
      let bgUrl = randomGame.coverUrl;
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

// 3. Cerrar Sesion
router.get("/logout", (req, res) => {
  res.clearCookie("session");
  res.redirect("/");
});

/* --- RUTAS POST (Logica) --- */

// 4. Procesar Registro
router.post("/register", async (req, res) => {
  const { email, password, username, isDeveloper } = req.body;

  try {
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: username,
    });

    const userRole = (isDeveloper === 'true' || isDeveloper === 'on') ? 'developer' : 'user';

    await db.collection("users").doc(userRecord.uid).set({
      username: username,
      email: email,
      photoUrl: null,
      createdAt: new Date(),
      role: userRole
    });

    res.redirect("/auth/login");

  } catch (error) {
    console.error("Error creating user:", error);
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

// 5. Procesar Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const apiKey = process.env.FIREBASE_API_KEY;

  if (!apiKey) {
    return res.status(500).send("Falta configurar FIREBASE_API_KEY en .env");
  }

  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

    const response = await axios.post(url, {
      email,
      password,
      returnSecureToken: true
    });

    const { idToken, localId } = response.data;

    const userDoc = await db.collection("users").doc(localId).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    const sessionData = {
      uid: localId,
      token: idToken,
      email: email,
      username: userData.username || userData.name || "Gamer",
      avatarUrl: userData.photoUrl || null
    };

    res.cookie("session", JSON.stringify(sessionData), {
      httpOnly: true,
      maxAge: 3600 * 1000
    });

    res.redirect("/");

  } catch (error) {
    console.error("Login Error:", error.response?.data?.error?.message || error.message);

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

// ==========================================
// 6. MOSTRAR FORMULARIO "OLVIDE CONTRASENA"
// ==========================================
router.get('/forgot-password', async (req, res) => {
  res.render('layout', {
    title: 'Recover Password',
    page: 'auth/forgot-password',
    data: { bgImage: "/images/Community.png" }
  });
});

// ==========================================
// 7. POST: ENVIAR EL CORREO DE RECUPERACION
// ==========================================
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    const userRef = db.collection('users').where('email', '==', email);
    const snapshot = await userRef.get();

    if (snapshot.empty) {
      req.flash('success', 'If an account exists, an email has been sent.');
      return res.redirect('/auth/forgot-password');
    }

    const userDoc = snapshot.docs[0];

    const token = crypto.randomBytes(20).toString('hex');
    const expires = Date.now() + 3600000; // 1 hora

    await db.collection('users').doc(userDoc.id).update({
      resetPasswordToken: token,
      resetPasswordExpires: expires
    });

    const resetUrl = `http://${req.headers.host}/auth/reset-password/${token}`;

    const htmlContent = `
      <div style="background-color: #0f172a; padding: 40px; font-family: sans-serif; color: #ffffff;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #1e293b; padding: 30px; border-radius: 16px; border: 1px solid #334155;">
          <h2 style="color: #ffffff; text-align: center; margin-bottom: 20px;">GameLift Security</h2>
          <p style="color: #94a3b8; font-size: 16px;">Hello,</p>
          <p style="color: #cbd5e1; font-size: 16px;">Click the button below to set a new password.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #7c3aed; color: #ffffff; padding: 14px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #64748b; font-size: 12px; text-align: center;">Link valid for 1 hour.</p>
        </div>
      </div>
    `;

    const mailOptions = {
      to: email,
      from: 'GameLift Security <no-reply@gamelift.com>',
      subject: 'Reset your Password',
      html: htmlContent
    };

    await transporter.sendMail(mailOptions);

    req.flash('success', 'Recovery email sent! Check your inbox.');
    res.redirect('/auth/forgot-password');

  } catch (error) {
    console.error('Error forgot password:', error);
    req.flash('error', 'Error sending email.');
    res.redirect('/auth/forgot-password');
  }
});

// ==========================================
// 8. GET: VERIFICAR TOKEN DE RESET
// ==========================================
router.get('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const checkTokenSnap = await db.collection('users')
      .where('resetPasswordToken', '==', token)
      .get();

    if (checkTokenSnap.empty) {
      req.flash('error', 'This link is old or invalid. Request a new one.');
      return res.redirect('/auth/forgot-password');
    }

    const userDoc = checkTokenSnap.docs[0];
    const userData = userDoc.data();

    if (userData.resetPasswordExpires <= Date.now()) {
      req.flash('error', 'This link has expired.');
      return res.redirect('/auth/forgot-password');
    }

    res.render('layout', {
      title: 'Reset Password',
      page: 'auth/reset-password',
      token: token,
      error: req.flash('error'),
      data: { bgImage: "/images/Community.png" }
    });

  } catch (error) {
    console.error("Error in reset-password GET:", error);
    res.redirect('/auth/forgot-password');
  }
});

// ==========================================
// 9. POST: GUARDAR LA NUEVA CONTRASENA
// ==========================================
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password, confirm } = req.body;
    const { token } = req.params;

    if (password !== confirm) {
      req.flash('error', 'Passwords do not match.');
      return res.redirect('back');
    }

    const userRef = db.collection('users')
      .where('resetPasswordToken', '==', token)
      .where('resetPasswordExpires', '>', Date.now());

    const snapshot = await userRef.get();

    if (snapshot.empty) {
      req.flash('error', 'Token invalid or expired.');
      return res.redirect('/auth/forgot-password');
    }

    const userDoc = snapshot.docs[0];

    // Actualizar en Firebase Auth (la unica fuente de verdad para passwords)
    await admin.auth().updateUser(userDoc.id, {
      password: password
    });

    // Limpiar tokens de reset en Firestore (NO guardamos password aqui)
    await db.collection('users').doc(userDoc.id).update({
      resetPasswordToken: null,
      resetPasswordExpires: 0
    });

    req.flash('success', 'Success! Password changed.');
    res.redirect('/auth/login');

  } catch (error) {
    console.error("Error in reset-password POST:", error);
    res.redirect('back');
  }
});

module.exports = router;
