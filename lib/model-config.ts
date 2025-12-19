// ========================================
// 模型配置 - 图像生成和视频生成
// ========================================

// 图像生成模型配置
export interface ImageModelConfig {
  id: string;
  name: string;
  description: string;
  provider: 'gemini' | 'zimage' | 'sora';
  channel?: 'modelscope' | 'gitee'; // zimage 专用
  apiModel: string; // 实际调用的模型名称
  highlight?: boolean;
  requiresReferenceImage?: boolean;
  allowEmptyPrompt?: boolean;
  features: {
    supportReferenceImage: boolean; // 是否支持参考图
    supportImageSize: boolean; // 是否支持分辨率选择 (1K/2K/4K)
  };
  aspectRatios: string[]; // 支持的画面比例
  resolutions: Record<string, string | Record<string, string>>; // 比例对应的分辨率
  imageSizes?: string[]; // 支持的分辨率档位 (Pro 专用)
  defaultAspectRatio: string;
  defaultImageSize?: string;
}

// 视频生成模型配置
export interface VideoModelConfig {
  id: string;
  name: string;
  description: string;
  provider: 'sora';
  apiModel: string;
  features: {
    supportReferenceFile: boolean; // 是否支持参考素材
  };
  aspectRatios: { value: string; label: string; icon: string }[];
  durations: { value: string; label: string }[];
  defaultAspectRatio: string;
  defaultDuration: string;
}

// ========================================
// 图像生成模型配置
// ========================================

export const IMAGE_MODELS: ImageModelConfig[] = [
  // Sora Image (优先显示)
  {
    id: 'sora-image',
    name: 'Sora Image',
    description: '高质量图像',
    provider: 'sora',
    apiModel: 'sora-image',
    features: {
      supportReferenceImage: true,
      supportImageSize: false,
    },
    aspectRatios: ['1:1', '3:2', '2:3'],
    resolutions: {
      '1:1': '1024x1024',
      '3:2': '1792x1024',
      '2:3': '1024x1792',
    },
    defaultAspectRatio: '1:1',
  },
  // Gemini Nano (Flash)
  {
    id: 'gemini-nano',
    name: 'Gemini Nano',
    description: '极速生成',
    provider: 'gemini',
    apiModel: 'gemini-2.5-flash-image',
    features: {
      supportReferenceImage: true,
      supportImageSize: false,
    },
    aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
    resolutions: {
      '1:1': '1024x1024',
      '2:3': '832x1248',
      '3:2': '1248x832',
      '3:4': '864x1184',
      '4:3': '1184x864',
      '4:5': '896x1152',
      '5:4': '1152x896',
      '9:16': '768x1344',
      '16:9': '1344x768',
      '21:9': '1536x672',
    },
    defaultAspectRatio: '1:1',
  },
  // Gemini Pro
  {
    id: 'gemini-pro',
    name: 'Gemini Pro',
    description: '4K 高清',
    provider: 'gemini',
    apiModel: 'gemini-3-pro-image-preview',
    features: {
      supportReferenceImage: true,
      supportImageSize: true,
    },
    aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
    imageSizes: ['1K', '2K', '4K'],
    resolutions: {
      '1K': {
        '1:1': '1024x1024',
        '2:3': '848x1264',
        '3:2': '1264x848',
        '3:4': '896x1200',
        '4:3': '1200x896',
        '4:5': '928x1152',
        '5:4': '1152x928',
        '9:16': '768x1376',
        '16:9': '1376x768',
        '21:9': '1584x672',
      },
      '2K': {
        '1:1': '2048x2048',
        '2:3': '1696x2528',
        '3:2': '2528x1696',
        '3:4': '1792x2400',
        '4:3': '2400x1792',
        '4:5': '1856x2304',
        '5:4': '2304x1856',
        '9:16': '1536x2752',
        '16:9': '2752x1536',
        '21:9': '3168x1344',
      },
      '4K': {
        '1:1': '4096x4096',
        '2:3': '3392x5056',
        '3:2': '5056x3392',
        '3:4': '3584x4800',
        '4:3': '4800x3584',
        '4:5': '3712x4608',
        '5:4': '4608x3712',
        '9:16': '3072x5504',
        '16:9': '5504x3072',
        '21:9': '6336x2688',
      },
    },
    defaultAspectRatio: '1:1',
    defaultImageSize: '1K',
  },
  // Z-Image Gitee
  {
    id: 'zimage-gitee',
    name: 'Z-Image Gitee',
    description: '2K 高清',
    provider: 'zimage',
    channel: 'gitee',
    apiModel: 'z-image-turbo',
    features: {
      supportReferenceImage: false,
      supportImageSize: false,
    },
    aspectRatios: ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16'],
    resolutions: {
      '1:1': '2048x2048',
      '4:3': '2048x1536',
      '3:4': '1536x2048',
      '3:2': '2048x1360',
      '2:3': '1360x2048',
      '16:9': '2048x1152',
      '9:16': '1152x2048',
    },
    defaultAspectRatio: '1:1',
  },
  // Z-Image ModelScope
  {
    id: 'zimage-modelscope',
    name: 'Z-Image ModelScope',
    description: '1K 标准',
    provider: 'zimage',
    channel: 'modelscope',
    apiModel: 'Tongyi-MAI/Z-Image-Turbo',
    features: {
      supportReferenceImage: false,
      supportImageSize: false,
    },
    aspectRatios: ['1:1', '1:2', '4:3', '3:4', '16:9', '9:16'],
    resolutions: {
      '1:1': '1024x1024',
      '1:2': '720x1440',
      '4:3': '1152x864',
      '3:4': '864x1152',
      '16:9': '1280x720',
      '9:16': '720x1280',
    },
    defaultAspectRatio: '1:1',
  },
  // Qwen Image
  {
    id: 'qwen-image',
    name: 'Qwen Image',
    description: 'ModelScope 文生图',
    provider: 'zimage',
    channel: 'modelscope',
    apiModel: 'Qwen/Qwen-Image',
    features: {
      supportReferenceImage: false,
      supportImageSize: false,
    },
    aspectRatios: ['1:1', '1:2', '4:3', '3:4', '16:9', '9:16'],
    resolutions: {
      '1:1': '1024x1024',
      '1:2': '720x1440',
      '4:3': '1152x864',
      '3:4': '864x1152',
      '16:9': '1280x720',
      '9:16': '720x1280',
    },
    defaultAspectRatio: '1:1',
  },
  // Qwen Image Edit
  {
    id: 'qwen-image-edit',
    name: 'Qwen Image Edit',
    description: 'ModelScope 图像编辑',
    provider: 'zimage',
    channel: 'modelscope',
    apiModel: 'Qwen/Qwen-Image-Edit-2509',
    requiresReferenceImage: true,
    features: {
      supportReferenceImage: true,
      supportImageSize: false,
    },
    aspectRatios: ['1:1', '1:2', '4:3', '3:4', '16:9', '9:16'],
    resolutions: {
      '1:1': '1024x1024',
      '1:2': '720x1440',
      '4:3': '1152x864',
      '3:4': '864x1152',
      '16:9': '1280x720',
      '9:16': '720x1280',
    },
    defaultAspectRatio: '1:1',
  },
  // FLUX.2 Dev
  {
    id: 'flux-2-dev',
    name: 'FLUX.2 Dev',
    description: 'ModelScope 图生图',
    provider: 'zimage',
    channel: 'modelscope',
    apiModel: 'black-forest-labs/FLUX.2-dev',
    features: {
      supportReferenceImage: true,
      supportImageSize: false,
    },
    aspectRatios: ['1:1', '1:2', '4:3', '3:4', '16:9', '9:16'],
    resolutions: {
      '1:1': '1024x1024',
      '1:2': '720x1440',
      '4:3': '1152x864',
      '3:4': '864x1152',
      '16:9': '1280x720',
      '9:16': '720x1280',
    },
    defaultAspectRatio: '1:1',
  },
  // RMBG Matting (Gitee)
  {
    id: 'rmbg-2',
    name: 'RMBG 2.0',
    description: 'Gitee AI 抠图',
    provider: 'zimage',
    channel: 'gitee',
    apiModel: 'RMBG-2.0',
    requiresReferenceImage: true,
    allowEmptyPrompt: true,
    features: {
      supportReferenceImage: true,
      supportImageSize: false,
    },
    aspectRatios: ['原图'],
    resolutions: {
      原图: '',
    },
    defaultAspectRatio: '原图',
  },
  // SeedVR2 Upscale (Gitee)
  {
    id: 'seedvr2-upscale',
    name: 'SeedVR2 HD',
    description: 'Gitee AI 超清修复 · <=5MB, <=1440px · 常见报错: Image file size exceeds 5MB limit / 分辨率不支持',
    provider: 'zimage',
    channel: 'gitee',
    apiModel: 'SeedVR2-3B',
    highlight: true,
    requiresReferenceImage: true,
    allowEmptyPrompt: true,
    features: {
      supportReferenceImage: true,
      supportImageSize: false,
    },
    aspectRatios: ['原图'],
    resolutions: {
      原图: '',
    },
    defaultAspectRatio: '原图',
  },
];

// ========================================
// 视频生成模型配置
// ========================================

export const VIDEO_MODELS: VideoModelConfig[] = [
  {
    id: 'sora',
    name: 'Sora',
    description: 'OpenAI 视频生成',
    provider: 'sora',
    apiModel: 'sora-video',
    features: {
      supportReferenceFile: true,
    },
    aspectRatios: [
      { value: 'landscape', label: '16:9', icon: '▬' },
      { value: 'portrait', label: '9:16', icon: '▮' },
      { value: 'square', label: '1:1', icon: '■' },
    ],
    durations: [
      { value: '10s', label: '10 秒' },
      { value: '15s', label: '15 秒' },
    ],
    defaultAspectRatio: 'landscape',
    defaultDuration: '10s',
  },
];

// ========================================
// 辅助函数
// ========================================

export function getImageModelById(id: string): ImageModelConfig | undefined {
  return IMAGE_MODELS.find((m) => m.id === id);
}

export function getVideoModelById(id: string): VideoModelConfig | undefined {
  return VIDEO_MODELS.find((m) => m.id === id);
}

// 获取图像模型的当前分辨率
export function getImageResolution(
  model: ImageModelConfig,
  aspectRatio: string,
  imageSize?: string
): string {
  if (model.features.supportImageSize && imageSize && typeof model.resolutions[imageSize] === 'object') {
    return (model.resolutions[imageSize] as Record<string, string>)[aspectRatio] || '';
  }
  return (model.resolutions as Record<string, string>)[aspectRatio] || '';
}

// 构建 Sora 模型 ID
export function buildSoraModelId(ratio: string, duration: string): string {
  let base = 'sora-video';
  if (ratio !== 'square') base += `-${ratio}`;
  base += `-${duration}`;
  return base;
}
