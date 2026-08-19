const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const gamify = require('../services/gamify');
const router = express.Router();

router.use(isAuthenticated);

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const loans = db.prepare('SELECT * FROM loans WHERE user_id = ? ORDER BY date DESC').all(userId);
  res.json(loans);
});

router.post('/', (req, res) => {
  const userId = req.session.user.id;
  const { person, amount, direction, date, term, status, notes } = req.body;
  if (!person || !amount || !direction) return res.status(400).json({ error: 'Pessoa, valor e direção são obrigatórios.' });
  const result = db.prepare('INSERT INTO loans (user_id, person, amount, direction, date, term, status, notes) VALUES (?,?,?,?,?,?,?,?)')
    .run(userId, person, amount, direction, date || new Date().toISOString().slice(0, 10), term || 'short', status || 'pending', notes || '');
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(result.lastInsertRowid);
  gamify.evaluateAchievements(userId);
  res.status(201).json(loan);
});

router.put('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const { person, amount, direction, date, term, status, notes } = req.body;
  const existing = db.prepare('SELECT * FROM loans WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Empréstimo não encontrado.' });
  db.prepare('UPDATE loans SET person=?, amount=?, direction=?, date=?, term=?, status=?, notes=? WHERE id=? AND user_id=?')
    .run(person, amount, direction, date, term, status, notes || '', id, userId);
  res.json(db.prepare('SELECT * FROM loans WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const result = db.prepare('DELETE FROM loans WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Empréstimo não encontrado.' });
  res.json({ ok: true });
});

module.exports = router;