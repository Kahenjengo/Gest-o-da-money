const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const intelligence = require('../services/intelligence');
const plans = require('../services/plans');
const { monthStr } = require('../services/format');
const router = express.Router();

router.use(isAuthenticated);

router.get('/spend-today', (req, res) => {
  const userId = req.session.user.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.json(intelligence.spendToday(userId, user));
});

router.get('/forecast', (req, res) => {
  const userId = req.session.user.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.json(intelligence.forecastMonthEnd(userId, user));
});

router.get('/anomalies', (req, res) => {
  const userId = req.session.user.id;
  res.json(intelligence.detectAnomalies(userId));
});

router.get('/score', (req, res) => {
  const userId = req.session.user.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const score = intelligence.computeScore(userId, user);
  const m = monthStr();
  db.prepare('INSERT OR REPLACE INTO financial_scores (user_id, month, score, factors) VALUES (?,?,?,?)')
    .run(userId, m, score.score, JSON.stringify(score.factors));
  const history = db.prepare('SELECT month, score FROM financial_scores WHERE user_id = ? ORDER BY month').all(userId);
  res.json({ ...score, history });
});

router.get('/calendar', (req, res) => {
  const userId = req.session.user.id;
  const m = req.query.month || monthStr();
  const daily = intelligence.dailyTotals(userId, m);
  const recurring = db.prepare('SELECT * FROM recurring_transactions WHERE user_id = ? AND active = 1').all(userId);
  const days = {};
  daily.forEach(d => { days[d.date] = { income: d.income, expense: d.expense }; });
  const out = { month: m, days };
  recurring.forEach(r => {
    const day = Math.min(r.due_day || 1, 28);
    const date = `${m}-${String(day).padStart(2, '0')}`;
    if (!days[date]) days[date] = { income: 0, expense: 0, recurring: [] };
    if (!days[date].recurring) days[date].recurring = [];
    days[date].recurring.push({ description: r.description, amount: r.amount, type: r.type });
  });
  res.json(out);
});

router.get('/balance-history', (req, res) => {
  const userId = req.session.user.id;
  const months = parseInt(req.query.months) || 6;
  res.json(intelligence.balanceHistory(userId, months));
});

module.exports = router;