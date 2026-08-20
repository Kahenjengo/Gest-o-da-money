'use strict';
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const conn = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!conn) {
  console.error('Defina SUPABASE_DB_URL (ou DATABASE_URL) com a connection string do Supabase.');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('A aplicar schema...');
  await client.query(sql);
  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  const list = tables.rows.map((r) => r.table_name);
  console.log('Tabelas criadas (' + list.length + '): ' + list.join(', '));
  const counts = ['countries', 'currencies', 'categories', 'subscription_plans', 'challenges', 'achievements', 'exchange_rates'];
  for (const t of counts) {
    const c = await client.query(`SELECT COUNT(*) c FROM ${t}`);
    console.log('  ' + t + ': ' + c.rows[0].c + ' linhas');
  }
  await client.end();
}
main().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });