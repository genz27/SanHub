/* eslint-disable no-console */
import { promises as fsp } from 'fs';
import path from 'path';
import { fetchWithRetry } from './http-retry';

type PicuiModule = typeof import('./picui');

let picuiModulePromise: Promise<PicuiModule> | null = null;

function loadPicui(): Promise<PicuiModule> {
  if (!picuiModulePromise) {
    picuiModulePromise = import('./picui');
  }
  return picuiModulePromise;
}

// ========================================
// 媒体文件存储
// 支持将 base64 图片保存为文件，减少数据库体积
// ========================================

const DATA_DIR = process.env.DATA_DIR || './data';
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const MAX_REMOTE_MEDIA_BYTES = Math.max(
  1,
  Number(process.env.MEDIA_REMOTE_CACHE_MAX_BYTES) || 512 * 1024 * 1024
);

type SaveMediaOptions = {
  publicBaseUrl?: string;
  filename?: string;
};

// 确保目录存在
async function ensureMediaDir(): Promise<void> {
  await fsp.mkdir(MEDIA_DIR, { recursive: true });
}

// 从 data URL 中提取 mime 类型和数据
function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2],
  };
}

// 根据 mime 类型获取文件扩展名
function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  };
  return map[mimeType] || 'bin';
}

function isRemoteUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

function filenameFromUrl(id: string, mediaUrl: string, mimeType: string): string {
  try {
    const parsed = new URL(mediaUrl);
    const basename = path.basename(parsed.pathname);
    if (basename && basename !== '/' && /\.[a-z0-9]{2,5}$/i.test(basename)) {
      return `${id}-${basename}`;
    }
  } catch {
    // ignore
  }
  return `${id}.${getExtension(mimeType)}`;
}

async function downloadRemoteMedia(mediaUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const response = await fetchWithRetry(fetch, mediaUrl, () => ({
    method: 'GET',
    headers: {
      Accept: 'image/*,video/*,*/*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  }), {
    attempts: 4,
    baseDelayMs: 500,
    maxDelayMs: 6000,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`remote media download failed (${response.status})${details ? `: ${details.slice(0, 200)}` : ''}`);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_REMOTE_MEDIA_BYTES) {
    throw new Error(`remote media exceeds cache limit: ${contentLength} bytes`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > MAX_REMOTE_MEDIA_BYTES) {
    throw new Error(`remote media exceeds cache limit: ${buffer.length} bytes`);
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
  return { buffer, mimeType };
}

/**
 * 保存 base64 数据为文件（async version，不支持 PicUI）
 * @param id 唯一标识符（通常是 generation ID）
 * @param dataUrl base64 data URL
 * @returns 文件的相对路径（用于存储到数据库）或原始 data URL（如果禁用文件存储）
 */
export async function saveMediaToFile(id: string, dataUrl: string): Promise<string> {
  // 如果不是 data URL，直接返回（可能是外部 URL）
  if (!dataUrl.startsWith('data:')) {
    return dataUrl;
  }

  // 检查是否启用文件存储（默认启用）
  const useFileStorage = process.env.MEDIA_FILE_STORAGE !== 'false';
  if (!useFileStorage) {
    return dataUrl;
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    console.warn('[MediaStorage] Invalid data URL format, keeping as-is');
    return dataUrl;
  }

  try {
    await ensureMediaDir();

    const ext = getExtension(parsed.mimeType);
    const filename = `${id}.${ext}`;
    const filepath = path.join(MEDIA_DIR, filename);

    // 将 base64 转换为 Buffer 并写入文件
    const buffer = Buffer.from(parsed.data, 'base64');
    await fsp.writeFile(filepath, buffer);

    console.log(`[MediaStorage] Saved: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);

    // 返回文件标识符（前缀 file: 表示本地文件）
    return `file:${filename}`;
  } catch (error) {
    console.error('[MediaStorage] Failed to save file:', error);
    // 失败时返回原始 data URL
    return dataUrl;
  }
}

/**
 * 保存媒体文件（异步版本，优先上传到默认图片桶）
 * @param id 唯一标识符（通常是 generation ID）
 * @param dataUrl base64 data URL
 * @returns 图床 URL、本地文件路径或原始 data URL
 */
export async function saveMediaAsync(
  id: string,
  dataUrl: string,
  options: SaveMediaOptions = {}
): Promise<string> {
  const { resolveDefaultImageBucket, uploadBufferToImageBucket, uploadToPicUI } = await loadPicui();
  const configuredBucket = await resolveDefaultImageBucket();

  if (isRemoteUrl(dataUrl)) {
    if (!configuredBucket) {
      return dataUrl;
    }

    try {
      const remote = await downloadRemoteMedia(dataUrl);
      const filename = options.filename || filenameFromUrl(id, dataUrl, remote.mimeType);
      const uploadedUrl = await uploadBufferToImageBucket(
        remote.buffer,
        remote.mimeType,
        filename,
        { publicBaseUrl: options.publicBaseUrl }
      );
      if (uploadedUrl) {
        console.log(`[MediaStorage] Cached remote media to bucket: ${uploadedUrl}`);
        return uploadedUrl;
      }
    } catch (error) {
      console.warn('[MediaStorage] Remote media cache failed, keeping original URL:', error);
    }

    return dataUrl;
  }

  // 如果不是 data URL，直接返回（可能是其他外部标识）
  if (!dataUrl.startsWith('data:')) {
    return dataUrl;
  }

  // 优先尝试上传到默认图片桶
  if (configuredBucket) {
    try {
      const parsed = parseDataUrl(dataUrl);
      const filename = options.filename || `${id}.${getExtension(parsed?.mimeType || 'image/jpeg')}`;
      const picuiUrl = await uploadToPicUI(dataUrl, filename, { publicBaseUrl: options.publicBaseUrl });
      if (picuiUrl) {
        console.log(`[MediaStorage] Uploaded to remote bucket: ${picuiUrl}`);
        return picuiUrl;
      }
    } catch (error) {
      console.warn('[MediaStorage] Remote upload failed, keeping data URL:', error);
    }

    // 已配置远程桶时不再落本地，避免 S3/PicUI 开启后继续占用本地磁盘。
    return dataUrl;
  }

  // 回退到本地文件存储
  return await saveMediaToFile(id, dataUrl);
}
