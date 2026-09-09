/* eslint-disable no-console */
import type { DatabaseAdapter } from './db-adapter';

export class SQLiteAdapter implements DatabaseAdapter {
  private db: any;
  private dbPath: string;
  private convertedSql = new Map<string, string>();
  private statements = new Map<string, any>();

  constructor() {
    this.dbPath = process.env.SQLITE_PATH || './data/sanhub.db';

    const fs = require('fs');
    const path = require('path');
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const Database = require('better-sqlite3');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -8000');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('busy_timeout = 5000');
  }

  private convertParams(params?: unknown[]): unknown[] {
    if (!params) return [];
    return params.map(p => {
      if (p === undefined) return null;
      if (p === true) return 1;
      if (p === false) return 0;
      if (typeof p === 'object' && p !== null) return JSON.stringify(p);
      return p;
    });
  }

  async execute(sql: string, params?: unknown[]): Promise<[unknown[], unknown]> {
    let converted = this.convertedSql.get(sql);
    if (converted === undefined) {
      converted = this.convertSQLToSQLite(sql);
      this.convertedSql.set(sql, converted);
    }

    const trimmed = converted.trim();
    if (!trimmed) {
      return [[], {}];
    }

    const safeParams = this.convertParams(params);
    const kind = trimmed.slice(0, 6).toUpperCase();
    let stmt = this.statements.get(trimmed);
    if (!stmt) {
      stmt = this.db.prepare(trimmed);
      this.statements.set(trimmed, stmt);
    }

    try {
      if (kind === 'SELECT' || kind.startsWith('SHOW')) {
        const rows = safeParams.length ? stmt.all(...safeParams) : stmt.all();
        return [rows, {}];
      } else {
        const result = safeParams.length ? stmt.run(...safeParams) : stmt.run();
        return [[], { affectedRows: result.changes, insertId: result.lastInsertRowid }];
      }
    } catch (error) {
      console.error('[SQLite] SQL execution error:', error);
      console.error('[SQLite] SQL:', sql);
      console.error('[SQLite] Params:', safeParams);
      throw error;
    }
  }

  private convertSQLToSQLite(sql: string): string {
    sql = sql.replace(/BIGINT/gi, 'INTEGER');
    sql = sql.replace(/VARCHAR\(\d+\)/gi, 'TEXT');
    sql = sql.replace(/LONGTEXT/gi, 'TEXT');
    sql = sql.replace(/\bJSON\b/gi, 'TEXT');
    sql = sql.replace(/ENUM\([^)]+\)/gi, 'TEXT');
    sql = sql.replace(/BOOLEAN/gi, 'INTEGER');
    sql = sql.replace(/AUTO_INCREMENT/gi, 'AUTOINCREMENT');
    sql = sql.replace(/,\s*INDEX\s+\w+\s*\([^)]+\)/gi, '');
    sql = sql.replace(/,\s*FOREIGN\s+KEY\s*\([^)]+\)\s*REFERENCES\s+\w+\s*\([^)]+\)(\s+ON\s+DELETE\s+CASCADE)?(\s+ON\s+UPDATE\s+CASCADE)?/gi, '');
    sql = sql.replace(/\s+ON\s+DELETE\s+CASCADE/gi, '');
    sql = sql.replace(/\s+ON\s+UPDATE\s+CASCADE/gi, '');
    sql = sql.replace(/,\s*\)/g, ')');
    sql = sql.replace(/,\s*,/g, ',');

    sql = sql.replace(
      /JSON_UNQUOTE\s*\(\s*JSON_EXTRACT\s*\(([^)]+)\)\s*\)/gi,
      'json_extract($1)'
    );
    sql = sql.replace(/JSON_EXTRACT\s*\(/gi, 'json_extract(');
    sql = sql.replace(/JSON_SET\s*\(/gi, 'json_set(');
    sql = sql.replace(/LEFT\s*\(\s*([^,]+),\s*(\d+)\s*\)/gi, 'substr($1, 1, $2)');

    return sql;
  }

  async close(): Promise<void> {
    this.statements.clear();
    this.convertedSql.clear();
    this.db.close();
  }
}
