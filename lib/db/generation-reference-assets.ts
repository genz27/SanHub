import type { DatabaseAdapter } from '../db-adapter';
import { getAdapter } from './connection';
import { ensureDatabase } from './ready';

const MAX_REFERENCE_ASSET_BYTES = 8 * 1024 * 1024;

export type GenerationReferenceAsset = {
  mimeType: string;
  buffer: Buffer;
};

export function isDatabaseReferencePointer(value: string): boolean {
  return /^db:\d+$/.test(value);
}

export function databaseReferencePointer(index: number): string {
  return `db:${index}`;
}

export async function createGenerationReferenceAssetsTable(db: DatabaseAdapter): Promise<void> {
  const isMysql = (process.env.DB_TYPE || 'sqlite') === 'mysql';
  const bodyType = isMysql ? 'MEDIUMBLOB' : 'BLOB';

  await db.execute(
    `CREATE TABLE IF NOT EXISTS generation_reference_assets (
       generation_id VARCHAR(36) NOT NULL,
       asset_index TINYINT NOT NULL,
       mime_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
       body ${bodyType} NOT NULL,
       created_at BIGINT NOT NULL,
       PRIMARY KEY (generation_id, asset_index)
     )`
  );
}

export async function ensureGenerationReferenceAssetsTable(): Promise<void> {
  await ensureDatabase();
  await createGenerationReferenceAssetsTable(getAdapter());
}

function asBuffer(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (typeof value === 'string' && value) {
    return Buffer.from(value, 'base64');
  }
  return null;
}

export async function putGenerationReferenceAsset(
  generationId: string,
  index: number,
  mimeType: string,
  buffer: Buffer
): Promise<string> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Reference asset is empty');
  }
  if (buffer.length > MAX_REFERENCE_ASSET_BYTES) {
    throw new Error('Reference asset is too large');
  }

  await ensureGenerationReferenceAssetsTable();
  const db = getAdapter();
  const now = Date.now();
  const safeMime = mimeType.trim() || 'image/jpeg';
  const isMysql = (process.env.DB_TYPE || 'sqlite') === 'mysql';

  if (isMysql) {
    await db.execute(
      `INSERT INTO generation_reference_assets (generation_id, asset_index, mime_type, body, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), body = VALUES(body)`,
      [generationId, index, safeMime, buffer, now]
    );
  } else {
    await db.execute(
      `INSERT OR REPLACE INTO generation_reference_assets (generation_id, asset_index, mime_type, body, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [generationId, index, safeMime, buffer, now]
    );
  }

  return databaseReferencePointer(index);
}

export async function getGenerationReferenceAsset(
  generationId: string,
  index: number
): Promise<GenerationReferenceAsset | null> {
  await ensureGenerationReferenceAssetsTable();
  const db = getAdapter();
  const [rows] = await db.execute(
    `SELECT mime_type, body
     FROM generation_reference_assets
     WHERE generation_id = ? AND asset_index = ?
     LIMIT 1`,
    [generationId, index]
  );
  const row = (rows as any[])[0];
  if (!row) return null;

  const buffer = asBuffer(row.body);
  if (!buffer) return null;
  return {
    mimeType: row.mime_type || 'image/jpeg',
    buffer,
  };
}

export async function deleteGenerationReferenceAssets(generationIds: string[]): Promise<void> {
  const ids = generationIds.filter((id) => typeof id === 'string' && id);
  if (ids.length === 0) return;

  await ensureGenerationReferenceAssetsTable();
  const db = getAdapter();
  const placeholders = ids.map(() => '?').join(',');
  await db.execute(
    `DELETE FROM generation_reference_assets WHERE generation_id IN (${placeholders})`,
    ids
  );
}
