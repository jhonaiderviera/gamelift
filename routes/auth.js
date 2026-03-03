const express = require("express");
const router = express.Router();
const { admin, db } = require("../services/firebase");
const { getNewReleasesGames } = require("../services/igdbClient");

const crypto = require("crypto");
const { sendEmail } = require("../services/emailClient");

// Rutas de autenticacion: login, registro, logout, recuperacion de contrasena y paginas legales

// Trae un fondo random de IGDB para las pantallas de login/registro (mas visual)
async function getRandomBackground() {
  try {
    const games = await getNewReleasesGames(20);
    if (games && games.length > 0) {
      const randomGame = games[Math.floor(Math.random() * games.length)];
      let bgUrl = randomGame.coverUrl;
      if (bgUrl) {
        // Cambiar resolucion del cover a 1080p para que se vea bien de fondo
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

// Pantalla de login con fondo aleatorio de juegos
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

// Pantalla de registro — mismo fondo aleatorio que login
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

// Paginas legales — estaticas, sin data dinamica
router.get("/legal/terms", (req, res) => {
  res.render("layout", {
    title: "Terms of Service | GameLift",
    page: "legal/terms",
    active: "register",
    error: null,
    data: {}
  });
});

router.get("/legal/privacy", (req, res) => {
  res.render("layout", {
    title: "Privacy Policy | GameLift",
    page: "legal/privacy",
    active: "register",
    error: null,
    data: {}
  });
});

// Logout — simplemente borra la cookie de sesion y redirige al home
router.get("/logout", (req, res) => {
  res.clearCookie("session");
  res.redirect("/");
});

/* --- RUTAS POST (Logica) --- */

// Registro — crea usuario en Firebase Auth + doc en Firestore + auto-login
router.post("/register", async (req, res) => {
  const { email, password, username, isDeveloper } = req.body;

  // Validacion de entrada
  const trimmedUsername = String(username || '').trim();
  const trimmedEmail = String(email || '').trim().toLowerCase();

  if (!trimmedEmail || !password || !trimmedUsername) {
    const bgImage = await getRandomBackground();
    return res.render("layout", {
      title: "Register | GameLift", page: "register", active: "register",
      error: "All fields are required.", data: { bgImage }
    });
  }

  if (trimmedUsername.length < 2 || trimmedUsername.length > 30) {
    const bgImage = await getRandomBackground();
    return res.render("layout", {
      title: "Register | GameLift", page: "register", active: "register",
      error: "Username must be 2-30 characters.", data: { bgImage }
    });
  }

  if (password.length < 6) {
    const bgImage = await getRandomBackground();
    return res.render("layout", {
      title: "Register | GameLift", page: "register", active: "register",
      error: "Password must be at least 6 characters.", data: { bgImage }
    });
  }

  try {
    // Crear usuario en Firebase Auth (ahi se guarda la contrasena encriptada)
    const userRecord = await admin.auth().createUser({
      email: trimmedEmail,
      password: password,
      displayName: trimmedUsername,
    });

    const userRole = (isDeveloper === 'true' || isDeveloper === 'on') ? 'developer' : 'user';

    // Crear doc en Firestore con datos de perfil (NO guardamos password aqui)
    await db.collection("users").doc(userRecord.uid).set({
      username: trimmedUsername,
      email: trimmedEmail,
      photoUrl: null,
      followers: [],
      following: [],
      createdAt: new Date(),
      role: userRole
    });

    // Auto-login despues de registrarse — setea cookie y redirige, sin pasar por /login
    const sessionData = {
      uid: userRecord.uid,
      email: trimmedEmail,
      username: trimmedUsername,
      avatarUrl: null
    };

    res.cookie("session", JSON.stringify(sessionData), {
      httpOnly: true,
      maxAge: 3600 * 1000
    });

    res.redirect("/");

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

// Login — autentica contra Firebase Auth REST API y crea cookie de sesion
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const apiKey = process.env.FIREBASE_API_KEY; // necesaria para la REST API de Firebase

  if (!apiKey) {
    return res.status(500).send("Falta configurar FIREBASE_API_KEY en .env");
  }

  try {
    // Usamos la REST API de Firebase (no el Admin SDK) porque necesitamos validar la contrasena
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });

    const data = await response.json();

    // Mapear codigos de error de Firebase a mensajes amigables
    if (!response.ok || data.error) {
      const code = data.error?.message;
      let msg = "Invalid email or password.";
      if (code === "EMAIL_NOT_FOUND") msg = "User not found.";
      if (code === "INVALID_PASSWORD") msg = "Incorrect password.";
      if (code === "USER_DISABLED") msg = "This account has been disabled.";
      if (code === "TOO_MANY_ATTEMPTS_TRY_LATER") msg = "Too many attempts. Try again later.";

      const bgImage = await getRandomBackground();
      return res.render("layout", {
        title: "Login | GameLift", page: "login", active: "login",
        error: msg, data: { bgImage }
      });
    }

    const { idToken, localId } = data;

    // Traer datos del perfil de Firestore para la sesion (username, avatar, etc)
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
    console.error("Login Error:", error.message);

    const bgImage = await getRandomBackground();

    res.render("layout", {
      title: "Login | GameLift",
      page: "login",
      active: "login",
      error: "An error occurred. Please try again.",
      data: { bgImage }
    });
  }
});

// Formulario de "olvide mi contrasena"
router.get('/forgot-password', async (req, res) => {
  res.render('layout', {
    title: 'Recover Password',
    page: 'auth/forgot-password',
    data: { bgImage: "/images/Community.png" }
  });
});

// Procesar solicitud de recuperacion — genera token y envia email con link de reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    // Buscar si existe una cuenta con ese email en Firestore
    const userRef = db.collection('users').where('email', '==', email);
    const snapshot = await userRef.get();

    // Mensaje generico por seguridad (no revelar si el email existe o no)
    if (snapshot.empty) {
      req.flash('success', 'If an account exists, an email has been sent.');
      return res.redirect('/auth/forgot-password');
    }

    const userDoc = snapshot.docs[0];

    // Token crypto random + expiracion de 1 hora
    const token = crypto.randomBytes(20).toString('hex');
    const expires = Date.now() + 3600000;

    // Guardar token en Firestore para verificarlo cuando el usuario haga click
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

    await sendEmail({
      to: email,
      subject: 'Reset your Password',
      html: htmlContent,
    });

    req.flash('success', 'Recovery email sent! Check your inbox.');
    res.redirect('/auth/forgot-password');

  } catch (error) {
    console.error('Error forgot password:', error);
    req.flash('error', 'Error sending email.');
    res.redirect('/auth/forgot-password');
  }
});

// Verificar que el token de reset sea valido y no haya expirado antes de mostrar el form
router.get('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Buscar en Firestore el usuario que tiene este token
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

// Guardar la nueva contrasena — actualiza Firebase Auth y limpia tokens en Firestore
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password, confirm } = req.body;
    const { token } = req.params;

    if (password !== confirm) {
      req.flash('error', 'Passwords do not match.');
      return res.redirect('back');
    }

    // Verificar token + que no haya expirado en una sola query compuesta
    const userRef = db.collection('users')
      .where('resetPasswordToken', '==', token)
      .where('resetPasswordExpires', '>', Date.now());

    const snapshot = await userRef.get();

    if (snapshot.empty) {
      req.flash('error', 'Token invalid or expired.');
      return res.redirect('/auth/forgot-password');
    }

    const userDoc = snapshot.docs[0];

    // Firebase Auth es la UNICA fuente de verdad para contrasenas, Firestore solo guarda perfil
    await admin.auth().updateUser(userDoc.id, {
      password: password
    });

    // Limpiar tokens de reset para que no se puedan reutilizar
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
