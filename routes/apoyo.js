/* Ubicación: /routes/support.js */
const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  // Datos falsos para visualizar el diseño (Mock Data)
  const projects = [
    {
      id: 1,
      title: "Echoes of the Void",
      author: "Nebula Studios",
      avatar: "https://ui-avatars.com/api/?name=Nebula+Studios&background=8b5cf6&color=fff",
      image: "https://images.igdb.com/igdb/image/upload/t_720p/co49wj.jpg", // Cyberpunk style
      desc: "A narrative-driven RPG set in a dying universe. Help us finish the soundtrack and voice acting.",
      tags: ["RPG", "Sci-Fi"],
      raised: 1200,
      goal: 5000,
      backers: 45
    },
    {
      id: 2,
      title: "Pixel Knight: Reborn",
      author: "JhonDev",
      avatar: "https://ui-avatars.com/api/?name=Jhon+Dev&background=ec4899&color=fff",
      image: "https://images.igdb.com/igdb/image/upload/t_720p/co65ac.jpg", // Pixel art
      desc: "Old school platformer with modern mechanics. 100 levels, boss fights and map editor.",
      tags: ["Platformer", "Pixel Art"],
      raised: 4500,
      goal: 5000,
      backers: 320
    },
    {
      id: 3,
      title: "Terror in the Woods",
      author: "Creepy Pasta Games",
      avatar: "https://ui-avatars.com/api/?name=CP&background=ef4444&color=fff",
      image: "https://images.igdb.com/igdb/image/upload/t_720p/co1r76.jpg", // Horror
      desc: "Survival horror where the enemy learns from your moves. We need funds for server costs.",
      tags: ["Horror", "Survival"],
      raised: 150,
      goal: 2000,
      backers: 12
    },
    {
      id: 4,
      title: "Velocity Racer X",
      author: "SpeedDrift",
      avatar: "https://ui-avatars.com/api/?name=SD&background=eab308&color=fff",
      image: "https://images.igdb.com/igdb/image/upload/t_720p/co2x1u.jpg", // Racing
      desc: "High octane arcade racing. Support us to license real car brands.",
      tags: ["Racing", "Arcade"],
      raised: 800,
      goal: 10000,
      backers: 25
    }
  ];

  res.render("layout", {
    title: "Support Developers | GameLift",
    page: "support", // Carga views/support.ejs
    active: "support",
    data: { projects }
  });
});

module.exports = router;