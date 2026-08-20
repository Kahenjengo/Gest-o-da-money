'use strict';
const { parentPort, workerData } = require('worker_threads');
const { Client } = require('pg');

const NUMERIC_OIDS = new Set([21, 23, 20, 700, 701, 1700, 790]);
const dataView = new Uint8Array(workerData.buf);
const flag = new Int32Array(workerData.sab);

let client = null;

function encodeResult(obj) {
  const s = JSON.stringify(obj);
  const bytes = Buffer.byteLength(s, 'utf8');
  if (bytes + 8 > dataView.length) return { ok: false, tooBig: true, size: bytes };
  dataView[0] = bytes & 0xff;
  dataView[1] = (bytes >> 8) & 0xff;
  dataView[2] = (bytes >> 16) & 0xff;
  dataView[3] = (bytes >> 24) & 0xff;
  dataView.set(Buffer.from(s, 'utf8'), 8);
  return { ok: true, size: bytes };
}

function notify(result) {
  encodeResult(result);
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
}

function convertRows(res) {
  const fields = res.fields || [];
  const rows = res.rows || [];
  return rows.map((r) => {
    const o = {};
    for (let i = 0; i < fields.length; i++) {
      let v = r[fields[i].name];
      if (v !== null && v !== undefined && NUMERIC_OIDS.has(fields[i].dataTypeID)) {
        v = Number(v);
      }
      o[fields[i].name] = v;
    }
    return o;
  });
}

async function handle(msg) {
  try {
    if (msg.type === 'run') {
      const res = await client.query(msg.sql, msg.params);
      let lastInsertRowid = 0;
      if (msg.isInsert) {
        try {
          const lv = await client.query('SELECT lastval() AS id');
          lastInsertRowid = Number(lv.rows[0].id) || 0;
        } catch (e) {
          lastInsertRowid = 0;
        }
      }
      return { changes: res.rowCount || 0, lastInsertRowid };
    }
    if (msg.type === 'get' || msg.type === 'all') {
      const res = await client.query(msg.sql, msg.params);
      const rows = convertRows(res);
      if (msg.type === 'get') return rows.length ? rows[0] : null;
      return rows;
    }
    if (msg.type === 'exec') {
      await client.query(msg.sql);
      return { changes: 0 };
    }
    return { error: 'unknown msg ' + msg.type };
  } catch (e) {
    return { error: (e && e.message) || String(e) };
  }
}

parentPort.on('message', (msg) => {
  if (msg.type === 'init') {
    client = new Client({ connectionString: msg.conn, ssl: { rejectUnauthorized: false } });
    client.connect()
      .then(() => notify({ connected: true }))
      .catch((e) => notify({ connected: false, error: (e && e.message) || String(e) }));
    return;
  }
  handle(msg).then((result) => notify(result));
});

process.on('uncaughtException', (e) => notify({ error: (e && e.message) || String(e) }));
process.on('unhandledRejection', (e) => notify({ error: (e && e.message) || String(e) }));