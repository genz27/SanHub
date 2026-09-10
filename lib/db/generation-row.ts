import type { Generation } from '@/types';
import { clientGenerationReferenceUrls, parseStoredReferenceImages } from '@/lib/generation-reference-media';

export function generationListColumns(
  includeError: boolean,
  includeProgress: boolean,
  includeVideoMeta = true,
  includeUpdatedAt = true
): string {
  return `
  id, type, prompt, cost,
  status${includeError ? `, CASE WHEN status IN ('failed', 'cancelled') THEN error_message END AS error_message` : ''}, created_at${includeUpdatedAt ? ', updated_at' : ''},
  CASE
    WHEN result_url IS NULL OR result_url = '' THEN NULL
    WHEN LEFT(result_url, 8) = 'https://' OR LEFT(result_url, 7) = 'http://' THEN result_url
    ELSE ''
  END AS result_url,
  JSON_UNQUOTE(JSON_EXTRACT(params, '$.modelId')) AS param_model_id,
  JSON_UNQUOTE(JSON_EXTRACT(params, '$.model')) AS param_model,
  JSON_EXTRACT(params, '$.referenceImages') AS param_reference_images
  ${includeVideoMeta ? `,
  CASE
    WHEN type NOT LIKE '%video%' THEN NULL
    ELSE JSON_UNQUOTE(JSON_EXTRACT(params, '$.permalink'))
  END AS param_permalink,
  CASE
    WHEN type NOT LIKE '%video%' THEN NULL
    ELSE JSON_UNQUOTE(JSON_EXTRACT(params, '$.videoId'))
  END AS param_video_id` : ''}
  ${includeProgress ? `, JSON_EXTRACT(params, '$.progress') AS param_progress` : ''}
`;
}

export function mapGenerationListRow(row: any, userId?: string): Generation {
  const rawUrl = row.result_url;
  const progressRaw = row.param_progress;
  const progress = progressRaw === null || progressRaw === undefined ? undefined : Number(progressRaw);
  const referenceImages = clientGenerationReferenceUrls(
    row.id,
    parseStoredReferenceImages(row.param_reference_images).length
  );

  return {
    id: row.id,
    userId: userId ?? row.user_id ?? '',
    type: row.type,
    prompt: row.prompt,
    params: {
      modelId: row.param_model_id || undefined,
      model: row.param_model || undefined,
      permalink: row.param_permalink || undefined,
      videoId: row.param_video_id || undefined,
      ...(referenceImages.length > 0 ? { referenceImages, imageCount: referenceImages.length } : {}),
      ...(Number.isFinite(progress) ? { progress } : {}),
    },
    resultUrl: rawUrl === '' ? `/api/media/${row.id}` : rawUrl || '',
    cost: row.cost,
    status: row.status || 'completed',
    errorMessage: row.error_message || undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
  };
}
