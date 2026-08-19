const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const intelligence = require('../services/intelligence');
const gamify = require('../services/gamify');
const { monthStr } = require('../services/format');
const router = express.Router();

router.use(isAuthenticated);

router.get('/:type', (req, res) => {
  const userId = req.session.user.id;
  const type = req.params.type;
  const months = req.query.months ? parseInt(req.query.months) : 6;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  const out = { type };
  if (type === 'dashboard' || type === 'monthly') {
    const m = req.query.month || monthStr();
    const totals = intelligence.monthTotals(userId, m);
    const byCat = intelligence.monthTotalsByCategory(userId, m, 'expense');
    const byIncomeCat = intelligence.monthTotalsByCategory(userId, m, 'income');
    const budgets = intelligence.getBudgetsWithSpent(userId, m);
    const accounts = intelligence.getAccountsWithBalance(userId);
    out.month = m;
    out.totals = totals;
    out.categories = byCat;
    out.incomeCategories = byIncomeCat;
    out.budgets = budgets;
    out.accounts = accounts;
    out.totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
    out.daily = intelligence.dailyTotals(userId, m);
    out.balanceHistory = intelligence.balanceHistory(userId, months);
    out.forecast = intelligence.forecastMonthEnd(userId, user);
    out.spendToday = intelligence.spendToday(userId, user);
    out.anomalies = intelligence.detectAnomalies(userId);
    const score = intelligence.computeScore(userId, user);
    out.score = score.score;
    db.prepare(`INSERT OR REPLACE INTO financial_scores (user_id, month, score, factors) VALUES (?,?,?,?)`)
      .run(userId, m, score.score, JSON.stringify(score.factors));
  } else if (type === 'comparison') {
    out.months = intelligence.balanceHistory(userId, months);
  } else if (type === 'categories') {
    const m = req.query.month || monthStr();
    out.month = m;
    out.expenses = intelligence.monthTotalsByCategory(userId, m, 'expense');
    out.incomes = intelligence.monthTotalsByCategory(userId, m, 'income');
  } else if (type === 'accounts') {
    out.accounts = intelligence.getAccountsWithBalance(userId);
  } else if (type === 'recurring') {
    out.rows = db.prepare('SELECT * FROM recurring_transactions WHERE user_id = ? AND active = 1').all(userId);
    out.upcoming = intelligence.getUpcomingRecurring(userId, 30);
  } else {
    return res.status(400).json({ error: 'Tipo de relatório inválido' });
  }
  gamify.refreshChallenges(userId);
  res.json(out);
});

module.exports = router;