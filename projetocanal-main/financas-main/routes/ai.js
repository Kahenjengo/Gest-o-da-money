const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const plans = require('../services/plans');
const aiService = require('../services/ai');
const gamify = require('../services/gamify');
const router = express.Router();

router.use(isAuthenticated);

router.get('/config', (req, res) => {
  const userId = req.session.user.id;
  const available = plans.can(userId, 'ai');
  res.json({
    available,
    provider: 'local-rule-engine',
    providers: ['local-rule-engine', 'openai-compatible', 'anthropic'],
    message: 'Motor local ativo. Para usar IA externa, configure API keys no servidor (variáveis de ambiente) e reinicie.'
  });
});

router.post('/ask', (req, res) => {
  const userId = req.session.user.id;
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'Pergunta é obrigatória.' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const result = aiService.answer(question, user);
  gamify.evaluateAchievements(userId);
  res.json(result);
});

router.get('/history', (req, res) => {
  const userId = req.session.user.id;
  const history = db.prepare('SELECT * FROM ai_conversations WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(userId);
  res.json(history);
});

router.get('/convert', (req, res) => {
  const userId = req.session.user.id;
  const { amount, from, to } = req.query;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const converted = aiService.convert(Number(amount) || 0, from || 'USD', to || user.currency);
  res.json({ from, to, amount: Number(amount) || 0, converted, rate: converted ? converted / (Number(amount) || 1) : null });
});

module.exports = router;