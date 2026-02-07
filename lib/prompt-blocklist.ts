import { getSystemConfig } from './db';
import {
  assertPromptAllowedWithConfig,
} from './prompt-blocklist-core';

export {
  buildPromptBlockedMessage,
  findBlockedWords,
  isPromptBlockedError,
  parseBlocklistWords,
  PROMPT_BLOCKED_ERROR_PREFIX,
} from './prompt-blocklist-core';

export async function assertPromptAllowed(prompt: string): Promise<void> {
  const config = await getSystemConfig();
  const promptProcessing = config.promptProcessing || {
    blocklistEnabled: false,
    blocklistWords: '',
  };

  assertPromptAllowedWithConfig(prompt, {
    blocklistEnabled: promptProcessing.blocklistEnabled,
    blocklistWords: promptProcessing.blocklistWords,
  });
}

export async function assertPromptsAllowed(prompts: Array<string | undefined | null>): Promise<void> {
  const combined = prompts
    .map((item) => {
      if (item === undefined || item === null) {
        return '';
      }
      if (typeof item === 'string') {
        return item;
      }
      return String(item);
    })
    .map((text) => text.trim())
    .filter(Boolean)
    .join('\n');

  if (!combined) {
    return;
  }

  await assertPromptAllowed(combined);
}
