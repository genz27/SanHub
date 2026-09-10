export function resolveChatCompletionsUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/$/, '');
  if (!trimmed) return trimmed;
  if (/:generatecontent/i.test(trimmed) || /\/messages$/i.test(trimmed)) {
    return trimmed;
  }
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }
  if (/\/v1$/i.test(trimmed) || /\/openai$/i.test(trimmed) || /\/openai\/v1$/i.test(trimmed)) {
    return `${trimmed}/chat/completions`;
  }
  if (/xiaomimimo\.com$/i.test(trimmed)) {
    return `${trimmed}/v1/chat/completions`;
  }
  return trimmed;
}
