/* eslint-disable no-console */
import { createDatabaseAdapter, type DatabaseAdapter } from '../db-adapter';

// ========================================
// 数据库连接（支持 SQLite / MySQL）
// ========================================

let adapter: DatabaseAdapter | null = null;

export function getAdapter(): DatabaseAdapter {
  if (!adapter) {
    adapter = createDatabaseAdapter();
    console.log(`[DB] Using database type: ${process.env.DB_TYPE || 'sqlite'}`);
  }
  return adapter;
}

/**
 * Reset the adapter (for testing or configuration changes).
 */
export function resetAdapter(): void {
  adapter = null;
}
