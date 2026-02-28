/**
 * Servicio de logros centralizado.
 * Antes estaba duplicado en profile.js (perfil privado y publico).
 */

// Definición de todos los logros de la plataforma
// Cada logro tiene un tier (bronze/silver/gold/platinum) que define su rareza visual
const ACHIEVEMENT_DEFINITIONS = [
  { id: '1', title: 'Hello World', desc: 'Create your account.', tier: 'bronze', icon: 'fas fa-user' },
  { id: '2', title: 'First Voice', desc: 'Write your first review.', tier: 'bronze', icon: 'fas fa-pen-nib' },
  { id: '3', title: 'Librarian', desc: 'Add 5 games to library.', tier: 'silver', icon: 'fas fa-book' },
  { id: '4', title: 'Critic', desc: 'Write 5 reviews.', tier: 'silver', icon: 'fas fa-star' },
  { id: '5', title: 'Angel Investor', desc: 'Back a project.', tier: 'gold', icon: 'fas fa-hand-holding-heart' },
  { id: '6', title: 'Visionary', desc: 'Publish a project.', tier: 'gold', icon: 'fas fa-lightbulb' },
  { id: '7', title: 'GameLift Legend', desc: 'Unlock all others.', tier: 'platinum', icon: 'fas fa-trophy' }
];

// Calcula cuáles logros tiene desbloqueados un usuario basándose en sus stats
// No se guarda en Firestore — se calcula on-the-fly cada vez que se ve un perfil
function getAchievements({ reviewCount = 0, libraryCount = 0, projectCount = 0 }) {
  // Reglas de desbloqueo: cada ID mapea a una condición booleana
  const unlockRules = {
    '1': true,                    // Se desbloquea al crear la cuenta
    '2': reviewCount > 0,
    '3': libraryCount >= 5,
    '4': reviewCount >= 5,
    '5': false,                   // TODO: Falta implementar tracking de backing/donaciones
    '6': projectCount > 0,
    '7': false                    // El logro "Legend" se calcula después
  };

  const achievements = ACHIEVEMENT_DEFINITIONS.map(a => ({
    ...a,
    unlocked: unlockRules[a.id] || false
  }));

  // "GameLift Legend" solo se desbloquea si TODOS los demás están desbloqueados
  const othersUnlocked = achievements.filter(a => a.id !== '7').every(a => a.unlocked);
  achievements.find(a => a.id === '7').unlocked = othersUnlocked;

  // Calculamos el % de progreso para la barra del perfil
  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const progressPercent = Math.round((unlockedCount / achievements.length) * 100);

  return { achievements, unlockedCount, progressPercent };
}

module.exports = { getAchievements };
