const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const router = express.Router();

router.use(isAuthenticated);

router.put('/', (req, res) => {
  const userId = req.session.user.id;
  const { name, email, avatar } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Nome é obrigatório.' });
  }
  db.prepare('UPDATE users SET name=?, email=?, avatar=? WHERE id=?').run(name, email || '', avatar || '', userId);
  req.session.user = { id: userId, name, email: email || '', avatar: avatar || '' };
  res.json({ user: req.session.user });
});

module.exports = router;
