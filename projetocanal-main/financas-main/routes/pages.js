const express = require('express');
const { isAuthenticatedPage } = require('../middleware/auth');
const router = express.Router();

router.get('/login', (_req, res) => {
  res.render('login');
});

router.get('/reset', (_req, res) => {
  res.render('login');
});

router.get('/', isAuthenticatedPage, (_req, res) => {
  res.render('index');
});

module.exports = router;
