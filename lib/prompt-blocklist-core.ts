export const PROMPT_BLOCKED_ERROR_PREFIX = 'Prompt blocked by safety policy';

const WORD_PREFIX = 'word:';
const SUBSTRING_PREFIX = 'substr:';
const REGEX_PREFIXES = ['re:', 'regex:'];

export type PromptBlocklistConfig = {
  blocklistEnabled?: boolean;
  blocklistWords?: string;
};

type BlocklistRule =
  | { type: 'word'; raw: string; value: string; regex: RegExp }
  | { type: 'substring'; raw: string; value: string }
  | { type: 'regex'; raw: string; value: string; regex: RegExp };

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildWordBoundaryRegex(value: string): RegExp {
  const escaped = escapeRegExp(value.trim());
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'iu');
}

function buildRegexRule(raw: string, pattern: string, flags?: string): BlocklistRule | null {
  const cleanedPattern = pattern.trim();
  if (!cleanedPattern) {
    return null;
  }

  const uniqueFlags = (flags || 'iu')
    .split('')
    .filter((flag, index, list) => list.indexOf(flag) === index)
    .filter((flag) => 'gimsuyd'.includes(flag))
    .join('');

  const finalFlags = uniqueFlags.includes('u') ? uniqueFlags : `${uniqueFlags}u`;

  try {
    const regex = new RegExp(cleanedPattern, finalFlags);
    return { type: 'regex', raw, value: cleanedPattern, regex };
  } catch {
    return null;
  }
}

function parseRule(line: string): BlocklistRule | null {
  const raw = line.trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();

  if (lower.startsWith(SUBSTRING_PREFIX)) {
    const value = raw.slice(SUBSTRING_PREFIX.length).trim();
    if (!value) return null;
    return { type: 'substring', raw, value };
  }

  if (lower.startsWith(WORD_PREFIX)) {
    const value = raw.slice(WORD_PREFIX.length).trim();
    if (!value) return null;
    return { type: 'word', raw, value, regex: buildWordBoundaryRegex(value) };
  }

  for (const prefix of REGEX_PREFIXES) {
    if (lower.startsWith(prefix)) {
      const rest = raw.slice(prefix.length).trim();
      if (!rest) return null;

      const literalMatch = rest.match(/^\/(.*)\/([a-z]*)$/i);
      if (literalMatch) {
        return buildRegexRule(raw, literalMatch[1], literalMatch[2]);
      }

      return buildRegexRule(raw, rest, 'iu');
    }
  }

  const literalMatch = raw.match(/^\/(.*)\/([a-z]*)$/i);
  if (literalMatch) {
    return buildRegexRule(raw, literalMatch[1], literalMatch[2]);
  }

  // Default mode: whole-word match.
  return { type: 'word', raw, value: raw, regex: buildWordBoundaryRegex(raw) };
}

export function parseBlocklistWords(raw: string): string[] {
  return (raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function findBlockedWords(prompt: string, rawWords: string): string[] {
  const normalizedPrompt = normalizeText(prompt || '');
  if (!normalizedPrompt) {
    return [];
  }

  const matched: string[] = [];
  const seen = new Set<string>();

  const rules = parseBlocklistWords(rawWords)
    .map((line) => parseRule(line))
    .filter((rule): rule is BlocklistRule => Boolean(rule));

  for (const rule of rules) {
    const identity = normalizeText(rule.raw);
    if (!identity || seen.has(identity)) {
      continue;
    }

    if (rule.type === 'substring') {
      const normalizedWord = normalizeText(rule.value);
      if (normalizedPrompt.includes(normalizedWord)) {
        seen.add(identity);
        matched.push(rule.raw);
      }
      continue;
    }

    rule.regex.lastIndex = 0;
    if (rule.regex.test(prompt)) {
      seen.add(identity);
      matched.push(rule.raw);
    }
  }

  return matched;
}

export function buildPromptBlockedMessage(matchedWords: string[]): string {
  return `${PROMPT_BLOCKED_ERROR_PREFIX}: ${matchedWords.join(', ')}`;
}

export function assertPromptAllowedWithConfig(prompt: string, config: PromptBlocklistConfig): void {
  if (!config.blocklistEnabled) {
    return;
  }

  const matchedWords = findBlockedWords(prompt, config.blocklistWords || '');
  if (matchedWords.length > 0) {
    throw new Error(buildPromptBlockedMessage(matchedWords));
  }
}

export function isPromptBlockedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.startsWith(PROMPT_BLOCKED_ERROR_PREFIX);
}
