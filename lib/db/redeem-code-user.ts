import type { RedemptionCode } from '@/types';
import { getAdapter } from './connection';
import { initializeCodesTables } from './invite-code-user';

export async function getRedemptionCodeByCode(code: string): Promise<RedemptionCode | null> {
  await initializeCodesTables();
  const db = getAdapter();

  const [rows] = await db.execute(
    'SELECT id, code, points, used_by, used_at, expires_at, batch_id, note, created_at FROM redemption_codes WHERE code = ?',
    [code]
  );
  const arr = rows as any[];
  if (arr.length === 0) return null;

  const row = arr[0];
  return {
    id: row.id,
    code: row.code,
    points: row.points,
    usedBy: row.used_by || undefined,
    usedAt: row.used_at || undefined,
    expiresAt: row.expires_at || undefined,
    batchId: row.batch_id || undefined,
    note: row.note || undefined,
    createdAt: row.created_at,
  };
}

export async function redeemCode(
  code: string,
  userId: string
): Promise<{ success: boolean; error?: string; points?: number }> {
  const redemptionCode = await getRedemptionCodeByCode(code);
  if (!redemptionCode) {
    return { success: false, error: '兑换码无效' };
  }

  if (redemptionCode.usedBy) {
    return { success: false, error: '兑换码已被使用' };
  }

  if (redemptionCode.expiresAt && Date.now() > redemptionCode.expiresAt) {
    return { success: false, error: '兑换码已过期' };
  }

  const db = getAdapter();
  const now = Date.now();
  await db.execute(
    'UPDATE redemption_codes SET used_by = ?, used_at = ? WHERE id = ? AND used_by IS NULL',
    [userId, now, redemptionCode.id]
  );

  const { updateUserBalance } = await import('./user-balance');
  await updateUserBalance(userId, redemptionCode.points, 'clamp');

  return { success: true, points: redemptionCode.points };
}
