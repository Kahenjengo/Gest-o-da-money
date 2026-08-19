const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const plans = require('../services/plans');
const gamify = require('../services/gamify');
const router = express.Router();

router.use(isAuthenticated);

router.get('/config', (req, res) => {
  const userId = req.session.user.id;
  const available = plans.can(userId, 'ai');
  res.json({
    available,
    provider: 'mock-ocr',
    providers: ['mock-ocr', 'tesseract', 'google-vision', 'azure-ocr'],
    message: 'Motor OCR local (mock) ativo. Para OCR real, configure um provedor de visão computacional.'
  });
});

router.post('/extract', (req, res) => {
  const userId = req.session.user.id;
  if (!plans.can(userId, 'ai')) {
    return res.status(403).json({ error: 'Reconhecimento de recibos disponível no plano Pro.', code: 'PLAN_LIMIT' });
  }
  const { image } = req.body;
  if (!image) return res.status(400).json({ error: 'Imagem não enviada.' });

  const today = new Date().toISOString().slice(0, 10);
  const result = {
    provider: 'mock-ocr',
    extracted: {
      description: 'Compra (recibo)',
      amount: null,
      date: today,
      category: 'Compras',
      merchant: 'Estabelecimento',
      items: []
    },
    note: 'OCR em modo demonstração. Configure um provedor de visão para leitura real dos recibos.',
    confirmed: false
  };
  res.json(result);
});

router.post('/confirm', (req, res) => {
  const userId = req.session.user.id;
  const { description, amount, date, category, account_id, merchant } = req.body;
  if (!description || !amount || !date) return res.status(400).json({ error: 'Dados incompletos.' });
  const result = db.prepare('INSERT INTO transactions (user_id, type, description, amount, date, category, account_id, source) VALUES (?,?,?,?,?,?,?,?)')
    .run(userId, 'expense', description, amount, date, category || 'Compras', account_id || null, 'ocr');
  gamify.evaluateAchievements(userId);
  res.status(201).json(db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid));
});

module.exports = router;