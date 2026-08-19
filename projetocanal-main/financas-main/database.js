const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'financeiq.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function tableExists(name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function columnExists(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some(c => c.name === column);
}

function ensureColumn(table, column, ddl) {
  if (tableExists(table) && !columnExists(table, column)) {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`); } catch (e) { /* ignore */ }
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    "limit" REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, category)
  );

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🏆',
    target REAL NOT NULL,
    current REAL DEFAULT 0,
    deadline TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    relation TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

/* ============ Migration de usuários ============ */
ensureColumn('users', 'role', "TEXT DEFAULT 'member'");
ensureColumn('users', 'plan_code', "TEXT DEFAULT 'free'");
ensureColumn('users', 'referral_code', 'TEXT DEFAULT NULL');
ensureColumn('users', 'referred_by', 'TEXT DEFAULT NULL');
ensureColumn('users', 'country_code', "TEXT DEFAULT 'AO'");
ensureColumn('users', 'currency', "TEXT DEFAULT 'AOA'");
ensureColumn('users', 'language', "TEXT DEFAULT 'pt'");
ensureColumn('users', 'date_format', "TEXT DEFAULT 'dd/mm/yyyy'");
ensureColumn('users', 'timezone', "TEXT DEFAULT 'Africa/Luanda'");
ensureColumn('users', 'month_start_day', 'INTEGER DEFAULT 1');
ensureColumn('users', 'onboarded', 'INTEGER DEFAULT 0');
ensureColumn('users', 'onboarding_step', 'INTEGER DEFAULT 0');
ensureColumn('users', 'trial_start', 'TEXT DEFAULT NULL');
ensureColumn('users', 'trial_end', 'TEXT DEFAULT NULL');
ensureColumn('users', 'two_fa_enabled', 'INTEGER DEFAULT 0');
ensureColumn('users', 'streak', 'INTEGER DEFAULT 0');
ensureColumn('users', 'last_active_date', 'TEXT DEFAULT NULL');
ensureColumn('users', 'family_id', 'INTEGER DEFAULT NULL');
ensureColumn('users', 'family_role', "TEXT DEFAULT 'owner'");
ensureColumn('users', 'is_active', 'INTEGER DEFAULT 1');
ensureColumn('users', 'last_seen', 'TEXT DEFAULT NULL');

/* ============ Migration de transactions ============ */
ensureColumn('transactions', 'account_id', 'INTEGER DEFAULT NULL');
ensureColumn('transactions', 'member_id', 'INTEGER DEFAULT NULL');
ensureColumn('transactions', 'recurring_id', 'INTEGER DEFAULT NULL');
ensureColumn('transactions', 'currency', "TEXT DEFAULT 'AOA'");
ensureColumn('transactions', 'is_transfer', 'INTEGER DEFAULT 0');
ensureColumn('transactions', 'source', "TEXT DEFAULT 'manual'");
ensureColumn('transactions', 'updated_at', 'TEXT DEFAULT NULL');

/* ============ Migration de budgets ============ */
ensureColumn('budgets', 'month', "TEXT DEFAULT NULL");
ensureColumn('budgets', 'projected', 'REAL DEFAULT 0');
ensureColumn('budgets', 'alert_threshold', 'INTEGER DEFAULT 80');
ensureColumn('budgets', 'updated_at', 'TEXT DEFAULT NULL');

/* ============ Migration de goals ============ */
ensureColumn('goals', 'monthly_contribution', 'REAL DEFAULT 0');
ensureColumn('goals', 'category', 'TEXT DEFAULT NULL');
ensureColumn('goals', 'priority', 'INTEGER DEFAULT 1');
ensureColumn('goals', 'updated_at', 'TEXT DEFAULT NULL');

db.exec(`
  /* ==================== DADOS GLOBAIS / SAAS ==================== */
  CREATE TABLE IF NOT EXISTS countries (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_en TEXT NOT NULL,
    currency_code TEXT NOT NULL,
    date_format TEXT NOT NULL,
    locale TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS currencies (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    decimals INTEGER DEFAULT 2,
    symbol_position TEXT DEFAULT 'before',
    iso_name TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER DEFAULT NULL,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    name TEXT NOT NULL,
    icon TEXT DEFAULT '',
    color TEXT DEFAULT '#6c63ff',
    is_default INTEGER DEFAULT 0,
    UNIQUE(user_id, type, name)
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('checking', 'savings', 'cash', 'investment', 'credit')),
    initial_balance REAL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'AOA',
    institution TEXT DEFAULT '',
    description TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    from_account INTEGER NOT NULL,
    to_account INTEGER NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS recurring_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    frequency TEXT NOT NULL CHECK(frequency IN ('monthly', 'weekly', 'yearly', 'daily')),
    due_day INTEGER DEFAULT 1,
    account_id INTEGER DEFAULT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    start_date TEXT NOT NULL,
    end_date TEXT DEFAULT NULL,
    active INTEGER DEFAULT 1,
    last_generated TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS debts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    creditor TEXT NOT NULL,
    original_amount REAL NOT NULL,
    paid_amount REAL DEFAULT 0,
    interest_rate REAL DEFAULT 0,
    due_date TEXT NOT NULL,
    installments INTEGER DEFAULT 0,
    installment_amount REAL DEFAULT 0,
    frequency TEXT DEFAULT 'monthly',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    person TEXT NOT NULL,
    amount REAL NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('lent', 'borrowed')),
    date TEXT NOT NULL,
    term TEXT DEFAULT 'short',
    status TEXT DEFAULT 'pending',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT DEFAULT 'info',
    title TEXT NOT NULL,
    message TEXT DEFAULT '',
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS financial_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    score REAL NOT NULL,
    factors TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE(user_id, month)
  );

  CREATE TABLE IF NOT EXISTS families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS family_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    user_id INTEGER DEFAULT NULL,
    email TEXT DEFAULT NULL,
    role TEXT DEFAULT 'member',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS subscription_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    price_monthly REAL DEFAULT 0,
    price_annual REAL DEFAULT 0,
    period TEXT DEFAULT 'month',
    trial_days INTEGER DEFAULT 0,
    features TEXT DEFAULT '{}',
    is_active INTEGER DEFAULT 1,
    sort INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_code TEXT NOT NULL,
    status TEXT DEFAULT 'trial',
    trial_start TEXT DEFAULT NULL,
    trial_end TEXT DEFAULT NULL,
    current_period_start TEXT DEFAULT NULL,
    current_period_end TEXT DEFAULT NULL,
    next_billing_date TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS referral_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_id INTEGER NOT NULL,
    referred_email TEXT DEFAULT '',
    referred_name TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    reward_days INTEGER DEFAULT 30,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    target REAL NOT NULL,
    metric TEXT NOT NULL,
    reward INTEGER DEFAULT 100,
    reward_type TEXT DEFAULT 'points',
    icon TEXT DEFAULT '🏆',
    is_active INTEGER DEFAULT 1,
    sort INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS user_challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    challenge_id INTEGER NOT NULL,
    progress REAL DEFAULT 0,
    completed INTEGER DEFAULT 0,
    completed_at TEXT DEFAULT NULL,
    UNIQUE(user_id, challenge_id)
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '⭐',
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS user_achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    achievement_id INTEGER NOT NULL,
    unlocked_at TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE(user_id, achievement_id)
  );

  CREATE TABLE IF NOT EXISTS exchange_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    base_currency TEXT NOT NULL,
    target_currency TEXT NOT NULL,
    rate REAL NOT NULL,
    source TEXT DEFAULT 'static',
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE(base_currency, target_currency)
  );

  CREATE TABLE IF NOT EXISTS ai_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS imported_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    rows_imported INTEGER DEFAULT 0,
    total_rows INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    sid TEXT NOT NULL,
    ua TEXT DEFAULT '',
    ip TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    last_seen TEXT DEFAULT (datetime('now', 'localtime')),
    current INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
  CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);
  CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
  CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);
  CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
  CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);
  CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
`);

/* ==================== SEED ==================== */
const seedCountries = db.prepare('INSERT OR IGNORE INTO countries (code, name, name_en, currency_code, date_format, locale) VALUES (?,?,?,?,?,?)');
[
  ['AO', 'Angola', 'Angola', 'AOA', 'dd/mm/yyyy', 'pt-AO'],
  ['PT', 'Portugal', 'Portugal', 'EUR', 'dd/mm/yyyy', 'pt-PT'],
  ['BR', 'Brasil', 'Brazil', 'BRL', 'dd/mm/yyyy', 'pt-BR'],
  ['MZ', 'Moçambique', 'Mozambique', 'MZN', 'dd/mm/yyyy', 'pt-MZ'],
  ['CV', 'Cabo Verde', 'Cape Verde', 'CVE', 'dd/mm/yyyy', 'pt-CV'],
  ['GW', 'Guiné-Bissau', 'Guinea-Bissau', 'XOF', 'dd/mm/yyyy', 'pt-GW'],
  ['ST', 'São Tomé e Príncipe', 'Sao Tome and Principe', 'STN', 'dd/mm/yyyy', 'pt-ST'],
  ['US', 'Estados Unidos', 'United States', 'USD', 'mm/dd/yyyy', 'en-US'],
  ['GB', 'Reino Unido', 'United Kingdom', 'GBP', 'dd/mm/yyyy', 'en-GB'],
  ['CA', 'Canadá', 'Canada', 'CAD', 'dd/mm/yyyy', 'en-CA'],
  ['FR', 'França', 'France', 'EUR', 'dd/mm/yyyy', 'fr-FR'],
  ['ES', 'Espanha', 'Spain', 'EUR', 'dd/mm/yyyy', 'es-ES'],
  ['DE', 'Alemanha', 'Germany', 'EUR', 'dd/mm/yyyy', 'de-DE'],
  ['IT', 'Itália', 'Italy', 'EUR', 'dd/mm/yyyy', 'it-IT'],
  ['NL', 'Holanda', 'Netherlands', 'EUR', 'dd/mm/yyyy', 'nl-NL'],
  ['CH', 'Suíça', 'Switzerland', 'CHF', 'dd/mm/yyyy', 'de-CH'],
  ['IE', 'Irlanda', 'Ireland', 'EUR', 'dd/mm/yyyy', 'en-IE'],
  ['BE', 'Bélgica', 'Belgium', 'EUR', 'dd/mm/yyyy', 'nl-BE'],
  ['LU', 'Luxemburgo', 'Luxembourg', 'EUR', 'dd/mm/yyyy', 'lb-LU'],
  ['ZA', 'África do Sul', 'South Africa', 'ZAR', 'dd/mm/yyyy', 'en-ZA'],
  ['KE', 'Quénia', 'Kenya', 'KES', 'dd/mm/yyyy', 'en-KE'],
  ['NG', 'Nigéria', 'Nigeria', 'NGN', 'dd/mm/yyyy', 'en-NG'],
  ['GH', 'Gana', 'Ghana', 'GHS', 'dd/mm/yyyy', 'en-GH'],
  ['CM', 'Camarões', 'Cameroon', 'XAF', 'dd/mm/yyyy', 'fr-CM'],
  ['CN', 'China', 'China', 'CNY', 'yyyy/mm/dd', 'zh-CN'],
  ['JP', 'Japão', 'Japan', 'JPY', 'yyyy/mm/dd', 'ja-JP'],
  ['IN', 'Índia', 'India', 'INR', 'dd/mm/yyyy', 'hi-IN'],
  ['AU', 'Austrália', 'Australia', 'AUD', 'dd/mm/yyyy', 'en-AU'],
  ['AE', 'Emirados Árabes', 'United Arab Emirates', 'AED', 'dd/mm/yyyy', 'ar-AE'],
  ['AR', 'Argentina', 'Argentina', 'ARS', 'dd/mm/yyyy', 'es-AR'],
  ['MX', 'México', 'Mexico', 'MXN', 'dd/mm/yyyy', 'es-MX'],
  ['CL', 'Chile', 'Chile', 'CLP', 'dd/mm/yyyy', 'es-CL'],
  ['CO', 'Colômbia', 'Colombia', 'COP', 'dd/mm/yyyy', 'es-CO'],
  ['PE', 'Peru', 'Peru', 'PEN', 'dd/mm/yyyy', 'es-PE'],
  ['VZ', 'Venezuela', 'Venezuela', 'VES', 'dd/mm/yyyy', 'es-VE'],
  ['UY', 'Uruguai', 'Uruguay', 'UYU', 'dd/mm/yyyy', 'es-UY'],
  ['PY', 'Paraguai', 'Paraguay', 'PYG', 'dd/mm/yyyy', 'es-PY'],
  ['BO', 'Bolívia', 'Bolivia', 'BOB', 'dd/mm/yyyy', 'es-BO'],
  ['EC', 'Equador', 'Ecuador', 'USD', 'dd/mm/yyyy', 'es-EC'],
  ['DO', 'Rep. Dominicana', 'Dominican Republic', 'DOP', 'dd/mm/yyyy', 'es-DO']
].forEach(r => seedCountries.run(...r));

const seedCurrencies = db.prepare('INSERT OR IGNORE INTO currencies (code, name, symbol, decimals, symbol_position, iso_name) VALUES (?,?,?,?,?,?)');
[
  ['AOA', 'Kwanza', 'Kz', 2, 'after', 'AOA'],
  ['EUR', 'Euro', '€', 2, 'before', 'EUR'],
  ['BRL', 'Real', 'R$', 2, 'before', 'BRL'],
  ['MZN', 'Metical', 'MT', 2, 'after', 'MZN'],
  ['CVE', 'Escudo', 'CVE', 2, 'after', 'CVE'],
  ['XOF', 'Franco CFA', 'F.CFA', 0, 'after', 'XOF'],
  ['XAF', 'Franco CFA', 'F.CFA', 0, 'after', 'XAF'],
  ['STN', 'Dobra', 'Db', 2, 'after', 'STN'],
  ['USD', 'Dólar', '$', 2, 'before', 'USD'],
  ['GBP', 'Libra', '£', 2, 'before', 'GBP'],
  ['CAD', 'Dólar canadiano', 'C$', 2, 'before', 'CAD'],
  ['CHF', 'Franco suíço', 'CHF', 2, 'before', 'CHF'],
  ['ZAR', 'Rand', 'R', 2, 'before', 'ZAR'],
  ['KES', 'Xelim', 'KSh', 2, 'before', 'KES'],
  ['NGN', 'Naira', '₦', 2, 'before', 'NGN'],
  ['GHS', 'Cedi', 'GH₵', 2, 'before', 'GHS'],
  ['CNY', 'Yuan', '¥', 2, 'before', 'CNY'],
  ['JPY', 'Iene', '¥', 0, 'before', 'JPY'],
  ['INR', 'Rupia', '₹', 2, 'before', 'INR'],
  ['AUD', 'Dólar australiano', 'A$', 2, 'before', 'AUD'],
  ['AED', 'Dirham', 'د.إ', 2, 'before', 'AED'],
  ['ARS', 'Peso', '$', 2, 'before', 'ARS'],
  ['MXN', 'Peso', '$', 2, 'before', 'MXN'],
  ['CLP', 'Peso', '$', 0, 'before', 'CLP'],
  ['COP', 'Peso', '$', 2, 'before', 'COP'],
  ['PEN', 'Sol', 'S/', 2, 'before', 'PEN'],
  ['VES', 'Bolívar', 'Bs', 2, 'before', 'VES'],
  ['UYU', 'Peso', '$', 2, 'before', 'UYU'],
  ['PYG', 'Guarani', '₲', 0, 'after', 'PYG'],
  ['BOB', 'Boliviano', 'Bs', 2, 'before', 'BOB'],
  ['DOP', 'Peso', 'RD$', 2, 'before', 'DOP']
].forEach(r => seedCurrencies.run(...r));

const seedCategories = db.prepare('INSERT OR IGNORE INTO categories (user_id, type, name, icon, color, is_default) VALUES (NULL,?,?,?,?,1)');
[
  ['expense', 'Alimentação', '🍔', '#f97316'],
  ['expense', 'Transporte', '🚗', '#38bdf8'],
  ['expense', 'Moradia', '🏠', '#8b5cf6'],
  ['expense', 'Utilidades', '💡', '#fbbf24'],
  ['expense', 'Saúde', '🏥', '#f43f5e'],
  ['expense', 'Educação', '📚', '#10b981'],
  ['expense', 'Lazer', '🎮', '#ec4899'],
  ['expense', 'Compras', '🛒', '#eab308'],
  ['expense', 'Roupa', '👕', '#14b8a6'],
  ['expense', 'Assinaturas', '📺', '#6366f1'],
  ['expense', 'Outros', '📦', '#94a3b8'],
  ['income', 'Salário', '💼', '#10d9a0'],
  ['income', 'Negócio', '🏢', '#38bdf8'],
  ['income', 'Freelance', '💻', '#8b5cf6'],
  ['income', 'Investimentos', '📈', '#10b981'],
['income', 'Presentes', '🎁', '#ec4899'],
  ['income', 'Outros', '🏷️', '#94a3b8']
].forEach(r => seedCategories.run(...r));
db.prepare(`DELETE FROM categories WHERE user_id IS NULL AND id NOT IN (SELECT MIN(id) FROM categories WHERE user_id IS NULL GROUP BY type, name)`).run();
db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_default ON categories(type, name) WHERE user_id IS NULL`).run();

const seedPlans = db.prepare('INSERT OR IGNORE INTO subscription_plans (code, name, price_monthly, price_annual, period, trial_days, features, is_active, sort) VALUES (?,?,?,?,?,?,?,?,?)');
const plans = [
  { code: 'free', name: 'Grátis', price_monthly: 0, price_annual: 0, trial_days: 0, features: {
    accounts: 2, categories: 20, transactions_month: 100, budgets: 3, goals: 2, recurring: 3, family: 0, reports: 1, ai: 0, import: 0, export_csv: 1, export_excel: 0, reminders: 0, challenges: 0, score: 0, multiple_currencies: 0, debt_tracking: 0
  }, active: 1, sort: 1 },
  { code: 'pro', name: 'Pro', price_monthly: 4.99, price_annual: 49.9, trial_days: 7, features: {
    accounts: 50, categories: 1000, transactions_month: 100000, budgets: 100, goals: 100, recurring: 100, family: 0, reports: 1, ai: 1, import: 1, export_csv: 1, export_excel: 1, reminders: 1, challenges: 1, score: 1, multiple_currencies: 1, debt_tracking: 1
  }, active: 1, sort: 2 },
  { code: 'family', name: 'Família', price_monthly: 9.99, price_annual: 99.9, trial_days: 7, features: {
    accounts: 50, categories: 1000, transactions_month: 100000, budgets: 100, goals: 100, recurring: 100, family: 1, reports: 1, ai: 1, import: 1, export_csv: 1, export_excel: 1, reminders: 1, challenges: 1, score: 1, multiple_currencies: 1, debt_tracking: 1, up_to_members: 6
  }, active: 1, sort: 3 }
];
plans.forEach(p => seedPlans.run(p.code, p.name, p.price_monthly, p.price_annual, p.period, p.trial_days, JSON.stringify(p.features), p.active, p.sort));

const seedChallenges = db.prepare('INSERT OR IGNORE INTO challenges (code, name, description, target, metric, reward, reward_type, icon, is_active, sort) VALUES (?,?,?,?,?,?,?,?,?,?)');
[
  ['first_transaction', 'Primeira transação', 'Registre a sua primeira transação', 1, 'transactions', 50, 'points', '✍️', 1, 1],
  ['ten_transactions', 'A dar ritmo', 'Registre 10 transações', 10, 'transactions', 100, 'points', '🚀', 1, 2],
  ['budget_first', 'Planeador', 'Crie o primeiro orçamento mensal', 1, 'budgets', 100, 'points', '📋', 1, 3],
  ['goal_first', 'Visionário', 'Crie a primeira meta financeira', 1, 'goals', 100, 'points', '🎯', 1, 4],
  ['save_streak', 'Poupança consistente', 'Mantenha despesas abaixo do orçamento por 7 dias', 7, 'budget_streak', 200, 'points', '🔥', 1, 5],
  ['income_month', 'Receita mensal', 'Registre receita em 5 meses diferentes', 5, 'income_months', 250, 'points', '💰', 1, 6],
  ['invite_friend', 'Embaixador', 'Convide 3 amigos para o FinanceIQ', 3, 'referrals', 300, 'points', '🤝', 1, 7],
  ['family_connect', 'Família unida', 'Crie uma família e convide 2 membros', 2, 'family_members', 300, 'points', '👨‍👩‍👧', 1, 8],
  ['no_debt', 'Livre de dívidas', 'Pague integralmente uma dívida', 1, 'debt_paid', 200, 'points', '🛡️', 1, 9],
  ['view_reports', 'Analista', 'Consulte relatórios mensais por 3 meses seguidos', 3, 'report_months', 150, 'points', '📊', 1, 10],
  ['import_file', 'Migrador', 'Importe um ficheiro de movimentos', 1, 'imports', 100, 'points', '📥', 1, 11],
  ['ask_ai', 'Curioso', 'Pergunte ao assistente de IA 5 vezes', 5, 'ai_questions', 150, 'points', '🤖', 1, 12],
  ['score_70', 'Mestre financeiro', 'Alcance um score financeiro de 70+', 70, 'score', 400, 'points', '🏆', 1, 13]
].forEach(r => seedChallenges.run(...r));

const seedAchievements = db.prepare('INSERT OR IGNORE INTO achievements (code, name, description, icon, is_active) VALUES (?,?,?,?,1)');
[
  ['welcome', 'Boas-vindas', 'Criou a sua conta FinanceIQ', '👋'],
  ['first_income', 'Primeiro salário', 'Registrou a primeira receita', '💼'],
  ['first_expense', 'Primeiro registo', 'Registrou a primeira despesa', '📝'],
  ['budget_master', 'Mestre do orçamento', 'Criou 5 orçamentos', '📋'],
  ['saver', 'Poupador', 'Alcançou uma meta', '🎯'],
  ['streak_7', 'Racha', '7 dias de registos consecutivos', '🔥'],
  ['early_bird', 'Madrugador', 'Registrou um movimento antes das 8h', '🌅'],
  ['organizer', 'Organizado', 'Criou 3 contas', '🏦'],
  ['planner', 'Planeador', 'Criou uma recorrência mensal', '🔄'],
  ['debt_free', 'Livre', 'Pagou a primeira dívida', '🛡️'],
  ['investor', 'Investidor', 'Criou uma conta de investimentos', '📈'],
  ['helper', 'Prestável', 'Emprestou dinheiro a alguém', '🤝'],
  ['analyst', 'Analista', 'Viu um relatório completo', '📊'],
  ['team', 'Família', 'Juntou-se a uma família', '👨‍👩‍👧'],
  ['pro_user', 'Pro', 'Assinou o plano Pro', '⭐'],
  ['referrer', 'Influenciador', 'Convidou o primeiro amigo', '🤝']
].forEach(r => seedAchievements.run(...r));

const seedRates = db.prepare('INSERT OR IGNORE INTO exchange_rates (base_currency, target_currency, rate, source) VALUES (?,?,?,?)');
[
  ['AOA', 'USD', 0.00112, 'static'],
  ['AOA', 'EUR', 0.00103, 'static'],
  ['AOA', 'BRL', 0.0063, 'static'],
  ['AOA', 'MZN', 0.0715, 'static'],
  ['USD', 'AOA', 893, 'static'],
  ['USD', 'EUR', 0.92, 'static'],
  ['USD', 'BRL', 5.6, 'static'],
  ['USD', 'MZN', 63.8, 'static'],
  ['EUR', 'AOA', 971, 'static'],
  ['EUR', 'USD', 1.087, 'static'],
  ['EUR', 'BRL', 6.09, 'static'],
  ['EUR', 'MZN', 69.3, 'static'],
  ['BRL', 'AOA', 159, 'static'],
  ['BRL', 'USD', 0.1786, 'static'],
  ['BRL', 'EUR', 0.1642, 'static'],
  ['BRL', 'MZN', 11.4, 'static'],
  ['MZN', 'AOA', 14.0, 'static'],
  ['MZN', 'USD', 0.0157, 'static'],
  ['MZN', 'EUR', 0.0144, 'static'],
  ['MZN', 'BRL', 0.0877, 'static']
].forEach(r => seedRates.run(...r));

module.exports = db;
module.exports.ensureColumn = ensureColumn;