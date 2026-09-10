import { getGenerationMedia } from '@/lib/db/generation-lookup-reads';

const DATA_URL_RE = /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+$/;
const MAX_DATA_URL_CHARS = 2_500_000;

export function isExtractableImageDataUrl(value: string): boolean {
  return DATA_URL_RE.test(value) && value.length <= MAX_DATA_URL_CHARS;
}

async function bufferToDataUrl(buffer: Buffer, mimeType: string): Promise<string> {
  const mime = mimeType.split(';')[0]?.trim() || 'image/jpeg';
  if (!mime.startsWith('image/') || mime.includes('svg')) {
    throw new Error('只支持位图');
  }
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export async function resolveExtractPromptImage(input: {
  generationId?: string;
  image?: string;
  userId: string;
  isAdmin: boolean;
}): Promise<string> {
  if (input.image && isExtractableImageDataUrl(input.image)) {
    return input.image.replace(/\s+/g, '');
  }

  if (!input.generationId || typeof input.generationId !== 'string' || input.generationId.length > 80) {
    throw new Error('请提供要反推的图片');
  }

  const media = await getGenerationMedia(input.generationId);
  if (!media) {
    throw new Error('图片不存在');
  }
  if (media.userId !== input.userId && !input.isAdmin) {
    throw new Error('无权访问这张图');
  }
  if (media.type.includes('video')) {
    throw new Error('视频不能反推提示词');
  }

  const resultUrl = media.resultUrl;
  if (!resultUrl) {
    throw new Error('图片还没有生成完成');
  }

  if (resultUrl.startsWith('data:image/')) {
    if (!isExtractableImageDataUrl(resultUrl)) {
      throw new Error('图片过大，换一张再试');
    }
    return resultUrl.replace(/\s+/g, '');
  }

  if (resultUrl.startsWith('file:')) {
    const { readMediaFile } = await import('@/lib/media-read');
    const file = await readMediaFile(resultUrl);
    if (!file) {
      throw new Error('图片文件不存在');
    }
    return bufferToDataUrl(file.buffer, file.mimeType);
  }

  if (resultUrl.startsWith('http://') || resultUrl.startsWith('https://')) {
    const { fetchExternalBuffer, resolveAndValidateUrl } = await import('@/lib/safe-fetch');
    const safeUrl = await resolveAndValidateUrl(resultUrl);
    const { buffer, contentType } = await fetchExternalBuffer(safeUrl.toString(), {
      maxBytes: 8 * 1024 * 1024,
      timeoutMs: 20_000,
    });
    return bufferToDataUrl(buffer, contentType);
  }

  throw new Error('无法读取这张图');
}
