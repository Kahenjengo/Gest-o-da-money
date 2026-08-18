require('dotenv').config();
const express = require('express');
const session = require('express-session');
const BetterSQLite3SessionStore = require('./middleware/session-store');
const helmet = require('helmet');
const path = require('path');

const db = require('./database');
const authRoutes = require('./routes/auth');
const pagesRoutes = require('./routes/pages');
const transactionsRoutes = require('./routes/transactions');
const budgetsRoutes = require('./routes/budgets');
const goalsRoutes = require('./routes/goals');
const membersRoutes = require('./routes/members');
const profileRoutes = require('./routes/profile');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new BetterSQLite3SessionStore({ db: process.env.SESSION_DB_PATH || path.join(__dirname, 'sessions.db') }),
  secret: process.env.SESSION_SECRET || 'default-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: 'auto',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.use('/', authRoutes);
app.use('/', pagesRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/budgets', budgetsRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/profile', profileRoutes);

app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

if (process.env.ELECTRON_MODE !== '1') {
  app.listen(PORT, () => {
    console.log(`FinanceIQ rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
