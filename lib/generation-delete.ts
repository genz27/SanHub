import { parseJsonResponse } from './generation-http';

export async function deleteGenerationRecord(generationId: string): Promise<void> {
  const response = await fetch('/api/user/history/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'single',
      id: generationId,
    }),
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload.error || '删除作品失败');
  }
}

export async function deleteGenerationRecords(generationIds: string[]): Promise<number> {
  if (generationIds.length === 0) return 0;

  const response = await fetch('/api/user/history/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'batch',
      ids: generationIds,
    }),
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload.error || '删除错误任务失败');
  }

  return Number(payload.deletedCount || 0);
}
