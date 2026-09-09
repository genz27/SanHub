import { getSoraConfig } from './sora-config';
import { fetchWithRetry, soraUndiciFetch } from './sora-http';
import { loadUndici } from './undici-http';
import { logError, logInfo } from './sora-logger';

export interface CharacterCardRequest {
  video_base64?: string;
  input_image?: string;
  prompt?: string;
  style_id?: string;
  model?: string;
  timestamps?: string;
  username?: string;
  display_name?: string;
  instruction_set?: string;
  safety_instruction_set?: string;
}

export interface CharacterCardResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  data: {
    cameo_id: string;
    username: string;
    display_name?: string;
    message: string;
    generation_id?: string;
  };
}

export async function createCharacterCard(request: CharacterCardRequest): Promise<CharacterCardResponse> {
  const { apiKey, baseUrl } = await getSoraConfig();

  if (!apiKey) {
    throw new Error('Sora API Key 未配置，请在管理后台「视频渠道」中配置 Sora 渠道');
  }

  if (!baseUrl) {
    throw new Error('Sora Base URL 未配置');
  }

  const isImageMode = !request.video_base64 && request.input_image;
  if (!request.video_base64 && !request.input_image) {
    throw new Error('请提供视频或参考图片');
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${normalizedBaseUrl}/v1/characters`;

  logInfo('[Sora API] Character card request', { mode: isImageMode ? 'image' : 'video' });

  const { FormData } = await loadUndici();
  const buildFormData = () => {
    const formData = new FormData();
    formData.append('model', request.model || 'sora-video-10s');
    if (request.timestamps) formData.append('timestamps', request.timestamps);
    if (request.username) formData.append('username', request.username);
    if (request.display_name) formData.append('display_name', request.display_name);
    if (request.instruction_set) formData.append('instruction_set', request.instruction_set);
    if (request.safety_instruction_set) formData.append('safety_instruction_set', request.safety_instruction_set);

    if (isImageMode) {
      if (request.prompt) formData.append('prompt', request.prompt);
      if (request.style_id) formData.append('style_id', request.style_id);
      const imageBuffer = Buffer.from(request.input_image!, 'base64');
      const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
      formData.append('input_reference', imageBlob, 'reference.jpg');
    } else {
      formData.append('timestamps', request.timestamps || '0,3');
      const videoBuffer = Buffer.from(request.video_base64!, 'base64');
      const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });
      formData.append('video', videoBlob, 'video.mp4');
    }

    return formData;
  };

  const response = await fetchWithRetry(soraUndiciFetch, apiUrl, () => ({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: buildFormData(),
  }));

  const data = await response.json() as { error?: { message?: string }; message?: string };

  if (!response.ok) {
    const errorMessage = data?.error?.message || data?.message || '角色卡创建失败';
    logError('[Sora API] Character card failed:', errorMessage);
    throw new Error(errorMessage);
  }

  logInfo('[Sora API] Character card completed:', JSON.stringify(data, null, 2));
  return data as CharacterCardResponse;
}
