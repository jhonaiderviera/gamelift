const express = require("express");
const router = express.Router();
const { isAuthenticated } = require("../middleware/auth");
const { getChallengeProgress, getMonthKey } = require("../services/challenges");
const { getUid } = require("../middleware/auth");

// Pagina de retos mensuales — requiere login porque el progreso es por usuario
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const uid = getUid(req);
    // Trae el progreso de cada challenge definido en services/challenges.js
    const challenges = await getChallengeProgress(uid);
    const completedCount = challenges.filter(c => c.completed).length;
    const monthKey = getMonthKey();

    // Dias que quedan para completar los retos del mes
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysLeft = endOfMonth.getDate() - now.getDate();

    // Nombre del mes
    const monthName = now.toLocaleString("en-US", { month: "long", year: "numeric" });

    res.render("layout", {
      title: "Monthly Challenges | GameLift",
      page: "challenges",
      active: "challenges",
      data: {
        challenges,
        completedCount,
        totalChallenges: challenges.length,
        monthName,
        daysLeft,
        monthKey,
      },
      user: req.user,
    });
  } catch (err) {
    console.error("Challenges error:", err);
    res.render("layout", {
      title: "Monthly Challenges | GameLift",
      page: "challenges",
      active: "challenges",
      data: { challenges: [], completedCount: 0, totalChallenges: 5, monthName: "", daysLeft: 0, monthKey: "" },
      user: req.user,
    });
  }
});

module.exports = router;
