const express = require("express");
const router = express.Router();
const { db } = require("../services/firebase");

// Verificar que el usuario está autenticado
const isAuthenticated = (req, res, next) => {
  if (res.locals.user) {
    return next();
  }
  res.redirect("/auth/login");
};

// Mostrar perfil del usuario
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const uid = res.locals.user.uid; 
    
    // Obtener datos actuales del usuario desde Firestore
    const userDoc = await db.collection("users").doc(uid).get();
    
    if (!userDoc.exists) {
      return res.redirect("/auth/logout"); 
    }

    const userData = userDoc.data();

    res.render("layout", {
      title: "Mi Perfil | GameLift",
      page: "profile", 
      active: "profile",
      user: { ...res.locals.user, ...userData }, 
      data: {} 
    });

  } catch (error) {
    console.error("Error cargando perfil:", error);
    res.redirect("/");
  }
});

// Actualizar datos del perfil
router.post("/update", isAuthenticated, async (req, res) => {
  try {
    const uid = res.locals.user.uid;
    const { username, bio, avatarUrl } = req.body;

    // Actualizar en Firestore
    await db.collection("users").doc(uid).update({
      username: username,
      bio: bio,
      // Si no ponen URL, generamos un avatar automático
      avatarUrl: avatarUrl || "https://ui-avatars.com/api/?name=" + username + "&background=random"
    });

    res.redirect("/profile");

  } catch (error) {
    console.error("Error actualizando perfil:", error);
    res.redirect("/profile?error=true");
  }
});

// ESTA LÍNEA ES CRUCIAL. SI FALTA, EXPRESS DA EL ERROR QUE TIENES.
module.exports = router;