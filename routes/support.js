/* Ubicacion: /routes/support.js — Seccion para apoyar a devs indie */
const express = require("express");
const router = express.Router();
const { db, admin } = require("../services/firebase");
const { logActivity } = require("../services/activityLogger");

// Listado de todos los proyectos indie, ordenados del mas reciente al mas viejo
router.get("/", async (req, res) => {
  try {
    const projectsRef = db.collection("indie_games");
    const snapshot = await projectsRef.orderBy("createdAt", "desc").get();

    let projects = [];
    if (!snapshot.empty) {
      snapshot.forEach((doc) => {
        projects.push({ id: doc.id, ...doc.data() });
      });
    }

    res.render("layout", {
      title: "Support Developers | GameLift",
      page: "support",
      active: "support",
      data: { projects },
      user: req.user || null,
      messages: req.query // <--- ¡ESTO ES LO QUE FALTABA!
    });
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.redirect("/");
  }
});

// Formulario para crear un proyecto indie — solo accesible si estas logueado
router.get("/create", (req, res) => {
  if (!req.user) return res.redirect("/auth/login");
  
  res.render("layout", {
    title: "Launch Project | GameLift",
    page: "support-create",
    active: "support",
    data: {},
    user: req.user
  });
});

// Guardar el proyecto nuevo en Firestore
router.post("/create", async (req, res) => {
  if (!req.user) return res.redirect("/auth/login");

  try {
    const { title, desc, image, imageUrl, goal, tags } = req.body;
    const authorId = req.user.uid || req.user.id;

    // Username y avatar frescos de Firestore, no de la sesion que puede estar viejo
    const userDoc = await db.collection('users').doc(authorId).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const authorName = userData.username || req.user.username || req.user.email?.split('@')[0] || "Anonymous Dev";
    const authorAvatar = userData.photoUrl || req.user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=random`;

    const newProject = {
      title: title || "Untitled Project",
      desc: desc || "",
      image: image || imageUrl || "https://images.igdb.com/igdb/image/upload/t_720p/co2x1u.jpg",
      goal: parseInt(goal) || 1000,
      raised: 0,
      backers: 0,
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(",").map(t => t.trim())) : ["Indie"],

      authorId: authorId,
      author: authorName,
      authorAvatar: authorAvatar,

      createdAt: new Date()
    };

    await db.collection("indie_games").add(newProject);
    
    // --- CAMBIO AQUÍ: Añadimos el mensaje de éxito a la URL ---
    res.redirect("/support-developers?success=Project+Launched+Successfully");

  } catch (error) {
    console.error("Error creating project:", error);
    res.redirect("/support-developers/create");
  }
});

// Donar a un proyecto — transaccion para que raised y backers no se pisen entre donaciones
router.post("/donate/:id", async (req, res) => {
  try {
    const projectId = req.params.id;
    const amount = parseFloat(req.body.amount) || 10; // default $10 si no mandan monto
    const projectRef = db.collection("indie_games").doc(projectId);

    const doc = await projectRef.get();
    if (!doc.exists) return res.redirect("/support-developers");
    const projectTitle = doc.data().title;

    await db.runTransaction(async (t) => {
      const currentDoc = await t.get(projectRef);
      const data = currentDoc.data();
      t.update(projectRef, {
        raised: (data.raised || 0) + amount,
        backers: (data.backers || 0) + 1
      });
    });

    // Si esta logueado, registrar la donacion en el muro de actividad
    if (req.user) {
      const uid = req.user.uid || req.user.id;
      const userDoc = await db.collection('users').doc(uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      const donorName = userData.username || req.user.username || "Backer";
      const donorAvatar = userData.photoUrl || req.user.avatarUrl || null;

      await logActivity(uid, donorName, donorAvatar, 'donate', projectId, projectTitle, { amount: amount });
    }

    // Volver a la página anterior o a la lista
    const referer = req.get('Referer');
    if (referer && referer.includes('/support-developers/')) {
       // Si venimos del detalle, volvemos allí con mensaje
       res.redirect(referer + (referer.includes('?') ? '&' : '?') + "success=Donation+Received");
    } else {
       res.redirect("/support-developers");
    }
  } catch (error) {
    console.error("Error donating:", error);
    res.redirect("/support-developers");
  }
});

// Detalle de un proyecto con su lista de devlogs/updates
router.get("/:id", async (req, res) => {
  try {
    const projectId = req.params.id;
    const doc = await db.collection("indie_games").doc(projectId).get();

    if (!doc.exists) {
      return res.render("error", { 
        message: "Project Not Found",
        error: { status: 404 }
      });
    }

    const project = { id: doc.id, ...doc.data() };

    // Subcoleccion de updates/devlogs del proyecto, mas recientes primero
    const updatesSnap = await db.collection("indie_games").doc(projectId).collection("updates").orderBy("createdAt", "desc").get();
    
    const updates = updatesSnap.docs.map(updateDoc => ({
      id: updateDoc.id,
      ...updateDoc.data(),
      dateFormatted: updateDoc.data().createdAt ? new Date(updateDoc.data().createdAt.seconds * 1000).toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' }) : 'Recently'
    }));

    res.render("layout", {
      title: `${project.title} | GameLift`,
      page: "support-detail",
      active: "support",
      data: { project, updates },
      user: req.user || null,
      messages: req.query // Pasamos mensajes también aquí
    });
  } catch (error) {
    console.error("Error fetching project:", error);
    res.redirect("/support-developers");
  }
});

// Publicar un devlog — solo el autor del proyecto puede hacerlo
router.post("/:id/post-update", async (req, res) => {
  if (!req.user) return res.redirect("/auth/login");

  try {
    const projectId = req.params.id;
    const { title, content } = req.body;
    const uid = req.user.uid || req.user.id;

    // Verificar que quien publica es el dueno del proyecto
    const projectDoc = await db.collection("indie_games").doc(projectId).get();
    if (!projectDoc.exists || projectDoc.data().authorId !== uid) {
      return res.status(403).send("Unauthorized action.");
    }

    await db.collection("indie_games").doc(projectId).collection("updates").add({
      title,
      content,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Consultar Firestore para username actualizado
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const devName = userData.username || req.user.username || projectDoc.data().author;
    const devAvatar = userData.photoUrl || req.user.avatarUrl || null;

    await logActivity(uid, devName, devAvatar, 'devlog', projectId, projectDoc.data().title, { title: title });

    res.redirect(`/support-developers/${projectId}?tab=updates&success=Devlog+Posted`);

  } catch (error) {
    console.error("Error posting update:", error);
    res.redirect(`/support-developers/${req.params.id}?error=Failed`);
  }
});

module.exports = router;