import { getChatModel, getSystemConfig } from './db';

const DEFAULT_FILTER_PROMPT = 'You are a safety prompt filter for video generation. Rewrite the user prompt into a safe version while preserving creative intent as much as possible. Return only the rewritten prompt text.';
const DEFAULT_TRANSLATE_PROMPT = 'Translate the user prompt into clear, natural English for video generation. Preserve details, style, and constraints. Return only the translated prompt text.';

type PromptProcessingOptions = {
  filterEnabled: boolean;
  filterModelId: string;
  filterPrompt: string;
  translateEnabled: boolean;
  translateModelId: string;
  translatePrompt: string;
};

export interface ProcessedPromptResult {
  originalPrompt: string;
  filteredPrompt?: string;
  translatedPrompt?: string;
  processedPrompt: string;
}

function normalizeModelText(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw.trim();
  }

  if (Array.isArray(raw)) {
    const joined = raw
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item && typeof (item as { text?: unknown }).text === 'string') {
          return (item as { text: string }).text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
    return joined.trim();
  }

  return '';
}

function stripCodeFence(text: string): string {
  const fenced = text.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return text;
}

function extractFinalPrompt(raw: string): string {
  const cleaned = stripCodeFence(raw.trim());
  if (!cleaned) return '';

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const candidates = ['prompt', 'rewritten_prompt', 'translated_prompt', 'content', 'result'];
    for (const key of candidates) {
      if (typeof parsed[key] === 'string' && parsed[key]) {
        return String(parsed[key]).trim();
      }
    }
  } catch {
    // Ignore non-JSON content
  }

  return cleaned.replace(/^['"]|['"]$/g, '').trim();
}

async function runPromptCompletion(modelId: string, instruction: string, inputPrompt: string): Promise<string> {
  const model = await getChatModel(modelId);
  if (!model || !model.enabled) {
    throw new Error(`Prompt processing model is unavailable: ${modelId}`);
  }

  const response = await fetch(model.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${model.apiKey}`,
    },
    body: JSON.stringify({
      model: model.modelId,
      messages: [
        {
          role: 'system',
          content: instruction,
        },
        {
          role: 'user',
          content: inputPrompt,
        },
      ],
      max_tokens: Math.min(2048, model.maxTokens || 2048),
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message =
      typeof data?.error?.message === 'string'
        ? data.error.message
        : `Prompt processor API failed: ${response.status}`;
    throw new Error(message);
  }

  const data = await response.json().catch(() => ({}));
  const content = normalizeModelText(data?.choices?.[0]?.message?.content);
  const result = extractFinalPrompt(content);

  if (!result) {
    throw new Error('Prompt processor returned empty content');
  }

  return result;
}

function normalizeOptions(config: PromptProcessingOptions): PromptProcessingOptions {
  return {
    filterEnabled: Boolean(config.filterEnabled),
    filterModelId: (config.filterModelId || '').trim(),
    filterPrompt: (config.filterPrompt || DEFAULT_FILTER_PROMPT).trim(),
    translateEnabled: Boolean(config.translateEnabled),
    translateModelId: (config.translateModelId || '').trim(),
    translatePrompt: (config.translatePrompt || DEFAULT_TRANSLATE_PROMPT).trim(),
  };
}

function validateOptions(options: PromptProcessingOptions): void {
  if (options.filterEnabled) {
    if (!options.filterModelId || !options.filterPrompt) {
      throw new Error('Prompt filter is enabled but filter model or prompt is not configured');
    }
  }

  if (options.translateEnabled) {
    if (!options.translateModelId || !options.translatePrompt) {
      throw new Error('Prompt translation is enabled but translation model or prompt is not configured');
    }
    if (!options.filterModelId || !options.filterPrompt) {
      throw new Error('Prompt translation requires filter model and filter prompt to sanitize translated content');
    }
  }
}

export async function processVideoPrompt(originalPrompt: string): Promise<ProcessedPromptResult> {
  const basePrompt = (originalPrompt || '').trim();
  if (!basePrompt) {
    return {
      originalPrompt: basePrompt,
      processedPrompt: basePrompt,
    };
  }

  const config = await getSystemConfig();
  const options = normalizeOptions(config.promptProcessing || {
    filterEnabled: false,
    filterModelId: '',
    filterPrompt: DEFAULT_FILTER_PROMPT,
    translateEnabled: false,
    translateModelId: '',
    translatePrompt: DEFAULT_TRANSLATE_PROMPT,
  });

  if (!options.filterEnabled && !options.translateEnabled) {
    return {
      originalPrompt: basePrompt,
      processedPrompt: basePrompt,
    };
  }

  validateOptions(options);

  let currentPrompt = basePrompt;
  let filteredPrompt: string | undefined;
  let translatedPrompt: string | undefined;

  if (options.filterEnabled) {
    currentPrompt = await runPromptCompletion(options.filterModelId, options.filterPrompt, currentPrompt);
    filteredPrompt = currentPrompt;
  }

  if (options.translateEnabled) {
    translatedPrompt = await runPromptCompletion(options.translateModelId, options.translatePrompt, currentPrompt);
    currentPrompt = translatedPrompt;

    // Ensure translated prompt is filtered before generation.
    currentPrompt = await runPromptCompletion(options.filterModelId, options.filterPrompt, currentPrompt);
    filteredPrompt = currentPrompt;
  }

  return {
    originalPrompt: basePrompt,
    filteredPrompt,
    translatedPrompt,
    processedPrompt: currentPrompt,
  };
}

