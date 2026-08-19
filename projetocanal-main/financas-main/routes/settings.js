const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const staticData = require('../services/static-data');
const router = express.Router();

router.use(isAuthenticated);

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.json({
    country_code: user.country_code, currency: user.currency, language: user.language,
    date_format: user.date_format, timezone: user.timezone, month_start_day: user.month_start_day,
    onboarded: user.onboarded, two_fa_enabled: user.two_fa_enabled,
    countries: staticData.getCountries(), currencies: staticData.getCurrencies()
  });
});

router.put('/', (req, res) => {
  const userId = req.session.user.id;
  const { country_code, currency, language, date_format, timezone, month_start_day } = req.body;
  const country = staticData.getCountry(country_code);
  db.prepare('UPDATE users SET country_code = COALESCE(?, country_code), currency = COALESCE(?, currency), language = COALESCE(?, language), date_format = COALESCE(?, date_format), timezone = COALESCE(?, timezone), month_start_day = COALESCE(?, month_start_day) WHERE id = ?')
    .run(
      country_code || null,
      currency || null,
      language || null,
      date_format || null,
      timezone || null,
      month_start_day === undefined ? null : month_start_day,
      userId
    );
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  req.session.user = { ...req.session.user, name: user.name, email: user.email, avatar: user.avatar };
  res.json({
    country_code: user.country_code, currency: user.currency, language: user.language,
    date_format: user.date_format, timezone: user.timezone, month_start_day: user.month_start_day
  });
});

router.post('/apply-country', (req, res) => {
  const userId = req.session.user.id;
  const { country_code } = req.body;
  const country = staticData.getCountry(country_code);
  if (!country) return res.status(400).json({ error: 'País inválido.' });
  db.prepare('UPDATE users SET country_code = ?, currency = ?, date_format = ? WHERE id = ?')
    .run(country.code, country.currency_code, country.date_format, userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.json({ country_code: user.country_code, currency: user.currency, date_format: user.date_format, country });
});

module.exports = router;