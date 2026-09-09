import type { SystemConfig } from '@/types';
import { getSystemConfigSlice } from './system-config-slice';

export type AnnouncementConfigSlice = SystemConfig['announcement'];

export async function getAnnouncementConfig(): Promise<AnnouncementConfigSlice> {
  return getSystemConfigSlice(
    'announcement',
    'announcement_title, announcement_content, announcement_enabled, announcement_updated_at',
    (row) => ({
      title: row?.announcement_title || '',
      content: row?.announcement_content || '',
      enabled: Boolean(row?.announcement_enabled),
      updatedAt: Number(row?.announcement_updated_at) || 0,
    })
  );
}
