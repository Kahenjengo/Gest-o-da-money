const db = require('../database');
const staticData = require('./static-data');
const { todayStr, addMonths } = require('./format');

function getEffectivePlan(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return { code: 'free', features: {}, label: 'Grátis' };
  const plan = staticData.getPlan(user.plan_code) || staticData.getPlan('free');
  let features = {};
  try { features = typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features; } catch (e) {}
  return {
    code: plan.code,
    label: plan.name,
    price_monthly: plan.price_monthly,
    price_annual: plan.price_annual,
    features
  };
}

function can(userId, feature, value) {
  const plan = getEffectivePlan(userId);
  const limit = plan.features[feature];
  if (limit === undefined) return false;
  if (limit === 0) return false;
  if (limit === true || limit === 1) return true;
  if (typeof value === 'number') return value < limit;
  return true;
}

function isPro(userId) {
  const p = getEffectivePlan(userId);
  return p.code !== 'free';
}

function isTrialActive(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || user.plan_code !== 'free') return false;
  if (!user.trial_start || !user.trial_end) return false;
  return todayStr() <= user.trial_end;
}

function startTrial(userId, days) {
  const start = todayStr();
  const endD = addMonths(new Date(), 0);
  endD.setDate(endD.getDate() + (days || 7));
  const end = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
  db.prepare('UPDATE users SET trial_start = ?, trial_end = ? WHERE id = ?').run(start, end, userId);
  return { start, end };
}

function countBy(userId, table) {
  const allow = { transactions: 'transactions_month', accounts: 'accounts', budgets: 'budgets', goals: 'goals', recurring_transactions: 'recurring' };
  const col = allow[table];
  if (!col) return null;
  return {
    used: db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE user_id = ?`).get(userId).c,
    limit: getEffectivePlan(userId).features[col]
  };
}

function upgrade(userId, planCode, period, durationMonths) {
  const plan = staticData.getPlan(planCode);
  if (!plan) return { error: 'Plano inválido' };
  db.prepare('UPDATE users SET plan_code = ? WHERE id = ?').run(planCode, userId);
  const start = todayStr();
  let endD = new Date();
  endD.setMonth(endD.getMonth() + (durationMonths || 1));
  const end = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
  db.prepare(`INSERT OR REPLACE INTO subscriptions (user_id, plan_code, status, trial_start, trial_end, current_period_start, current_period_end, next_billing_date) VALUES (?,?,?,?,?,?,?,?)`)
    .run(userId, planCode, 'active',
      todayStr(), null,
      start, end, end);
  if (planCode !== 'free') {
    db.prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) SELECT ?, id FROM achievements WHERE code = ?').run(userId, 'pro_user');
  }
  return { ok: true };
}

module.exports = { getEffectivePlan, can, isPro, isTrialActive, startTrial, countBy, upgrade };