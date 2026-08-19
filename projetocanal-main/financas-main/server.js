require('dotenv').config();
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

const logDir = path.join(os.homedir(), '.financeiq');
try { fs.mkdirSync(logDir, { recursive: true }); } catch (e) {}
const logFile = path.join(logDir, 'server.log');
function log(msg) {
  const line = '[' + new Date().toISOString() + '] ' + msg;
  console.log(line);
  try { fs.appendFileSync(logFile, line + '\n'); } catch (e) {}
}
process.on('uncaughtException', (err) => {
  log('UNCAUGHT EXCEPTION: ' + ((err && err.stack) || err));
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  log('UNHANDLED REJECTION: ' + ((reason && reason.stack) || reason));
  process.exit(1);
});

const express = require('express');
const session = require('express-session');
const BetterSQLite3SessionStore = require('./middleware/session-store');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');

log('A arrancar FinanceIQ | node=' + process.version + ' | platform=' + process.platform + ' | arch=' + process.arch + ' | abi=' + process.versions.modules + ' | cwd=' + process.cwd());

const db = require('./database');
const dbPathLabel = (typeof db.dbPath === 'string') ? db.dbPath : 'n/a';
const Database = require('better-sqlite3');

if (process.env.ADMIN_EMAIL) {
  try {
    const adminEmail = process.env.ADMIN_EMAIL.toLowerCase().trim();
    const target = db.prepare('SELECT id, role FROM users WHERE email = ?').get(adminEmail);
    if (target) {
      if (target.role !== 'admin') {
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', target.id);
        log('ADMIN_EMAIL: ' + adminEmail + ' promovido a admin');
      }
    } else if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 6) {
      const password_hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
      const name = (adminEmail.split('@')[0] || 'Admin').replace(/[^a-zA-Z0-9 ]/g, ' ').trim() || 'Admin';
      const base = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'user';
      const referral = base + Math.random().toString(36).slice(2, 6);
      const result = db.prepare('INSERT INTO users (name, email, password_hash, role, onboarded, referral_code) VALUES (?, ?, ?, ?, 0, ?)').run(
        name, adminEmail, password_hash, 'admin', referral
      );
      log('ADMIN_EMAIL: conta admin criada em ' + dbPathLabel + ' (id=' + result.lastInsertRowid + ') - defina a senha no painel/primeiro login');
    } else {
      log('ADMIN_EMAIL: ' + adminEmail + ' não existe na base (' + dbPathLabel + ') e ADMIN_PASSWORD não definido - registe a conta no site e reinicie');
    }
  } catch (e) {
    log('ADMIN_EMAIL bootstrap falhou: ' + ((e && e.message) || e));
  }
}

function resolveSessionDbPath() {
  const explicit = process.env.SESSION_DB_PATH;
  const inProduction = process.env.NODE_ENV === 'production';
  const altDir = path.join(os.homedir(), '.financeiq');
  try { fs.mkdirSync(altDir, { recursive: true }); } catch (e) {}
  const alt = path.join(altDir, 'sessions.db');
  const preferred = explicit || (inProduction ? alt : path.join(__dirname, 'sessions.db'));
  try {
    const probe = new Database(preferred);
    probe.close();
    return preferred;
  } catch (e) {
    console.warn('[financeiq] não foi possível abrir ' + preferred + ' (' + e.message + '); sessões em ' + alt);
    return alt;
  }
}
const authRoutes = require('./routes/auth');
const pagesRoutes = require('./routes/pages');
const transactionsRoutes = require('./routes/transactions');
const budgetsRoutes = require('./routes/budgets');
const goalsRoutes = require('./routes/goals');
const membersRoutes = require('./routes/members');
const profileRoutes = require('./routes/profile');
const accountsRoutes = require('./routes/accounts');
const categoriesRoutes = require('./routes/categories');
const transfersRoutes = require('./routes/transfers');
const recurringRoutes = require('./routes/recurring');
const debtsRoutes = require('./routes/debts');
const loansRoutes = require('./routes/loans');
const notificationsRoutes = require('./routes/notifications');
const reportsRoutes = require('./routes/reports');
const exportsRoutes = require('./routes/exports');
const intelligenceRoutes = require('./routes/intelligence');
const aiRoutes = require('./routes/ai');
const importRoutes = require('./routes/import');
const ocrRoutes = require('./routes/ocr');
const familyRoutes = require('./routes/family');
const plansRoutes = require('./routes/plans');
const adminRoutes = require('./routes/admin');
const settingsRoutes = require('./routes/settings');
const onboardingRoutes = require('./routes/onboarding');
const referralsRoutes = require('./routes/referrals');
const gamificationRoutes = require('./routes/gamification');

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

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: false, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new BetterSQLite3SessionStore({ db: resolveSessionDbPath() }),
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: 'auto',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30,
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
app.use('/api/accounts', accountsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/transfers', transfersRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/debts', debtsRoutes);
app.use('/api/loans', loansRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/export', exportsRoutes);
app.use('/api/intelligence', intelligenceRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/import', importRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/referrals', referralsRoutes);
app.use('/api/gamification', gamificationRoutes);

app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()), pid: process.pid, db: dbPathLabel });
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint não encontrado.' });
  res.status(404).send('Página não encontrada.');
});

app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

if (process.env.ELECTRON_MODE !== '1') {
  app.listen(PORT, () => {
    log(`FinanceIQ rodando em http://localhost:${PORT} (pid ${process.pid})`);
  });
}

module.exports = app;