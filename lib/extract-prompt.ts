export const EXTRACT_PROMPT_INSTRUCTION = [
  '你是图像提示词反推器。根据图片输出一段可直接用于文生图的提示词。',
  '写清主体、外貌、服装、姿势、构图、镜头、光影、风格和背景。',
  '只输出提示词本身，不要解释，不要编号，不要写“这张图”。',
  '用中文写，专有名词、风格名可保留英文。',
].join('');

export function sanitizeExtractedPrompt(text: string): string {
  return text
    .trim()
    .replace(/^```[\w]*\s*/, '')
    .replace(/\s*```$/, '')
    .replace(/^(提示词[:：]\s*)/, '')
    .trim();
}

export async function requestExtractedPrompt(input: {
  generationId?: string;
  image?: string;
}): Promise<{ prompt: string; cost: number }> {
  const res = await fetch('/api/extract-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as { success?: boolean; error?: string; data?: { prompt: string; cost: number } };
  if (!res.ok || !data.success || !data.data?.prompt) {
    throw new Error(data.error || '反推失败');
  }
  return data.data;
}
