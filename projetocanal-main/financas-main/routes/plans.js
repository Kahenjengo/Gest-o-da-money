const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const plans = require('../services/plans');
const staticData = require('../services/static-data');
const { notify } = require('../services/notify');
const router = express.Router();

router.use(isAuthenticated);

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const plansList = staticData.getPlans();
  const current = plans.getEffectivePlan(userId);
  const trialActive = plans.isTrialActive(userId);
  const subscription = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
  res.json({
    current,
    trialActive,
    trialDaysLeft: trialActive ? Math.max(0, Math.ceil((new Date(user.trial_end) - new Date()) / 86400000)) : 0,
    subscription,
    plans: plansList.map(p => {
      let features = {};
      try { features = typeof p.features === 'string' ? JSON.parse(p.features) : p.features; } catch (e) {}
      return { ...p, features };
    })
  });
});

router.post('/upgrade', (req, res) => {
  const userId = req.session.user.id;
  const { plan, period, durationMonths } = req.body;
  if (!plan) return res.status(400).json({ error: 'Plano obrigatório.' });
  const result = plans.upgrade(userId, plan, period || 'month', durationMonths || 1);
  if (result.error) return res.status(400).json({ error: result.error });
  if (plan !== 'free') notify(userId, 'upgrade', 'Plano ativado', `Bem-vindo ao plano ${plan.toUpperCase()}.`);
  res.json({ ok: true, plan: plans.getEffectivePlan(userId) });
});

router.post('/cancel', (req, res) => {
  const userId = req.session.user.id;
  db.prepare('UPDATE users SET plan_code = ? WHERE id = ?').run('free', userId);
  db.prepare('UPDATE subscriptions SET status = ? WHERE user_id = ?').run('cancelled', userId);
  res.json({ ok: true, plan: plans.getEffectivePlan(userId) });
});

module.exports = router;