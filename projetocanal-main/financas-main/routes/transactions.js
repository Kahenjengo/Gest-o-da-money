const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const router = express.Router();

router.use(isAuthenticated);

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const transactions = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC').all(userId);
  res.json(transactions);
});

router.post('/', (req, res) => {
  const userId = req.session.user.id;
  const { type, description, amount, date, category, note } = req.body;
  if (!type || !description || !amount || !date || !category) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }
  const result = db.prepare(
    'INSERT INTO transactions (user_id, type, description, amount, date, category, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, type, description, amount, date, category, note || '');
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(tx);
});

router.put('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const { type, description, amount, date, category, note } = req.body;

  const existing = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Transação não encontrada.' });

  db.prepare(
    'UPDATE transactions SET type=?, description=?, amount=?, date=?, category=?, note=? WHERE id=? AND user_id=?'
  ).run(type, description, amount, date, category, note || '', id, userId);

  const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const result = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Transação não encontrada.' });
  res.json({ ok: true });
});

module.exports = router;
