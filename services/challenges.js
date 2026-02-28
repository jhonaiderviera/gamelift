/* services/challenges.js — Monthly Backlog Challenge System */

const { db, admin } = require("./firebase");

// ── Definición de los retos mensuales ──
// Cada reto tiene un target (meta numérica) y un tier que define la dificultad/recompensa visual
const CHALLENGES = [
  {
    id: "backlog_buster",
    title: "Backlog Buster",
    desc: "Complete 3 games from your backlog this month.",
    icon: "fas fa-check-double",
    color: "#34d399",
    target: 3,
    tier: "gold",
  },
  {
    id: "review_machine",
    title: "Review Machine",
    desc: "Write 5 game reviews this month.",
    icon: "fas fa-pen-nib",
    color: "#8b5cf6",
    target: 5,
    tier: "silver",
  },
  {
    id: "discovery_explorer",
    title: "Discovery Explorer",
    desc: "Add 10 games from Discover mode this month.",
    icon: "fas fa-fire",
    color: "#ec4899",
    target: 10,
    tier: "silver",
  },
  {
    id: "genre_explorer",
    title: "Genre Explorer",
    desc: "Complete games in 3 different genres this month.",
    icon: "fas fa-compass",
    color: "#f59e0b",
    target: 3,
    tier: "gold",
  },
  {
    id: "consistent_gamer",
    title: "Consistent Gamer",
    desc: "Be active on GameLift for 7 different days this month.",
    icon: "fas fa-calendar-check",
    color: "#3b82f6",
    target: 7,
    tier: "platinum",
  },
];

// Genera la clave del mes actual (ej: "2026-02") que se usa como ID del doc en Firestore
// Así cada mes tiene su propio documento de progreso y se reinicia automáticamente
function getMonthKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// Referencia al doc de challenges del usuario para el mes actual
// Ruta en Firestore: users/{uid}/challenges/{2026-02}
function getChallengeDocRef(uid) {
  return db.collection("users").doc(uid).collection("challenges").doc(getMonthKey());
}

// Incrementa el progreso de un reto cuando el usuario hace una acción relevante
// Se llama desde las rutas (ej: al completar un juego se llama con "backlog_buster")
// Algunos retos necesitan datos extra (genre_explorer necesita el género del juego)
async function incrementChallenge(uid, challengeId, extra = {}) {
  if (!uid || !challengeId) return;

  try {
    const docRef = getChallengeDocRef(uid);
    const doc = await docRef.get();
    const data = doc.exists ? doc.data() : {};
    const challenge = CHALLENGES.find(c => c.id === challengeId);
    if (!challenge) return;

    const current = data[challengeId] || {};

    if (current.completed) return; // Ya lo completó, no sumamos más

    let update = {};

    // Cada tipo de reto tiene su propia lógica de tracking
    if (challengeId === "genre_explorer") {
      // Lleva cuenta de géneros únicos — no vale jugar 3 RPGs, tienen que ser distintos
      const genres = current.genres || [];
      const newGenre = extra.genre;
      if (newGenre && !genres.includes(newGenre)) {
        genres.push(newGenre);
        const completed = genres.length >= challenge.target;
        update[challengeId] = { genres, completed };
        if (completed) {
          update.completedCount = (data.completedCount || 0) + 1;
        }
      } else {
        return; // Género ya contado o no proporcionado
      }
    } else if (challengeId === "consistent_gamer") {
      // Cuenta días únicos de actividad — entrar 7 veces el mismo día solo cuenta como 1
      const days = current.days || [];
      const today = new Date().toISOString().split("T")[0]; // "2026-02-26"
      if (!days.includes(today)) {
        days.push(today);
        const completed = days.length >= challenge.target;
        update[challengeId] = { days, completed };
        if (completed) {
          update.completedCount = (data.completedCount || 0) + 1;
        }
      } else {
        return; // Ya contado hoy
      }
    } else {
      // Retos simples de contador (backlog_buster, review_machine, discovery_explorer)
      const newCurrent = (current.current || 0) + 1;
      const completed = newCurrent >= challenge.target;
      update[challengeId] = { current: newCurrent, completed };
      if (completed && !current.completed) {
        update.completedCount = (data.completedCount || 0) + 1;
      }
    }

    // merge: true para no borrar los datos de otros retos en el mismo doc
    await docRef.set(update, { merge: true });

    // Si justo ahora se completó el reto, le mandamos una notificación al usuario
    const updatedField = update[challengeId];
    if (updatedField && updatedField.completed && !current.completed) {
      // Import dinámico porque notificationService también importa firebase (evita circular dependency)
      const { createNotification } = require("./notificationService");
      await createNotification(uid, {
        type: "challenge_complete",
        message: `You completed "${challenge.title}"! 🏆`,
        icon: challenge.icon,
        link: "/challenges",
      });
      console.log(`🏆 Challenge completed: ${challenge.title} by ${uid}`);
    }
  } catch (err) {
    console.error(`❌ incrementChallenge(${challengeId}) error:`, err.message);
  }
}

// Trae el progreso de TODOS los retos del mes actual para mostrar en la página de /challenges
// Combina las definiciones estáticas con los datos guardados en Firestore
async function getChallengeProgress(uid) {
  try {
    const docRef = getChallengeDocRef(uid);
    const doc = await docRef.get();
    const data = doc.exists ? doc.data() : {};

    // Para cada reto, calculamos el progreso actual según su tipo de tracking
    return CHALLENGES.map(ch => {
      const progress = data[ch.id] || {};
      let current = 0;

      // Cada tipo de reto guarda el progreso diferente
      if (ch.id === "genre_explorer") {
        current = (progress.genres || []).length; // Cantidad de géneros únicos
      } else if (ch.id === "consistent_gamer") {
        current = (progress.days || []).length; // Cantidad de días activos
      } else {
        current = progress.current || 0; // Contador simple
      }

      const completed = progress.completed || false;
      const percent = Math.min(Math.round((current / ch.target) * 100), 100); // Cap a 100%

      return {
        ...ch,
        current,
        completed,
        percent,
      };
    });
  } catch (err) {
    console.error("❌ getChallengeProgress error:", err.message);
    return CHALLENGES.map(ch => ({ ...ch, current: 0, completed: false, percent: 0 }));
  }
}

module.exports = {
  CHALLENGES,
  getMonthKey,
  incrementChallenge,
  getChallengeProgress,
};
