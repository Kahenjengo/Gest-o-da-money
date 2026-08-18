const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const router = express.Router();

router.use(isAuthenticated);

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ?').all(userId);
  res.json(budgets);
});

router.post('/', (req, res) => {
  const userId = req.session.user.id;
  const { category, limit } = req.body;
  if (!category || !limit) {
    return res.status(400).json({ error: 'Categoria e limite são obrigatórios.' });
  }

  const existing = db.prepare('SELECT id FROM budgets WHERE user_id = ? AND category = ?').get(userId, category);
  if (existing) {
    return res.status(409).json({ error: 'Já existe orçamento para esta categoria.' });
  }

  const result = db.prepare('INSERT INTO budgets (user_id, category, "limit") VALUES (?, ?, ?)').run(userId, category, limit);
  const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(budget);
});

router.put('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const { category, limit } = req.body;

  const existing = db.prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Orçamento não encontrado.' });

  db.prepare('UPDATE budgets SET category=?, "limit"=? WHERE id=? AND user_id=?').run(category, limit, id, userId);
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
