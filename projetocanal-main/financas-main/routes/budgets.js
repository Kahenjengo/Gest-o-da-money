const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const plans = require('../services/plans');
const intelligence = require('../services/intelligence');
const gamify = require('../services/gamify');
const { monthStr } = require('../services/format');
const router = express.Router();

router.use(isAuthenticated);

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const m = req.query.month || monthStr();
  const budgets = intelligence.getBudgetsWithSpent(userId, m);
  res.json(budgets);
});

router.post('/', (req, res) => {
  const userId = req.session.user.id;
  const { category, limit, month, alert_threshold, projected } = req.body;
  if (!category || !limit) return res.status(400).json({ error: 'Categoria e limite são obrigatórios.' });
  const m = month || monthStr();
  const existing = db.prepare('SELECT id FROM budgets WHERE user_id = ? AND category = ? AND month = ?').get(userId, category, m);
  if (existing) return res.status(409).json({ error: 'Já existe orçamento para esta categoria neste mês.' });
  const result = db.prepare('INSERT INTO budgets (user_id, category, "limit", month, projected, alert_threshold) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, category, limit, m, projected || 0, alert_threshold || 80);
  const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(result.lastInsertRowid);
  gamify.evaluateAchievements(userId);
  res.status(201).json(budget);
});

router.put('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const { category, limit, month, alert_threshold, projected } = req.body;
  const existing = db.prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Orçamento não encontrado.' });
  db.prepare('UPDATE budgets SET category=?, "limit"=?, month=?, projected=?, alert_threshold=? WHERE id=? AND user_id=?')
    .run(category, limit, month || existing.month, projected || 0, alert_threshold || 80, id, userId);
  const updated = db.prepare('SELECT * FROM budgets WHERE id = ?').get(id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const result = db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Orçamento não encontrado.' });
  res.json({ ok: true });
});

module.exports = router;