const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const router = express.Router();

router.use(isAuthenticated);

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const goals = db.prepare('SELECT * FROM goals WHERE user_id = ?').all(userId);
  res.json(goals);
});

router.post('/', (req, res) => {
  const userId = req.session.user.id;
  const { name, icon, target, current, deadline } = req.body;
  if (!name || !target) {
    return res.status(400).json({ error: 'Nome e valor alvo são obrigatórios.' });
  }
  const result = db.prepare(
    'INSERT INTO goals (user_id, name, icon, target, current, deadline) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, name, icon || '🏆', target, current || 0, deadline || null);
  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(goal);
});

router.put('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const { name, icon, target, current, deadline } = req.body;

  const existing = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Meta não encontrada.' });

  db.prepare(
    'UPDATE goals SET name=?, icon=?, target=?, current=?, deadline=? WHERE id=? AND user_id=?'
  ).run(name, icon || '🏆', target, current || 0, deadline || null, id, userId);
  const updated = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const result = db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Meta não encontrada.' });
  res.json({ ok: true });
});

module.exports = router;
