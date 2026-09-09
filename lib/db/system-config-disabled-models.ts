import type { SystemConfig } from '@/types';
import { getSystemConfigSlice } from './system-config-slice';

export async function getDisabledModelsConfig(): Promise<SystemConfig['disabledModels']> {
  return getSystemConfigSlice(
    'disabled-models',
    'disabled_image_models, disabled_video_models',
    (row) => ({
      imageModels: row?.disabled_image_models ? JSON.parse(row.disabled_image_models) : [],
      videoModels: row?.disabled_video_models ? JSON.parse(row.disabled_video_models) : [],
    })
  );
}
