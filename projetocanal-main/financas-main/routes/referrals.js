const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const plans = require('../services/plans');
const router = express.Router();

router.use(isAuthenticated);

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const code = user.referral_code || '';
  const link = `${req.protocol}://${req.get('host')}/login?ref=${code}`;
  const rewards = db.prepare('SELECT * FROM referral_rewards WHERE referrer_id = ? ORDER BY id DESC').all(userId);
  const stats = {
    sent: rewards.length,
    pending: rewards.filter(r => r.status === 'pending').length,
    rewarded: rewards.filter(r => r.status === 'rewarded').length,
    totalDays: rewards.filter(r => r.status === 'rewarded').reduce((s, r) => s + r.reward_days, 0)
  };
  res.json({ code, link, rewards, stats });
});

router.post('/reward', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.body;
  const reward = db.prepare('SELECT * FROM referral_rewards WHERE id = ? AND referrer_id = ?').get(id, userId);
  if (!reward) return res.status(404).json({ error: 'Convite não encontrado.' });
  db.prepare("UPDATE referral_rewards SET status = 'rewarded' WHERE id = ?").run(id);
  res.json({ ok: true });
});

module.exports = router;