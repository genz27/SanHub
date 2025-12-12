import fs from 'fs';
import path from 'path';
import { uploadToPicUI } from './picui';

// ========================================
// 媒体文件存储
// 支持将 base64 图片保存为文件，减少数据库体积
// ========================================

const DATA_DIR = process.env.DATA_DIR || './data';
const MEDIA_DIR = path.join(DATA_DIR, 'media');

// 确保目录存在
function ensureMediaDir(): void {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }
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
    'video/webm': 'webm',
  };
  return map[mimeType] || 'bin';
}

/**
 * 保存 base64 数据为文件（同步版本，不支持 PicUI）
 * @param id 唯一标识符（通常是 generation ID）
 * @param dataUrl base64 data URL
 * @returns 文件的相对路径（用于存储到数据库）或原始 data URL（如果禁用文件存储）
 */
export function saveMediaToFile(id: string, dataUrl: string): string {
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
    ensureMediaDir();

    const ext = getExtension(parsed.mimeType);
    const filename = `${id}.${ext}`;
    const filepath = path.join(MEDIA_DIR, filename);

    // 将 base64 转换为 Buffer 并写入文件
    const buffer = Buffer.from(parsed.data, 'base64');
    fs.writeFileSync(filepath, buffer);

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
 * 保存媒体文件（异步版本，优先上传到 PicUI 图床）
 * @param id 唯一标识符（通常是 generation ID）
 * @param dataUrl base64 data URL
 * @returns 图床 URL、本地文件路径或原始 data URL
 */
export async function saveMediaAsync(id: string, dataUrl: string): Promise<string> {
  // 如果不是 data URL，直接返回（可能是外部 URL）
  if (!dataUrl.startsWith('data:')) {
    return dataUrl;
  }

  // 优先尝试上传到 PicUI 图床
  try {
    const picuiUrl = await uploadToPicUI(dataUrl, `${id}.jpg`);
    if (picuiUrl) {
      console.log(`[MediaStorage] Uploaded to PicUI: ${picuiUrl}`);
      return picuiUrl;
    }
  } catch (error) {
    console.warn('[MediaStorage] PicUI upload failed, falling back to local storage:', error);
  }

  // 回退到本地文件存储
  return saveMediaToFile(id, dataUrl);
}

/**
 * 读取媒体文件
 * @param identifier 文件标识符（file:xxx.png 格式）或完整路径
 * @returns { buffer, mimeType } 或 null
 */
export function readMediaFile(identifier: string): { buffer: Buffer; mimeType: string } | null {
  try {
    let filename: string;

    if (identifier.startsWith('file:')) {
      filename = identifier.slice(5);
    } else {
      // 可能是完整路径或其他格式
      filename = path.basename(identifier);
    }

    const filepath = path.join(MEDIA_DIR, filename);

    if (!fs.existsSync(filepath)) {
      return null;
    }

    const buffer = fs.readFileSync(filepath);
    const ext = path.extname(filename).slice(1).toLowerCase();

    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      mp4: 'video/mp4',
      webm: 'video/webm',
    };

    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    return { buffer, mimeType };
  } catch (error) {
    console.error('[MediaStorage] Failed to read file:', error);
    return null;
  }
}

/**
 * 删除媒体文件
 * @param identifier 文件标识符
 */
export function deleteMediaFile(identifier: string): boolean {
  try {
    if (!identifier.startsWith('file:')) {
      return false;
    }

    const filename = identifier.slice(5);
    const filepath = path.join(MEDIA_DIR, filename);

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      console.log(`[MediaStorage] Deleted: ${filename}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error('[MediaStorage] Failed to delete file:', error);
    return false;
  }
}

/**
 * 检查标识符是否为本地文件
 */
export function isLocalFile(identifier: string): boolean {
  return identifier.startsWith('file:');
}
