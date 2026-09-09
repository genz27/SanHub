/* eslint-disable no-console */
import type { DatabaseAdapter } from './db-adapter';

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
      'MySQL 认证失败。对于 MySQL 8.x，请确认账号使用 caching_sha2_password，并检查驱动与服务端认证配置是否一致。'
    );
  }

  return error instanceof Error ? error : new Error(rawMessage);
}

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
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 30000,
      namedPlaceholders: false,
      decimalNumbers: true,
      supportBigNumbers: true,
      bigNumberStrings: false,
      dateStrings: false,
      charset: process.env.MYSQL_CHARSET || 'utf8mb4',
      timezone: process.env.MYSQL_TIMEZONE || 'Z',
      connectTimeout: parseIntegerEnv(process.env.MYSQL_CONNECT_TIMEOUT, 10000),
      idleTimeout: parseIntegerEnv(process.env.MYSQL_IDLE_TIMEOUT, 60000),
      maxIdle: mysqlPoolSize,
      ...(ssl ? { ssl } : {}),
    });

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

  getPoolStats(): { total: number; idle: number; waiting: number } {
    const pool = this.pool.pool;
    return {
      total: pool?._allConnections?.length || 0,
      idle: pool?._freeConnections?.length || 0,
      waiting: pool?._connectionQueue?.length || 0,
    };
  }
}
