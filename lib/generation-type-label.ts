export type GenerationTypeLabelSource = {
  type?: string;
  params?: {
    kind?: string;
    model?: string;
    modelName?: string;
  };
};

const TYPE_LABELS: Record<string, string> = {
  'sora-video': '视频',
  'sora-image': '图像',
  'gemini-image': 'Gemini 图像',
  'zimage-image': 'Z-Image 图像',
  'gitee-image': 'Gitee 图像',
  'extract-prompt': '反推提示词',
  chat: '聊天',
  'character-card': '角色卡',
};

export function generationTypeLabel(record: GenerationTypeLabelSource): string {
  const kind = record.params?.kind;
  const modelName = record.params?.modelName?.trim();

  if (record.type === 'extract-prompt' || kind === 'extract-prompt') {
    return modelName ? `反推提示词 · ${modelName}` : '反推提示词';
  }

  if (modelName) {
    return kind === 'region-edit' ? `区域编辑 · ${modelName}` : modelName;
  }

  return TYPE_LABELS[record.type || ''] || record.params?.model || record.type || '未知类型';
}
