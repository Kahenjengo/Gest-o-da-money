const { Store } = require('express-session');
const Database = require('better-sqlite3');
const path = require('path');

class BetterSQLite3SessionStore extends Store {
  constructor(options = {}) {
    super();
    const dbPath = options.db || path.join(options.dir || '.', 'sessions.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        expired INTEGER NOT NULL,
        sess TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
    `);

    this.ttl = options.ttl || 86400;
    this.cleanupInterval = setInterval(() => this.cleanup(), 15 * 60 * 1000);
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }

  get(sid, callback) {
    try {
      const row = this.db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expired > ?').get(sid, Date.now());
      if (!row) return callback(null, null);
      callback(null, JSON.parse(row.sess));
    } catch (e) {
      callback(e);
    }
  }

  set(sid, sess, callback) {
    try {
      const maxAge = sess.cookie && sess.cookie.maxAge ? sess.cookie.maxAge : this.ttl * 1000;
      const expired = Date.now() + maxAge;
      const data = JSON.stringify(sess);
      this.db.prepare('INSERT OR REPLACE INTO sessions (sid, expired, sess) VALUES (?, ?, ?)').run(sid, expired, data);
      callback(null);
    } catch (e) {
      callback(e);
    }
  }

  destroy(sid, callback) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback(null);
    } catch (e) {
      callback(e);
    }
  }

  touch(sid, sess, callback) {
    if (sess && sess.cookie && sess.cookie.expires) {
      try {
        const expired = new Date(sess.cookie.expires).getTime();
        this.db.prepare('UPDATE sessions SET expired = ? WHERE sid = ? AND expired > ?').run(expired, sid, Date.now());
        return callback(null);
      } catch (e) {
        return callback(e);
      }
    }
    callback(null);
  }

  cleanup() {
    try {
      this.db.prepare('DELETE FROM sessions WHERE expired <= ?').run(Date.now());
    } catch (_) {}
  }

  close() {
    clearInterval(this.cleanupInterval);
    this.db.close();
  }
}

module.exports = BetterSQLite3SessionStore;
