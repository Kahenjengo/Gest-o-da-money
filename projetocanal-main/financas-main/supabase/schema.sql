-- ============================================================
-- FinanceIQ - Schema PostgreSQL (Supabase)
-- Corre no SQL editor do Supabase ou via:
--   node supabase/apply-schema.js
-- Colunas de data guardadas como TEXT (mesma semantica do SQLite).
-- Flags 0/1 como INTEGER para manter a logica existente.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar TEXT DEFAULT '',
  role TEXT DEFAULT 'member',
  plan_code TEXT DEFAULT 'free',
  referral_code TEXT DEFAULT NULL,
  referred_by TEXT DEFAULT NULL,
  country_code TEXT DEFAULT 'AO',
  currency TEXT DEFAULT 'AOA',
  language TEXT DEFAULT 'pt',
  date_format TEXT DEFAULT 'dd/mm/yyyy',
  timezone TEXT DEFAULT 'Africa/Luanda',
  month_start_day INTEGER DEFAULT 1,
  onboarded INTEGER DEFAULT 0,
  onboarding_step INTEGER DEFAULT 0,
  trial_start TEXT DEFAULT NULL,
  trial_end TEXT DEFAULT NULL,
  two_fa_enabled INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  last_active_date TEXT DEFAULT NULL,
  family_id INTEGER DEFAULT NULL,
  family_role TEXT DEFAULT 'owner',
  is_active INTEGER DEFAULT 1,
  last_seen TEXT DEFAULT NULL,
  reset_token TEXT DEFAULT NULL,
  reset_expires TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
  description TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  note TEXT DEFAULT '',
  account_id BIGINT DEFAULT NULL,
  member_id BIGINT DEFAULT NULL,
  recurring_id BIGINT DEFAULT NULL,
  currency TEXT DEFAULT 'AOA',
  is_transfer INTEGER DEFAULT 0,
  source TEXT DEFAULT 'manual',
  updated_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS budgets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  "limit" DOUBLE PRECISION NOT NULL,
  month TEXT DEFAULT NULL,
  projected DOUBLE PRECISION DEFAULT 0,
  alert_threshold INTEGER DEFAULT 80,
  updated_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE(user_id, category)
);

CREATE TABLE IF NOT EXISTS goals (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '🏆',
  target DOUBLE PRECISION NOT NULL,
  current DOUBLE PRECISION DEFAULT 0,
  deadline TEXT,
  monthly_contribution DOUBLE PRECISION DEFAULT 0,
  category TEXT DEFAULT NULL,
  priority INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS members (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relation TEXT NOT NULL,
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS scenario_models (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  result_formula TEXT NOT NULL,
  result_label TEXT DEFAULT 'Resultado',
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS scenario_variables (
  id BIGSERIAL PRIMARY KEY,
  model_id BIGINT NOT NULL REFERENCES scenario_models(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT DEFAULT '',
  unit TEXT DEFAULT '',
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scenarios (
  id BIGSERIAL PRIMARY KEY,
  model_id BIGINT NOT NULL REFERENCES scenario_models(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "values" TEXT NOT NULL,
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE(model_id, name)
);

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
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT DEFAULT NULL,
  type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
  name TEXT NOT NULL,
  icon TEXT DEFAULT '',
  color TEXT DEFAULT '#6c63ff',
  is_default INTEGER DEFAULT 0,
  UNIQUE(user_id, type, name)
);

CREATE TABLE IF NOT EXISTS accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('checking', 'savings', 'cash', 'investment', 'credit')),
  initial_balance DOUBLE PRECISION DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'AOA',
  institution TEXT DEFAULT '',
  description TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS transfers (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_account BIGINT NOT NULL,
  to_account BIGINT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  date TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
  description TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  frequency TEXT NOT NULL CHECK(frequency IN ('monthly', 'weekly', 'yearly', 'daily')),
  due_day INTEGER DEFAULT 1,
  account_id BIGINT DEFAULT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  start_date TEXT NOT NULL,
  end_date TEXT DEFAULT NULL,
  active INTEGER DEFAULT 1,
  last_generated TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS debts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creditor TEXT NOT NULL,
  original_amount DOUBLE PRECISION NOT NULL,
  paid_amount DOUBLE PRECISION DEFAULT 0,
  interest_rate DOUBLE PRECISION DEFAULT 0,
  due_date TEXT NOT NULL,
  installments INTEGER DEFAULT 0,
  installment_amount DOUBLE PRECISION DEFAULT 0,
  frequency TEXT DEFAULT 'monthly',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS loans (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('lent', 'borrowed')),
  date TEXT NOT NULL,
  term TEXT DEFAULT 'short',
  status TEXT DEFAULT 'pending',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT DEFAULT '',
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS financial_scores (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  month TEXT NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  factors TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE(user_id, month)
);

CREATE TABLE IF NOT EXISTS families (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS family_members (
  id BIGSERIAL PRIMARY KEY,
  family_id BIGINT NOT NULL,
  user_id BIGINT DEFAULT NULL,
  email TEXT DEFAULT NULL,
  role TEXT DEFAULT 'member',
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_monthly DOUBLE PRECISION DEFAULT 0,
  price_annual DOUBLE PRECISION DEFAULT 0,
  period TEXT DEFAULT 'month',
  trial_days INTEGER DEFAULT 0,
  features TEXT DEFAULT '{}',
  is_active INTEGER DEFAULT 1,
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL,
  status TEXT DEFAULT 'trial',
  trial_start TEXT DEFAULT NULL,
  trial_end TEXT DEFAULT NULL,
  current_period_start TEXT DEFAULT NULL,
  current_period_end TEXT DEFAULT NULL,
  next_billing_date TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS referrals (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id BIGSERIAL PRIMARY KEY,
  referrer_id BIGINT NOT NULL,
  referred_email TEXT DEFAULT '',
  referred_name TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  reward_days INTEGER DEFAULT 30,
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS challenges (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  target DOUBLE PRECISION NOT NULL,
  metric TEXT NOT NULL,
  reward INTEGER DEFAULT 100,
  reward_type TEXT DEFAULT 'points',
  icon TEXT DEFAULT '🏆',
  is_active INTEGER DEFAULT 1,
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_challenges (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  challenge_id BIGINT NOT NULL,
  progress DOUBLE PRECISION DEFAULT 0,
  completed INTEGER DEFAULT 0,
  completed_at TEXT DEFAULT NULL,
  UNIQUE(user_id, challenge_id)
);

CREATE TABLE IF NOT EXISTS achievements (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT '⭐',
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  achievement_id BIGINT NOT NULL,
  unlocked_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE(user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS exchange_rates (
  id BIGSERIAL PRIMARY KEY,
  base_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL,
  rate DOUBLE PRECISION NOT NULL,
  source TEXT DEFAULT 'static',
  updated_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE(base_currency, target_currency)
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS imported_files (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  file_name TEXT NOT NULL,
  rows_imported INTEGER DEFAULT 0,
  total_rows INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  sid TEXT NOT NULL,
  ua TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  created_at TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS')),
  last_seen TEXT DEFAULT (to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS')),
  current INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  expired BIGINT NOT NULL,
  sess TEXT NOT NULL
);

-- Índices
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
CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_default ON categories(type, name) WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_scenario_models_user ON scenario_models(user_id);
CREATE INDEX IF NOT EXISTS idx_scenario_vars_model ON scenario_variables(model_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_model ON scenarios(model_id);