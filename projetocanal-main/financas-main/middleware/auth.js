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

module.exports = { isAuthenticated, isAuthenticatedPage };
