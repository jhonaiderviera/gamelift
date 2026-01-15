const express = require("express");
const router = express.Router();
const { db } = require("../services/firebase");

// Middleware de seguridad: Si no está logueado, mandar al login
const isAuthenticated = (req, res, next) => {
  // Verificamos si existe el usuario en la sesión
  if (res.locals.user) {
    return next();
  }
  res.redirect("/auth/login");
};

// GET /profile (Ver perfil)
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const uid = res.locals.user.uid; 
    
    // Buscar datos frescos en Firestore
    const userDoc = await db.collection("users").doc(uid).get();
    
    if (!userDoc.exists) {
      // Si el usuario no existe en BD, cerramos sesión por seguridad
      return res.redirect("/auth/logout"); 
    }

    const userData = userDoc.data();

    res.render("layout", {
      title: "My Profile | GameLift",
      page: "profile", 
      active: "profile",
      // Combinamos datos de la cookie (uid, email) con los de Firestore (bio, avatar)
      user: { ...res.locals.user, ...userData }, 
      data: {} 
    });

  } catch (error) {
    console.error("Error cargando perfil:", error);
    res.redirect("/");
  }
});

// POST /profile/update (Guardar cambios)
router.post("/update", isAuthenticated, async (req, res) => {
  try {
    const uid = res.locals.user.uid;
    const { username, bio, avatarUrl } = req.body;

    // Actualizar Firestore
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