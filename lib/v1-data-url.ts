export function parseDataUrl(input: string): { mimeType: string; data: string } | null {
  const match = input.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export function buildDataUrl(mimeType: string, data: string): string {
  return `data:${mimeType};base64,${data}`;
}

export function stripDataUrl(input: string): { mimeType: string; data: string } {
  const parsed = parseDataUrl(input);
  if (parsed) return parsed;
  return { mimeType: 'application/octet-stream', data: input };
}
