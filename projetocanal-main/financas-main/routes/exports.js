const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const plans = require('../services/plans');
const exporter = require('../services/export');
const router = express.Router();

router.use(isAuthenticated);

router.get('/:type', (req, res) => {
  const userId = req.session.user.id;
  const type = req.params.type;
  const formatType = req.query.format || 'csv';
  const month = req.query.month || null;

  const needPro = ['transactions', 'recurring', 'debts', 'loans'].includes(type) && formatType === 'xlsx';
  if (needPro && !plans.can(userId, 'export_excel')) {
    return res.status(403).json({ error: 'Exportação Excel disponível no plano Pro.', code: 'PLAN_LIMIT' });
  }
  const result = exporter.buildExport(userId, type, formatType, month);
  if (result.error) return res.status(400).json({ error: result.error });

  const contentType = formatType === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'text/csv; charset=utf-8';
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('Content-Type', contentType);
  res.send(result.buffer);
});

module.exports = router;