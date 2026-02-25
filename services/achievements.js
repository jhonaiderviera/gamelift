/**
 * Servicio de logros centralizado.
 * Antes estaba duplicado en profile.js (perfil privado y publico).
 */

const ACHIEVEMENT_DEFINITIONS = [
  { id: '1', title: 'Hello World', desc: 'Create your account.', tier: 'bronze', icon: 'fas fa-user' },
  { id: '2', title: 'First Voice', desc: 'Write your first review.', tier: 'bronze', icon: 'fas fa-pen-nib' },
  { id: '3', title: 'Librarian', desc: 'Add 5 games to library.', tier: 'silver', icon: 'fas fa-book' },
  { id: '4', title: 'Critic', desc: 'Write 5 reviews.', tier: 'silver', icon: 'fas fa-star' },
  { id: '5', title: 'Angel Investor', desc: 'Back a project.', tier: 'gold', icon: 'fas fa-hand-holding-heart' },
  { id: '6', title: 'Visionary', desc: 'Publish a project.', tier: 'gold', icon: 'fas fa-lightbulb' },
  { id: '7', title: 'GameLift Legend', desc: 'Unlock all others.', tier: 'platinum', icon: 'fas fa-trophy' }
];

/**
 * Calcula los logros desbloqueados para un usuario.
 * @param {{ reviewCount: number, libraryCount: number, projectCount: number }} stats
 * @returns {{ achievements: Array, unlockedCount: number, progressPercent: number }}
 */
function getAchievements({ reviewCount = 0, libraryCount = 0, projectCount = 0 }) {
  const unlockRules = {
    '1': true,                    // Siempre desbloqueado (tiene cuenta)
    '2': reviewCount > 0,
    '3': libraryCount >= 5,
    '4': reviewCount >= 5,
    '5': false,                   // TODO: Implementar cuando se trackee backing
    '6': projectCount > 0,
    '7': false                    // Se calcula abajo
  };

  const achievements = ACHIEVEMENT_DEFINITIONS.map(a => ({
    ...a,
    unlocked: unlockRules[a.id] || false
  }));

  // Legend: true solo si todos los demas estan desbloqueados
  const othersUnlocked = achievements.filter(a => a.id !== '7').every(a => a.unlocked);
  achievements.find(a => a.id === '7').unlocked = othersUnlocked;

  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const progressPercent = Math.round((unlockedCount / achievements.length) * 100);

  return { achievements, unlockedCount, progressPercent };
}

module.exports = { getAchievements };
