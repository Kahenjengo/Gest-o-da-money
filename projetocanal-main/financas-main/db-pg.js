'use strict';
const { Worker } = require('worker_threads');
const path = require('path');

function translateSql(sql) {
  let s = String(sql);

  s = s.replace(/datetime\('now'\s*,\s*'localtime'\)/gi, "to_char(localtimestamp,'YYYY-MM-DD HH24:MI:SS')");
  s = s.replace(/datetime\('now'\)/gi, "to_char(now(),'YYYY-MM-DD HH24:MI:SS')");
  s = s.replace(/date\('now'\s*,\s*'localtime'\)/gi, "to_char(localtimestamp,'YYYY-MM-DD')");
  s = s.replace(/date\('now'\)/gi, 'CURRENT_DATE');
  s = s.replace(/\bdate\(([A-Za-z_][A-Za-z0-9_.]*)\)/gi, 'substr($1,1,10)');
  s = s.replace(/\bIFNULL\(/gi, 'COALESCE(');
  s = s.replace(/\bLIKE\b/gi, 'ILIKE');

  const ins = /^\s*INSERT\s+OR\s+(IGNORE|REPLACE)\s+INTO/gi.exec(s);
  if (ins) {
    s = s.replace(/^\s*INSERT\s+OR\s+(IGNORE|REPLACE)\s+INTO/gi, 'INSERT INTO');
    if (!/\bON\s+CONFLICT\b/i.test(s)) s += ' ON CONFLICT DO NOTHING';
  }

  let out = '';
  let n = 0;
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (c === "'") {
        if (s[i + 1] === "'") { out += "'"; i++; }
        else inStr = false;
      }
      continue;
    }
    if (c === "'") { inStr = true; out += c; continue; }
    if (c === '?') { n++; out += '$' + n; continue; }
    out += c;
  }
  return { sql: out, placeholders: n };
}

class PGStatement {
  constructor(owner, sql) {
    this.owner = owner;
    this.original = sql;
    const t = translateSql(sql);
    this.sql = t.sql;
    this.placeholders = t.placeholders;
    this.isInsert = /^\s*INSERT/i.test(sql);
  }
  _exec(type, params) {
    const p = (params && params.length ? params : []).slice(0, this.placeholders);
    const req = { type, sql: this.sql, params: p, isInsert: this.isInsert };
    return this.owner._request(req);
  }
  get(...params) { return this._exec('get', params); }
  all(...params) { return this._exec('all', params); }
  run(...params) { return this._exec('run', params); }
  pluck() {
    const stmt = this;
    return {
      get(...params) { const r = stmt._exec('get', params); if (!r) return undefined; const k = Object.keys(r)[0]; return r[k]; },
      all(...params) { return stmt._exec('all', params).map((r) => { const k = Object.keys(r)[0]; return r[k]; }); },
    };
  }
}

class PGDatabase {
  constructor(connectionString, options = {}) {
    this.conn = connectionString;
    this.bufSize = (parseInt(process.env.SUPABASE_RESULT_BUF_MB, 10) || 32) * 1024 * 1024;
    this.sab = new SharedArrayBuffer(4);
    this.flag = new Int32Array(this.sab);
    this.dataBuf = new SharedArrayBuffer(this.bufSize);
    this.buf = new Uint8Array(this.dataBuf);
    this._nextId = 0;
    this._pending = new Map();
    this.label = this._label(connectionString);
    this.worker = new Worker(path.join(__dirname, 'db-pg-worker.js'), {
      workerData: { sab: this.sab, buf: this.dataBuf, bufSize: this.bufSize },
    });
    this.worker.on('message', (msg) => { /* resultados vão via SharedArrayBuffer */ });
    this.worker.on('error', (e) => { this._lastError = (e && e.message) || String(e); });
    this._init();
  }

  _label(conn) {
    try {
      const at = conn.lastIndexOf('@');
      if (at >= 0) {
        const rest = conn.slice(at + 1).split(/[/:]/)[0];
        return 'supabase:' + rest;
      }
      return 'supabase:' + conn.slice(0, 24);
    } catch (e) { return 'supabase'; }
  }

  _init() {
    this.worker.postMessage({ type: 'init', conn: this.conn });
    const res = this._wait();
    if (res && res.error) throw new Error('Supabase: falha ao ligar: ' + res.error);
    if (!res || !res.connected) throw new Error('Supabase: ligação não confirmada (' + JSON.stringify(res) + ')');
  }

  _readResult() {
    const b0 = this.buf[0] + (this.buf[1] << 8) + (this.buf[2] << 16) + (this.buf[3] << 24);
    if (b0 <= 0) return null;
    const bytes = Buffer.from(this.buf.buffer, 8, b0);
    const text = bytes.toString('utf8');
    this.buf.fill(0, 0, 8);
    return JSON.parse(text);
  }

  _wait() {
    const timeout = parseInt(process.env.SUPABASE_QUERY_TIMEOUT_MS, 10) || 30000;
    const t0 = Date.now();
    while (Atomics.load(this.flag, 0) === 0) {
      Atomics.wait(this.flag, 0, 0, 200);
      if (Date.now() - t0 > timeout) {
        throw new Error('Supabase: timeout na query');
      }
    }
    Atomics.store(this.flag, 0, 0);
    const r = this._readResult();
    if (r && r.error) throw new Error('Supabase: ' + r.error);
    return r;
  }

  _request(req) {
    this.worker.postMessage(req);
    return this._wait();
  }

  prepare(sql) { return new PGStatement(this, sql); }

  exec(sql) {
    const res = this._request({ type: 'exec', sql: String(sql) });
    return res;
  }

  pragma() { return undefined; }

  close() {
    try { this.worker.postMessage({ type: 'close' }); } catch (e) {}
    try { this.worker.terminate(); } catch (e) {}
  }

  get lastError() { return this._lastError || null; }
}

module.exports = PGDatabase;
module.exports.translateSql = translateSql;