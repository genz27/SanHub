import type {
  ChatModel,
  SafeImageModel,
  SafeVideoModel,
  WorkspaceEdge,
  WorkspaceNode,
} from '@/types';

export type WorkspaceSubmitDeps = {
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  updateNodeData: (id: string, partial: Partial<WorkspaceNode['data']>) => void;
};

function resolveUpstreamPrompt(node: WorkspaceNode, deps: WorkspaceSubmitDeps): string {
  let basePrompt = node.data.prompt.trim();
  const inputEdge = deps.edges.find((edge) => edge.to === node.id);
  if (!inputEdge || basePrompt) return basePrompt;

  const inputNode = deps.nodes.find((item) => item.id === inputEdge.from);
  if (inputNode?.type === 'chat' && inputNode.data.chatOutput) {
    return inputNode.data.chatOutput.trim();
  }
  if (inputNode?.type === 'prompt-template' && inputNode.data.templateOutput) {
    return inputNode.data.templateOutput.trim();
  }
  return basePrompt;
}

export async function submitWorkspaceMediaNode(
  node: WorkspaceNode,
  deps: WorkspaceSubmitDeps & {
    imageModels: SafeImageModel[];
    videoModels: SafeVideoModel[];
  }
): Promise<string | null> {
  const basePrompt = resolveUpstreamPrompt(node, deps);

  if (node.type === 'image') {
    const model = deps.imageModels.find((item) => item.id === node.data.modelId) || deps.imageModels[0];
    if (!model) {
      deps.updateNodeData(node.id, { errorMessage: '无可用模型', status: 'failed' });
      return null;
    }

    const imageInputEdge = deps.edges.find((edge) => edge.to === node.id);
    const imageInputNode = imageInputEdge
      ? deps.nodes.find((item) => item.id === imageInputEdge.from && item.type === 'image')
      : undefined;

    let referenceImageUrl: string | undefined;
    let referenceImages: string[] | undefined;

    if (model.features.imageToImage) {
      if (imageInputNode?.data.outputUrl) {
        referenceImageUrl = imageInputNode.data.outputUrl;
      } else if (node.data.uploadedImages && node.data.uploadedImages.length > 0) {
        if (model.features.multipleImages) {
          referenceImages = node.data.uploadedImages;
        } else {
          referenceImageUrl = node.data.uploadedImages[0];
        }
      }
    }

    if (imageInputEdge && model.features.imageToImage && !referenceImageUrl && !referenceImages) {
      deps.updateNodeData(node.id, { errorMessage: '请先生成上游图片', status: 'failed' });
      return null;
    }
    if (model.requiresReferenceImage && !referenceImageUrl && !referenceImages) {
      deps.updateNodeData(node.id, { errorMessage: '该模型需要参考图', status: 'failed' });
      return null;
    }
    if (!basePrompt && !model.allowEmptyPrompt) {
      deps.updateNodeData(node.id, { errorMessage: '请输入提示词', status: 'failed' });
      return null;
    }

    deps.updateNodeData(node.id, { status: 'pending', errorMessage: undefined });

    const { fetchGenerationSubmit } = await import('@/lib/generation-submit');
    const res = await fetchGenerationSubmit('/api/generate/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: model.id,
        prompt: basePrompt,
        aspectRatio: node.data.aspectRatio || model.defaultAspectRatio,
        imageSize: model.features.imageSize ? node.data.imageSize : undefined,
        referenceImageUrl,
        referenceImages,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '生成失败');
    }
    const generationId = data.data.id as string;
    deps.updateNodeData(node.id, { generationId, status: 'pending' });
    return generationId;
  }

  if (!basePrompt) {
    deps.updateNodeData(node.id, { errorMessage: '请输入提示词', status: 'failed' });
    return null;
  }
  deps.updateNodeData(node.id, { status: 'pending', errorMessage: undefined });

  const model = deps.videoModels.find((item) => item.id === node.data.modelId) || deps.videoModels[0];
  const ratio = node.data.aspectRatio || model?.defaultAspectRatio || 'landscape';
  const duration = node.data.duration || model?.defaultDuration || '8s';
  const taskModel = `sora2-${ratio}-${duration}`;

  const videoInputEdge = deps.edges.find((edge) => edge.to === node.id);
  const videoInputNode = videoInputEdge
    ? deps.nodes.find((item) => item.id === videoInputEdge.from && item.type === 'image')
    : undefined;

  let referenceImageUrl = videoInputNode?.data.outputUrl;
  if (!referenceImageUrl && node.data.uploadedImages && node.data.uploadedImages.length > 0) {
    referenceImageUrl = node.data.uploadedImages[0];
  }

  const { fetchGenerationSubmit } = await import('@/lib/generation-submit');
  const res = await fetchGenerationSubmit('/api/generate/sora', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: taskModel,
      modelId: model?.id,
      aspectRatio: ratio,
      duration,
      prompt: basePrompt,
      ...(referenceImageUrl ? { referenceImageUrl } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '生成失败');
  }
  const generationId = data.data.id as string;
  deps.updateNodeData(node.id, { generationId, status: 'pending' });
  return generationId;
}

export async function submitWorkspaceChatNode(
  node: WorkspaceNode,
  deps: WorkspaceSubmitDeps & {
    chatModels: Array<Pick<ChatModel, 'id' | 'name' | 'supportsVision' | 'enabled'>>;
  }
): Promise<boolean> {
  let prompt = node.data.prompt.trim();
  if (!node.data.chatModelId) {
    deps.updateNodeData(node.id, { errorMessage: '请选择聊天模型', status: 'failed' });
    return false;
  }

  const inputEdges = deps.edges.filter((edge) => edge.to === node.id);
  const inputImages: string[] = [];
  let templateContent = '';

  for (const edge of inputEdges) {
    const inputNode = deps.nodes.find((item) => item.id === edge.from);
    if (inputNode?.type === 'image' && inputNode.data.outputUrl) {
      inputImages.push(inputNode.data.outputUrl);
    } else if (inputNode?.type === 'prompt-template' && inputNode.data.templateOutput) {
      templateContent = inputNode.data.templateOutput.trim();
    }
  }

  if (templateContent && prompt) {
    prompt = `${templateContent}\n\n${prompt}`;
  } else if (templateContent && !prompt) {
    prompt = templateContent;
  }

  if (!prompt) {
    deps.updateNodeData(node.id, { errorMessage: '请输入提示词或连接模板节点', status: 'failed' });
    return false;
  }

  const selectedModel = deps.chatModels.find((item) => item.id === node.data.chatModelId);
  if (inputImages.length > 0 && selectedModel && !selectedModel.supportsVision) {
    deps.updateNodeData(node.id, { errorMessage: '该模型不支持图片输入', status: 'failed' });
    return false;
  }

  deps.updateNodeData(node.id, { status: 'pending', errorMessage: undefined, inputImages });

  const res = await fetch('/api/chat/workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelId: node.data.chatModelId,
      prompt,
      images: inputImages,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '聊天失败');
  }

  deps.updateNodeData(node.id, {
    status: 'completed',
    chatOutput: data.data.content,
    chatMessages: [
      ...(node.data.chatMessages || []),
      { role: 'user', content: prompt },
      { role: 'assistant', content: data.data.content },
    ],
    errorMessage: undefined,
  });
  return true;
}
