import type { SystemConfig } from '@/types';
import { getSystemConfigSlice } from './system-config-slice';

export type PromptSafetyConfig = Pick<SystemConfig['promptProcessing'], 'blocklistEnabled' | 'blocklistWords'>;

export async function getPromptSafetyConfig(): Promise<PromptSafetyConfig> {
  return getSystemConfigSlice(
    'prompt-safety',
    'prompt_blocklist_enabled, prompt_blocklist_words',
    (row) => ({
      blocklistEnabled: Boolean(row?.prompt_blocklist_enabled),
      blocklistWords: row?.prompt_blocklist_words || '',
    })
  );
}
