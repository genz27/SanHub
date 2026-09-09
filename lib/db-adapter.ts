export interface DatabaseAdapter {
  execute(sql: string, params?: unknown[]): Promise<[unknown[], unknown]>;
  close(): Promise<void>;
}

export function createDatabaseAdapter(): DatabaseAdapter {
  const dbType = process.env.DB_TYPE || 'sqlite';

  if (dbType === 'mysql') {
    const { MySQLAdapter } = require('./db-adapter-mysql') as typeof import('./db-adapter-mysql');
    return new MySQLAdapter();
  }

  const { SQLiteAdapter } = require('./db-adapter-sqlite') as typeof import('./db-adapter-sqlite');
  return new SQLiteAdapter();
}
