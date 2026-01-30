/* Ubicación: /routes/support.js */
const express = require("express");
const router = express.Router();
const { db } = require("../services/firebase");

// 1. VER LISTA DE PROYECTOS
router.get("/", async (req, res) => {
  try {
    const projectsRef = db.collection("indie_games");
    const snapshot = await projectsRef.get();

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
      user: req.user || null
    });
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.redirect("/");
  }
});

// 2. CREAR CAMPAÑA (GET)
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

// 3. PROCESAR CREACIÓN (POST) - ¡AQUÍ ESTÁ LA CORRECCIÓN!
router.post("/create", async (req, res) => {
  if (!req.user) return res.redirect("/auth/login");

  try {
    const { title, desc, imageUrl, goal, tags } = req.body;
    
    // --- LÓGICA DE NOMBRE MEJORADA ---
    // Buscamos displayName, username, name, o usamos la parte delantera del email
    let authorName = "Anonymous Dev";
    if (req.user.displayName) authorName = req.user.displayName;
    else if (req.user.username) authorName = req.user.username;
    else if (req.user.name) authorName = req.user.name;
    else if (req.user.email) authorName = req.user.email.split('@')[0];

    // --- ID DEL USUARIO ---
    // Firebase suele usar 'uid', pero a veces guardamos 'id'. Probamos ambos.
    const authorId = req.user.uid || req.user.id;

    const newProject = {
      title,
      desc,
      image: imageUrl || "https://images.igdb.com/igdb/image/upload/t_720p/co2x1u.jpg",
      goal: parseInt(goal) || 1000,
      raised: 0,
      backers: 0,
      tags: tags ? tags.split(",").map(t => t.trim()) : ["Indie"],
      
      // GUARDAMOS DATOS DEL AUTOR
      authorId: authorId, 
      author: authorName, 
      authorAvatar: req.user.photoUrl || req.user.picture || `https://ui-avatars.com/api/?name=${authorName}&background=random`,
      
      createdAt: new Date()
    };

    await db.collection("indie_games").add(newProject);
    res.redirect("/support-developers");
  } catch (error) {
    console.error("Error creating project:", error);
    res.redirect("/support-developers/create");
  }
});

// 4. DONAR
router.post("/donate/:id", async (req, res) => {
  try {
    const projectId = req.params.id;
    const amount = parseFloat(req.body.amount) || 10;
    
    const projectRef = db.collection("indie_games").doc(projectId);

    await db.runTransaction(async (t) => {
      const doc = await t.get(projectRef);
      if (!doc.exists) return;

      const data = doc.data();
      t.update(projectRef, {
        raised: (data.raised || 0) + amount,
        backers: (data.backers || 0) + 1
      });
    });

    const referer = req.get('Referer');
    if (referer && referer.includes('/support-developers/')) {
       res.redirect(referer);
    } else {
       res.redirect("/support-developers");
    }
  } catch (error) {
    console.error("Error donating:", error);
    res.redirect("/support-developers");
  }
});

// 5. VER DETALLE
router.get("/:id", async (req, res) => {
  try {
    const projectId = req.params.id;
    const doc = await db.collection("indie_games").doc(projectId).get();

    if (!doc.exists) {
      return res.render("error", { 
        title: "Project Not Found",
        page: "error",
        status: 404,
        message: "The project does not exist.",
        details: null,
        data: {}
      });
    }

    const project = { id: doc.id, ...doc.data() };

    res.render("layout", {
      title: `${project.title} | GameLift`,
      page: "support-detail",
      active: "support",
      data: { project },
      user: req.user || null
    });
  } catch (error) {
    console.error("Error fetching project:", error);
    res.redirect("/support-developers");
  }
});

module.exports = router;