'use strict';
// Aplica o schema (supabase/schema.sql) ao projeto Supabase.
//
// Modos de utilizacao:
//   A) Connection string (password da BD):
//        node supabase/apply-schema.js "postgresql://postgres.REF:PASSWORD@db.REF.supabase.co:5432/postgres"
//        # ou via variavel de ambiente SUPABASE_DB_URL
//   B) Management API (token de gestao sbp_... de supabase.com/dashboard/account/tokens):
//        node supabase/apply-schema.js --mgmt sbp_XXXX
//        node supabase/apply-schema.js --mgmt sbp_XXXX --project dphcltigwtudjkfdcjlm
//
// Pre-requisitos: npm install pg (modo A) — o modo B nao precisa de dependencias.
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, 'schema.sql');
const SQL = fs.readFileSync(SQL_FILE, 'utf8');

const SEED_TABLES = ['countries', 'currencies', 'categories', 'subscription_plans', 'challenges', 'achievements', 'exchange_rates'];

function parseArgs(argv) {
  const a = { conn: null, mgmt: null, project: null };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--mgmt') a.mgmt = argv[++i] || null;
    else if (v === '--project') a.project = argv[++i] || null;
    else if (!v.startsWith('--')) a.conn = a.conn || v;
  }
  return a;
}

function projectRefOf(conn, projectArg) {
  if (projectArg) return projectArg;
  const m = (conn || '').match(/postgres(?:ql)?:\/\/[^:]+(?::[^@]*)?@([^.:]+)\./);
  return m ? m[1] : null;
}

async function applyViaPg(conn) {
  const { Client } = require('pg');
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Ligado via pg. A aplicar schema.sql...');
  await client.query(SQL);
  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  return tables.rows.map((r) => r.table_name);
}

async function applyViaMgmt(token, projectRef) {
  if (!projectRef) throw new Error('Sem project ref. Passe --project ou SUPABASE_URL (ex.: --project dphcltigwtudjkfdcjlm).');
  const base = 'https://api.supabase.com/v1/projects/' + encodeURIComponent(projectRef) + '/database/query';
  console.log('A aplicar schema.sql via Management API (projeto ' + projectRef + ')...');
  const res = await fetch(base, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: SQL }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error('HTTP ' + res.status + ': ' + text.slice(0, 400));
  }
  console.log('Resposta do servidor: ' + (text ? text.slice(0, 200) : 'ok'));
  const tablesRes = await fetch(base, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name" }),
  });
  const rows = await tablesRes.json();
  return (Array.isArray(rows) ? rows : []).map((r) => r.table_name);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const conn = args.conn || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

  let tables;
  if (args.mgmt) {
    tables = await applyViaMgmt(args.mgmt, args.project || process.env.SUPABASE_PROJECT_REF);
  } else if (conn) {
    tables = await applyViaPg(conn);
  } else {
    console.error(
      'Uso:\n' +
      '  A) node supabase/apply-schema.js "postgresql://...:PASSWORD@db.REF.supabase.co:5432/postgres"\n' +
      '  B) node supabase/apply-schema.js --mgmt sbp_XXXX --project dphcltigwtudjkfdcjlm\n' +
      'Ou defina SUPABASE_DB_URL (modo A).'
    );
    process.exit(1);
  }

  console.log('Tabelas existentes (' + tables.length + '): ' + tables.join(', '));
  const missing = [];
  for (const t of SEED_TABLES) if (!tables.includes(t)) missing.push(t);
  if (missing.length) console.log('AVISO: tabelas de seeds em falta: ' + missing.join(', '));
  console.log('OK: schema aplicado.');
}

main().catch((e) => {
  console.error('FALHOU:', e.message);
  process.exit(1);
});