const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const gamify = require('../services/gamify');
const router = express.Router();

router.use(isAuthenticated);

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  gamify.refreshChallenges(userId);
  const data = gamify.userGamification(userId);
  const points = db.prepare('SELECT COALESCE(SUM(reward),0) s FROM user_challenges uc JOIN challenges c ON c.id = uc.challenge_id WHERE uc.user_id = ? AND uc.completed = 1').get(userId).s;
  res.json({ ...data, points, streak: user.streak });
});

module.exports = router;