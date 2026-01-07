/* eslint-disable no-console */
import { getSystemConfig } from './db';
import { fetch as undiciFetch, FormData, File } from 'undici';

// ========================================
// PicUI 图床 API
// https://picui.cn/api/v1
// ========================================

export interface PicUIUploadResponse {
  status: boolean;
  message: string;
  data?: {
    key: string;
    name: string;
    pathname: string;
    origin_name: string;
    size: number;
    mimetype: string;
    extension: string;
    md5: string;
    sha1: string;
    links: {
      url: string;
      html: string;
      bbcode: string;
      markdown: string;
      markdown_with_link: string;
      thumbnail_url: string;
      delete_url: string;
    };
  };
}

/**
 * 将 base64 图片上传到 PicUI 图床
 * @param base64Data base64 编码的图片数据（可以带 data:image/xxx;base64, 前缀，也可以不带）
 * @param filename 可选的文件名
 * @returns 上传成功返回图片 URL，失败返回 null
 */
export async function uploadToPicUI(
  base64Data: string,
  filename?: string
): Promise<string | null> {
  const config = await getSystemConfig();

  // 如果没有配置 PicUI API Key，返回 null（保持原有 base64 存储方式）
  if (!config.picuiApiKey) {
    console.log('[PicUI] API Key 未配置，跳过上传');
    return null;
  }

  try {
    // 解析 base64 数据
    let mimeType = 'image/jpeg';
    let pureBase64 = base64Data;

    if (base64Data.startsWith('data:')) {
      const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        pureBase64 = matches[2];
      }
    }

    // 确定文件扩展名
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/bmp': 'bmp',
    };
    const ext = extMap[mimeType] || 'jpg';
    const finalFilename = filename || `image_${Date.now()}.${ext}`;

    // 转换为 Buffer
    const buffer = Buffer.from(pureBase64, 'base64');

    // 创建 FormData
    const formData = new FormData();
    const file = new File([buffer], finalFilename, { type: mimeType });
    formData.append('file', file);
    formData.append('permission', '1'); // 公开

    const baseUrl = config.picuiBaseUrl.replace(/\/$/, '');
    const apiUrl = `${baseUrl}/upload`;

    console.log('[PicUI] 上传图片:', { filename: finalFilename, size: buffer.length });

    const response = await undiciFetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.picuiApiKey}`,
        'Accept': 'application/json',
      },
      body: formData,
    });

    const data = await response.json() as PicUIUploadResponse;

    if (!response.ok || !data.status) {
      console.error('[PicUI] 上传失败:', data.message);
      return null;
    }

    const imageUrl = data.data?.links?.url;
    console.log('[PicUI] 上传成功:', imageUrl);
    return imageUrl || null;
  } catch (error) {
    console.error('[PicUI] 上传异常:', error);
    return null;
  }
}

/**
 * 尝试上传图片到 PicUI，如果失败则返回原始 base64
 * @param base64Data base64 编码的图片数据
 * @param filename 可选的文件名
 * @returns 图片 URL 或原始 base64
 */
export async function uploadImageOrKeepBase64(
  base64Data: string,
  filename?: string
): Promise<string> {
  const url = await uploadToPicUI(base64Data, filename);
  return url || base64Data;
}
