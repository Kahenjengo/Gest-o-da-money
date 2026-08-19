const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const gamify = require('../services/gamify');
const router = express.Router();

router.use(isAuthenticated);

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const transfers = db.prepare('SELECT * FROM transfers WHERE user_id = ? ORDER BY date DESC, id DESC').all(userId);
  res.json(transfers.map(t => {
    const f = db.prepare('SELECT id, name FROM accounts WHERE id = ?').get(t.from_account);
    const to = db.prepare('SELECT id, name FROM accounts WHERE id = ?').get(t.to_account);
    return { ...t, from_account_name: f ? f.name : '?', to_account_name: to ? to.name : '?' };
  }));
});

router.post('/', (req, res) => {
  const userId = req.session.user.id;
  const { from_account, to_account, amount, date, note } = req.body;
  if (!from_account || !to_account || !amount) return res.status(400).json({ error: 'Contas e valor são obrigatórios.' });
  if (from_account === to_account) return res.status(400).json({ error: 'Selecione contas diferentes.' });
  const result = db.prepare('INSERT INTO transfers (user_id, from_account, to_account, amount, date, note) VALUES (?,?,?,?,?,?)')
    .run(userId, from_account, to_account, amount, date, note || '');
  const tx = db.prepare('SELECT * FROM transfers WHERE id = ?').get(result.lastInsertRowid);
  gamify.touchStreak(userId);
  res.status(201).json(tx);
});

router.delete('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const result = db.prepare('DELETE FROM transfers WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Transferência não encontrada.' });
  res.json({ ok: true });
});

module.exports = router;