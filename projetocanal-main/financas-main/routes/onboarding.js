const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const router = express.Router();

router.use(isAuthenticated);

router.get('/status', (req, res) => {
  const userId = req.session.user.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const hasBudget = db.prepare('SELECT COUNT(*) c FROM budgets WHERE user_id = ?').get(userId).c > 0;
  const hasGoal = db.prepare('SELECT COUNT(*) c FROM goals WHERE user_id = ?').get(userId).c > 0;
  const hasAccount = db.prepare('SELECT COUNT(*) c FROM accounts WHERE user_id = ?').get(userId).c > 0;
  const hasTx = db.prepare('SELECT COUNT(*) c FROM transactions WHERE user_id = ?').get(userId).c > 0;
  res.json({
    onboarded: user.onboarded, step: user.onboarding_step,
    checklist: { account: hasAccount, transaction: hasTx, budget: hasBudget, goal: hasGoal },
    totalSteps: 5
  });
});

router.post('/step', (req, res) => {
  const userId = req.session.user.id;
  const { step, data } = req.body;
  const s = parseInt(step) || 0;

  if (s === 1 && data) {
    const { name, type, initial_balance, currency } = data;
    if (name && type) {
      db.prepare('INSERT INTO accounts (user_id, name, type, initial_balance, currency) VALUES (?,?,?,?,?)')
        .run(userId, name, type, Number(initial_balance) || 0, currency || 'AOA');
    }
  }
  if (s === 2 && data) {
    const { type, description, amount, date, category, account_id } = data;
    if (type && description && amount && category) {
      db.prepare('INSERT INTO transactions (user_id, type, description, amount, date, category, account_id, source) VALUES (?,?,?,?,?,?,?,?)')
        .run(userId, type, description, amount, date || new Date().toISOString().slice(0, 10), category, account_id || null, 'onboarding');
    }
  }
  if (s === 3 && data && data.category && data.limit) {
    db.prepare('INSERT INTO budgets (user_id, category, "limit") VALUES (?,?,?)')
      .run(userId, data.category, data.limit);
  }
  if (s === 4 && data && data.name && data.target) {
    db.prepare('INSERT INTO goals (user_id, name, target, icon, monthly_contribution) VALUES (?,?,?,?,?)')
      .run(userId, data.name, data.target, data.icon || '🎯', data.monthly_contribution || 0);
  }

  db.prepare('UPDATE users SET onboarding_step = ?, onboarded = ? WHERE id = ?').run(Math.max(s, 0), s >= 5 ? 1 : 0, userId);
  res.json({ step: s, onboarded: s >= 5 ? 1 : 0 });
});

router.post('/complete', (req, res) => {
  const userId = req.session.user.id;
  db.prepare('UPDATE users SET onboarded = 1, onboarding_step = 5 WHERE id = ?').run(userId);
  res.json({ onboarded: true });
});

module.exports = router;