const db = require('../database');
const staticData = require('./static-data');

function countTransactions(userId) {
  return db.prepare('SELECT COUNT(*) c FROM transactions WHERE user_id = ?').get(userId).c;
}

function countBudgets(userId) {
  return db.prepare('SELECT COUNT(*) c FROM budgets WHERE user_id = ?').get(userId).c;
}

function countGoals(userId) {
  return db.prepare('SELECT COUNT(*) c FROM goals WHERE user_id = ?').get(userId).c;
}

function countReferrals(userId) {
  return db.prepare('SELECT COUNT(*) c FROM referral_rewards WHERE referrer_id = ? AND status = ?').get(userId, 'rewarded').c;
}

function countFamilyMembers(userId) {
  const u = db.prepare('SELECT family_id FROM users WHERE id = ?').get(userId);
  if (!u || !u.family_id) return 0;
  return db.prepare('SELECT COUNT(*) c FROM family_members WHERE family_id = ? AND status = ?').get(u.family_id, 'active').c;
}

function countDebtsPaid(userId) {
  return db.prepare('SELECT COUNT(*) c FROM debts WHERE user_id = ? AND paid_amount >= original_amount AND original_amount > 0').get(userId).c;
}

function countAiQuestions(userId) {
  return db.prepare('SELECT COUNT(*) c FROM ai_conversations WHERE user_id = ?').get(userId).c;
}

function countImports(userId) {
  return db.prepare('SELECT COUNT(*) c FROM imported_files WHERE user_id = ?').get(userId).c;
}

function budgetStreak(userId) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let streak = 0;
  const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ?').all(userId);
  if (!budgets.length) return 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let allOk = budgets.length > 0;
    budgets.forEach(b => {
      const spent = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND type = ? AND category = ? AND date = ?').get(userId, 'expense', b.category, day).s;
      if (spent > b.limit) allOk = false;
    });
    if (allOk) streak++; else break;
  }
  return streak;
}

function getScore(userId) {
  const row = db.prepare('SELECT score FROM financial_scores WHERE user_id = ? ORDER BY month DESC').get(userId);
  return row ? row.score : 0;
}

function computeChallengeProgress(challenge, userId) {
  const metric = challenge.metric;
  const map = {
    transactions: countTransactions,
    budgets: countBudgets,
    goals: countGoals,
    budget_streak: budgetStreak,
    income_months: (uid) => db.prepare('SELECT COUNT(DISTINCT substr(date,1,7)) c FROM transactions WHERE user_id = ? AND type = ?').get(uid, 'income').c,
    referrals: countReferrals,
    family_members: countFamilyMembers,
    debt_paid: countDebtsPaid,
    report_months: (uid) => db.prepare('SELECT COUNT(DISTINCT month) c FROM financial_scores WHERE user_id = ?').get(uid).c,
    imports: countImports,
    ai_questions: countAiQuestions,
    score: getScore
  };
  const fn = map[metric];
  return fn ? fn(userId) : 0;
}

function refreshChallenges(userId) {
  const challenges = staticData.getChallenges();
  const upsert = db.prepare('INSERT OR IGNORE INTO user_challenges (user_id, challenge_id, progress, completed) VALUES (?,?,0,0)');
  const update = db.prepare('UPDATE user_challenges SET progress = ?, completed = ?, completed_at = COALESCE(completed_at, ?) WHERE user_id = ? AND challenge_id = ?');
  const now = new Date().toISOString();
  const unlocked = [];
  challenges.forEach(c => {
    upsert.run(userId, c.id);
    const progress = computeChallengeProgress(c, userId);
    const completed = progress >= c.target ? 1 : 0;
    update.run(progress, completed, completed ? now : null, userId, c.id);
    if (completed && progress === c.target) {
      const prev = db.prepare('SELECT * FROM user_challenges WHERE user_id = ? AND challenge_id = ?').get(userId, c.id);
      if (prev && !prev.completed_at) unlocked.push(c);
    }
  });
  return unlocked;
}

function getUserChallenges(userId) {
  const rows = db.prepare('SELECT uc.*, c.name, c.description, c.target, c.metric, c.reward, c.reward_type, c.icon, c.code FROM user_challenges uc JOIN challenges c ON c.id = uc.challenge_id WHERE uc.user_id = ? ORDER BY c.sort').all(userId);
  return rows;
}

function unlockAchievement(userId, code) {
  const a = db.prepare('SELECT * FROM achievements WHERE code = ?').get(code);
  if (!a) return null;
  const exists = db.prepare('SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?').get(userId, a.id);
  if (exists) return null;
  db.prepare('INSERT INTO user_achievements (user_id, achievement_id) VALUES (?,?)').run(userId, a.id);
  return a;
}

function getUserAchievements(userId) {
  return db.prepare('SELECT a.*, ua.unlocked_at FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = ? ORDER BY ua.unlocked_at').all(userId);
}

function touchStreak(userId) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  let streak = u.streak || 0;
  if (u.last_active_date !== todayStr) {
    const yest = new Date(today); yest.setDate(yest.getDate() - 1);
    const yestStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;
    streak = u.last_active_date === yestStr ? streak + 1 : 1;
    db.prepare('UPDATE users SET streak = ?, last_active_date = ? WHERE id = ?').run(streak, todayStr, userId);
  }
  if (streak >= 7) unlockAchievement(userId, 'streak_7');
  return streak;
}

function evaluateAchievements(userId) {
  const out = [];
  const push = a => { if (a) out.push(a); };
  if (countTransactions(userId) >= 1) push(unlockAchievement(userId, 'first_expense'));
  const inc = db.prepare('SELECT COUNT(*) c FROM transactions WHERE user_id = ? AND type = ?').get(userId, 'income').c;
  if (inc >= 1) push(unlockAchievement(userId, 'first_income'));
  if (countBudgets(userId) >= 5) push(unlockAchievement(userId, 'budget_master'));
  const goalsDone = db.prepare('SELECT COUNT(*) c FROM goals WHERE user_id = ? AND current >= target').get(userId).c;
  if (goalsDone >= 1) push(unlockAchievement(userId, 'saver'));
  const accts = db.prepare('SELECT COUNT(*) c FROM accounts WHERE user_id = ?').get(userId).c;
  if (accts >= 3) push(unlockAchievement(userId, 'organizer'));
  const rec = db.prepare('SELECT COUNT(*) c FROM recurring_transactions WHERE user_id = ?').get(userId).c;
  if (rec >= 1) push(unlockAchievement(userId, 'planner'));
  if (countDebtsPaid(userId) >= 1) push(unlockAchievement(userId, 'debt_free'));
  const inv = db.prepare('SELECT COUNT(*) c FROM accounts WHERE user_id = ? AND type = ?').get(userId, 'investment').c;
  if (inv >= 1) push(unlockAchievement(userId, 'investor'));
  const lent = db.prepare('SELECT COUNT(*) c FROM loans WHERE user_id = ? AND direction = ?').get(userId, 'lent').c;
  if (lent >= 1) push(unlockAchievement(userId, 'helper'));
  if (countReferrals(userId) >= 1) push(unlockAchievement(userId, 'referrer'));
  if (countImports(userId) >= 1) push(unlockAchievement(userId, 'analyst'));
  return out;
}

function userGamification(userId) {
  const unlocked = refreshChallenges(userId);
  const evaluated = evaluateAchievements(userId);
  return {
    challenges: getUserChallenges(userId),
    achievements: getUserAchievements(userId),
    newlyUnlocked: [...unlocked, ...evaluated]
  };
}

module.exports = { refreshChallenges, getUserChallenges, unlockAchievement, getUserAchievements, touchStreak, evaluateAchievements, userGamification };