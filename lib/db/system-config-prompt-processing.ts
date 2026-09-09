import type { SystemConfig } from '@/types';
import { getSystemConfigSlice } from './system-config-slice';

export async function getPromptProcessingConfig(): Promise<SystemConfig['promptProcessing']> {
  return getSystemConfigSlice(
    'prompt-processing',
    'prompt_filter_enabled, prompt_filter_model_id, prompt_filter_prompt, prompt_translate_enabled, prompt_translate_model_id, prompt_translate_prompt, prompt_blocklist_enabled, prompt_blocklist_words',
    (row) => ({
      filterEnabled: Boolean(row?.prompt_filter_enabled),
      filterModelId: row?.prompt_filter_model_id || '',
      filterPrompt:
        row?.prompt_filter_prompt ||
        'You are a safety prompt filter for video generation. Rewrite the user prompt into a safe version while preserving creative intent as much as possible. Return only the rewritten prompt text.',
      translateEnabled: Boolean(row?.prompt_translate_enabled),
      translateModelId: row?.prompt_translate_model_id || '',
      translatePrompt:
        row?.prompt_translate_prompt ||
        'Translate the user prompt into clear, natural English for video generation. Preserve details, style, and constraints. Return only the translated prompt text.',
      blocklistEnabled: Boolean(row?.prompt_blocklist_enabled),
      blocklistWords: row?.prompt_blocklist_words || '',
    })
  );
}
