const db = require('../database');

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.status(401).json({ error: 'Não autorizado' });
}

function isAuthenticatedPage(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session && req.session.user) {
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.user.id);
    if (user && user.role === 'admin') return next();
  }
  res.status(403).json({ error: 'Acesso restrito a administradores.' });
}

module.exports = { isAuthenticated, isAuthenticatedPage, isAdmin };