const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const gamify = require('../services/gamify');
const router = express.Router();

router.use(isAuthenticated);

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const goals = db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY id').all(userId);
  res.json(goals);
});

router.post('/', (req, res) => {
  const userId = req.session.user.id;
  const { name, icon, target, current, deadline, monthly_contribution, category, priority } = req.body;
  if (!name || !target) return res.status(400).json({ error: 'Nome e valor alvo são obrigatórios.' });
  const result = db.prepare(
    'INSERT INTO goals (user_id, name, icon, target, current, deadline, monthly_contribution, category, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, name, icon || '🏆', target, current || 0, deadline || null, monthly_contribution || 0, category || null, priority || 1);
  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(result.lastInsertRowid);
  gamify.evaluateAchievements(userId);
  res.status(201).json(goal);
});

router.put('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const { name, icon, target, current, deadline, monthly_contribution, category, priority } = req.body;
  const existing = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Meta não encontrada.' });
  db.prepare(
    "UPDATE goals SET name=?, icon=?, target=?, current=?, deadline=?, monthly_contribution=?, category=?, priority=?, updated_at=datetime('now','localtime') WHERE id=? AND user_id=?"
  ).run(name, icon || '🏆', target, current || 0, deadline || null, monthly_contribution || 0, category || null, priority || 1, id, userId);
  const updated = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
  gamify.evaluateAchievements(userId);
  res.json(updated);
});

router.post('/:id/contribute', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const { amount } = req.body;
  const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(id, userId);
  if (!goal) return res.status(404).json({ error: 'Meta não encontrada.' });
  const n = Number(amount) || 0;
  const updated = db.prepare('UPDATE goals SET current = MIN(current + ?, target) WHERE id = ?').run(n, id);
  if (updated.changes) {
    db.prepare('INSERT INTO transactions (user_id, type, description, amount, date, category, note, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(userId, 'expense', `Contribuição meta: ${goal.name}`, n, new Date().toISOString().slice(0, 10), goal.category || 'Outros', 'Transferência para meta', 'goal');
  }
  const after = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
  gamify.evaluateAchievements(userId);
  res.json(after);
});

router.delete('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const result = db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Meta não encontrada.' });
  res.json({ ok: true });
});

module.exports = router;