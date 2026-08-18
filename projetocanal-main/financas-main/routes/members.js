const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const router = express.Router();

router.use(isAuthenticated);

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const members = db.prepare('SELECT * FROM members WHERE user_id = ?').all(userId);
  res.json(members);
});

router.post('/', (req, res) => {
  const userId = req.session.user.id;
  const { name, relation } = req.body;
  if (!name || !relation) {
    return res.status(400).json({ error: 'Nome e relação são obrigatórios.' });
  }
  const result = db.prepare('INSERT INTO members (user_id, name, relation) VALUES (?, ?, ?)').run(userId, name, relation);
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(member);
});

router.put('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const { name, relation } = req.body;

  const existing = db.prepare('SELECT * FROM members WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Membro não encontrado.' });

  db.prepare('UPDATE members SET name=?, relation=? WHERE id=? AND user_id=?').run(name, relation, id, userId);
  const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const result = db.prepare('DELETE FROM members WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Membro não encontrado.' });
  res.json({ ok: true });
});

module.exports = router;
