/* eslint-disable no-console */
// 数据库适配器接口
export interface DatabaseAdapter {
  execute(sql: string, params?: unknown[]): Promise<[unknown[], unknown]>;
  close(): Promise<void>;
}

function parseIntegerEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'required', 'require'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off', 'disable', 'disabled'].includes(normalized)) {
    return false;
  }
  return undefined;
}

function readTlsValue(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (trimmed.includes('BEGIN ')) {
    return trimmed.replace(/\\n/g, '\n');
  }

  const fs = require('fs');
  if (fs.existsSync(trimmed)) {
    return fs.readFileSync(trimmed, 'utf8');
  }

  return trimmed.replace(/\\n/g, '\n');
}

function buildMySqlSslConfig(): Record<string, unknown> | undefined {
  const sslToggle = parseBooleanEnv(process.env.MYSQL_SSL || process.env.DB_SSL);
  const ca = readTlsValue(process.env.MYSQL_SSL_CA || process.env.DB_SSL_CA);
  const cert = readTlsValue(process.env.MYSQL_SSL_CERT || process.env.DB_SSL_CERT);
  const key = readTlsValue(process.env.MYSQL_SSL_KEY || process.env.DB_SSL_KEY);

  if (sslToggle === false) {
    return undefined;
  }

  if (sslToggle !== true && !ca && !cert && !key) {
    return undefined;
  }

  const rejectUnauthorized =
    parseBooleanEnv(
      process.env.MYSQL_SSL_REJECT_UNAUTHORIZED ||
        process.env.DB_SSL_REJECT_UNAUTHORIZED
    ) !== false;

  const ssl: Record<string, unknown> = {
    rejectUnauthorized,
  };

  if (ca) ssl.ca = ca;
  if (cert) ssl.cert = cert;
  if (key) ssl.key = key;

  return ssl;
}

function buildMySqlError(error: any): Error {
  const rawMessage =
    error instanceof Error ? error.message : typeof error?.message === 'string' ? error.message : String(error || 'Unknown MySQL error');

  if (rawMessage.includes("Plugin 'mysql_native_password' is not loaded")) {
    return new Error(
      'MySQL 8.4 默认不再加载 mysql_native_password，请将数据库账号切换为 caching_sha2_password，或在服务端显式启用旧插件。'
    );
  }

  if (
    rawMessage.includes('caching_sha2_password') ||
    rawMessage.includes('ER_NOT_SUPPORTED_AUTH_MODE') ||
    rawMessage.includes('AUTH_SWITCH_PLUGIN_ERROR')
  ) {
    return new Error(
      'MySQL 认证失败。对于 MySQL 8.x，建议使用 caching_sha2_password，并在无 SSL 场景下开启 MYSQL_ALLOW_PUBLIC_KEY_RETRIEVAL=true。'
    );
  }

  return error instanceof Error ? error : new Error(rawMessage);
}

// MySQL 适配器
export class MySQLAdapter implements DatabaseAdapter {
  private pool: any;

  constructor() {
    const mysql = require('mysql2/promise');
    const mysqlPoolSize = parseIntegerEnv(process.env.MYSQL_POOL_SIZE, 20);
    const mysqlDatabase =
      process.env.MYSQL_DATABASE ||
      process.env.DB_NAME ||
      process.env.MYSQL_DB ||
      'sanhub';
    const host = process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost';
    const port = parseIntegerEnv(process.env.MYSQL_PORT || process.env.DB_PORT, 3306);
    const user = process.env.MYSQL_USER || process.env.DB_USER || 'root';
    const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '';
    const ssl = buildMySqlSslConfig();

    this.pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database: mysqlDatabase,
      waitForConnections: true,
      connectionLimit: mysqlPoolSize,
      queueLimit: 0, // 0 = unlimited queue, prevents connection errors under load
      enableKeepAlive: true,
      keepAliveInitialDelay: 30000,
      // Performance optimizations
      namedPlaceholders: false,
      decimalNumbers: true,
      supportBigNumbers: true,
      bigNumberStrings: false,
      dateStrings: false,
      allowPublicKeyRetrieval:
        parseBooleanEnv(
          process.env.MYSQL_ALLOW_PUBLIC_KEY_RETRIEVAL ||
            process.env.DB_ALLOW_PUBLIC_KEY_RETRIEVAL
        ) !== false,
      charset: process.env.MYSQL_CHARSET || 'utf8mb4',
      timezone: process.env.MYSQL_TIMEZONE || 'Z',
      // Connection timeout settings
      connectTimeout: parseIntegerEnv(process.env.MYSQL_CONNECT_TIMEOUT, 10000),
      // Idle connection handling
      idleTimeout: parseIntegerEnv(process.env.MYSQL_IDLE_TIMEOUT, 60000),
      maxIdle: mysqlPoolSize,
      ...(ssl ? { ssl } : {}),
    });

    // Log pool status on creation
    console.log(
      `[MySQL] Pool created: host=${host}, port=${port}, user=${user}, database=${mysqlDatabase}, ssl=${ssl ? 'on' : 'off'}, connectionLimit=${mysqlPoolSize}`
    );
  }

  async execute(sql: string, params?: unknown[]): Promise<[unknown[], unknown]> {
    try {
      return await this.pool.execute(sql, params);
    } catch (error) {
      throw buildMySqlError(error);
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // Expose pool stats for monitoring
  getPoolStats(): { total: number; idle: number; waiting: number } {
    const pool = this.pool.pool;
    return {
      total: pool?._allConnections?.length || 0,
      idle: pool?._freeConnections?.length || 0,
      waiting: pool?._connectionQueue?.length || 0,
    };
  }
}

// SQLite 适配器 (使用 better-sqlite3)
export class SQLiteAdapter implements DatabaseAdapter {
  private db: any;
  private dbPath: string;

  constructor() {
    this.dbPath = process.env.SQLITE_PATH || './data/sanhub.db';
    
    // 确保目录存在
    const fs = require('fs');
    const path = require('path');
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // 初始化数据库连接
    const Database = require('better-sqlite3');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  // 转换参数为 SQLite 支持的类型
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
    // 转换 MySQL 语法到 SQLite
    sql = this.convertSQLToSQLite(sql);

    // 跳过空语句
    if (!sql.trim()) {
      return [[], {}];
    }

    // 转换参数
    const safeParams = this.convertParams(params);

    try {
      if (sql.trim().toUpperCase().startsWith('SELECT') || 
          sql.trim().toUpperCase().startsWith('SHOW')) {
        const stmt = this.db.prepare(sql);
        const rows = safeParams.length ? stmt.all(...safeParams) : stmt.all();
        return [rows, {}];
      } else {
        const stmt = this.db.prepare(sql);
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
    // 转换 MySQL 特定语法到 SQLite
    
    // 1. 转换 BIGINT 到 INTEGER
    sql = sql.replace(/BIGINT/gi, 'INTEGER');
    
    // 2. 转换 VARCHAR 到 TEXT
    sql = sql.replace(/VARCHAR\(\d+\)/gi, 'TEXT');
    
    // 3. 转换 LONGTEXT 到 TEXT
    sql = sql.replace(/LONGTEXT/gi, 'TEXT');
    
    // 4. 转换 JSON 到 TEXT (SQLite 不支持 JSON 类型)
    sql = sql.replace(/\bJSON\b/gi, 'TEXT');
    
    // 5. 转换 ENUM 到 TEXT (SQLite 不支持 ENUM)
    sql = sql.replace(/ENUM\([^)]+\)/gi, 'TEXT');
    
    // 6. 转换 BOOLEAN 到 INTEGER
    sql = sql.replace(/BOOLEAN/gi, 'INTEGER');
    
    // 7. 转换 AUTO_INCREMENT 到 AUTOINCREMENT
    sql = sql.replace(/AUTO_INCREMENT/gi, 'AUTOINCREMENT');
    
    // 8. 移除 INDEX 定义（SQLite 需要单独创建）
    sql = sql.replace(/,\s*INDEX\s+\w+\s*\([^)]+\)/gi, '');
    
    // 9. 移除 FOREIGN KEY 约束（包括多行的情况）
    sql = sql.replace(/,\s*FOREIGN\s+KEY\s*\([^)]+\)\s*REFERENCES\s+\w+\s*\([^)]+\)(\s+ON\s+DELETE\s+CASCADE)?(\s+ON\s+UPDATE\s+CASCADE)?/gi, '');
    
    // 10. 移除单独的 ON DELETE/UPDATE 约束
    sql = sql.replace(/\s+ON\s+DELETE\s+CASCADE/gi, '');
    sql = sql.replace(/\s+ON\s+UPDATE\s+CASCADE/gi, '');
    
    // 11. 清理多余的逗号和空格
    sql = sql.replace(/,\s*\)/g, ')');
    sql = sql.replace(/,\s*,/g, ',');
    
    return sql;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

// 工厂函数
export function createDatabaseAdapter(): DatabaseAdapter {
  const dbType = process.env.DB_TYPE || 'sqlite';
  
  if (dbType === 'mysql') {
    return new MySQLAdapter();
  } else {
    return new SQLiteAdapter();
  }
}
