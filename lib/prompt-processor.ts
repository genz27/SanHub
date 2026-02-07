import { getChatModel, getSystemConfig } from './db';

const DEFAULT_FILTER_PROMPT = 'You are a safety prompt filter for video generation. Rewrite the user prompt into a safe version while preserving creative intent as much as possible. Return only the rewritten prompt text.';
const DEFAULT_TRANSLATE_PROMPT = 'Translate the user prompt into clear, natural English for video generation. Preserve details, style, and constraints. Return only the translated prompt text.';
const EMPTY_PROMPT_PROCESSOR_ERROR = 'Prompt processor returned empty content';

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

  if (raw && typeof raw === 'object') {
    const item = raw as Record<string, unknown>;

    if (typeof item.text === 'string') {
      return item.text.trim();
    }

    if (item.text && typeof item.text === 'object') {
      const nestedText = item.text as Record<string, unknown>;
      if (typeof nestedText.value === 'string') {
        return nestedText.value.trim();
      }
    }

    if (typeof item.output_text === 'string') {
      return item.output_text.trim();
    }

    if (typeof item.content === 'string') {
      return item.content.trim();
    }

    if (Array.isArray(item.content)) {
      return normalizeModelText(item.content);
    }

    if (Array.isArray(item.parts)) {
      return normalizeModelText(item.parts);
    }

    if (Array.isArray(item.output)) {
      return normalizeModelText(item.output);
    }

    if (Array.isArray(item.messages)) {
      return normalizeModelText(item.messages);
    }
  }

  if (Array.isArray(raw)) {
    const joined = raw
      .map((item) => normalizeModelText(item))
      .filter(Boolean)
      .join('\n');
    return joined.trim();
  }

  return '';
}

function firstNonEmpty(...candidates: string[]): string {
  for (const candidate of candidates) {
    if (candidate && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}

function extractCompletionContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const data = payload as Record<string, unknown>;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0] && typeof choices[0] === 'object'
    ? (choices[0] as Record<string, unknown>)
    : undefined;
  const message = firstChoice?.message && typeof firstChoice.message === 'object'
    ? (firstChoice.message as Record<string, unknown>)
    : undefined;

  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const firstCandidate = candidates[0] && typeof candidates[0] === 'object'
    ? (candidates[0] as Record<string, unknown>)
    : undefined;
  const candidateContent = firstCandidate?.content && typeof firstCandidate.content === 'object'
    ? (firstCandidate.content as Record<string, unknown>)
    : undefined;

  const dataList = Array.isArray(data.data) ? data.data : [];
  const firstDataItem = dataList[0] && typeof dataList[0] === 'object'
    ? (dataList[0] as Record<string, unknown>)
    : undefined;

  return firstNonEmpty(
    normalizeModelText(message?.content),
    normalizeModelText(firstChoice?.text),
    normalizeModelText(data.output_text),
    normalizeModelText(data.output),
    normalizeModelText(candidateContent?.parts),
    normalizeModelText(firstDataItem?.text),
    normalizeModelText(data.content)
  );
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
  const content = extractCompletionContent(data);
  const result = extractFinalPrompt(content);

  if (!result) {
    throw new Error(EMPTY_PROMPT_PROCESSOR_ERROR);
  }

  return result;
}

export function isPromptProcessorEmptyContentError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes(EMPTY_PROMPT_PROCESSOR_ERROR);
}

async function runPromptCompletionWithFallback(modelId: string, instruction: string, inputPrompt: string): Promise<string> {
  try {
    return await runPromptCompletion(modelId, instruction, inputPrompt);
  } catch (error) {
    if (isPromptProcessorEmptyContentError(error)) {
      return inputPrompt;
    }
    throw error;
  }
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
    currentPrompt = await runPromptCompletionWithFallback(options.filterModelId, options.filterPrompt, currentPrompt);
    filteredPrompt = currentPrompt;
  }

  if (options.translateEnabled) {
    translatedPrompt = await runPromptCompletionWithFallback(options.translateModelId, options.translatePrompt, currentPrompt);
    currentPrompt = translatedPrompt;

    // Ensure translated prompt is filtered before generation.
    currentPrompt = await runPromptCompletionWithFallback(options.filterModelId, options.filterPrompt, currentPrompt);
    filteredPrompt = currentPrompt;
  }

  return {
    originalPrompt: basePrompt,
    filteredPrompt,
    translatedPrompt,
    processedPrompt: currentPrompt,
  };
}
