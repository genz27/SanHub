'use client';
/* eslint-disable @next/next/no-img-element */

import {
  ChevronDown,
  Download,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  Trash2,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  ChatModel,
  SafeImageModel,
  SafeVideoModel,
  WorkspaceEdge,
  WorkspaceNode,
} from '@/types';
import { CHAT_MAX_LENGTH, type PromptTemplate } from './types';

export interface WorkspaceNodeCardProps {
  node: WorkspaceNode;
  incoming: WorkspaceEdge[];
  incomingSources: Array<{ id: string; name: string }>;
  hasConnectedImage: boolean;
  connectingFrom: string | null;
  model: SafeImageModel | SafeVideoModel | null;
  imageModels: SafeImageModel[];
  videoModels: SafeVideoModel[];
  chatModels: Array<Pick<ChatModel, 'id' | 'name' | 'supportsVision' | 'enabled'>>;
  promptTemplates: PromptTemplate[];
  onStartDrag: (event: React.PointerEvent, node: WorkspaceNode) => void;
  onUpdateNode: (id: string, partial: Partial<WorkspaceNode>) => void;
  onUpdateNodeData: (id: string, partial: Partial<WorkspaceNode['data']>) => void;
  onRemoveNode: (id: string) => void;
  onRemoveEdge: (edgeId: string) => void;
  onRemoveIncomingEdges: (nodeId: string) => void;
  onGenerate: (node: WorkspaceNode) => void;
  onStartConnect: (nodeId: string) => void;
  onFinishConnect: (nodeId: string) => void;
  onPromptTemplateLoaded: (templateId: string, content: string) => void;
}

export function WorkspaceNodeCard({
  node,
  incoming,
  incomingSources,
  hasConnectedImage,
  connectingFrom,
  model,
  imageModels,
  videoModels,
  chatModels,
  promptTemplates,
  onStartDrag,
  onUpdateNode,
  onUpdateNodeData,
  onRemoveNode,
  onRemoveEdge,
  onRemoveIncomingEdges,
  onGenerate,
  onStartConnect,
  onFinishConnect,
  onPromptTemplateLoaded,
}: WorkspaceNodeCardProps) {
  const supportsReferenceInput =
    node.type === 'image' && model && (model as SafeImageModel).features.imageToImage;
  const showInputHandle = node.type === 'video' || node.type === 'chat' || supportsReferenceInput;
  const showOutputHandle =
    node.type === 'image' || node.type === 'chat' || node.type === 'prompt-template';
  const NodeIcon =
    node.type === 'chat' ? MessageSquare : node.type === 'prompt-template' ? FileText : null;

  return (
    <div
      data-workspace-node
      className="relative w-64 sm:w-72 bg-background/70 border border-border/70 rounded-xl shadow-lg"
    >
      <div
        onPointerDown={(event) => onStartDrag(event, node)}
        className="flex items-center justify-between px-3 py-2 border-b border-border/70 bg-card/60 rounded-t-xl cursor-grab"
      >
        <div className="flex items-center gap-2 flex-1">
          {NodeIcon && <NodeIcon className="w-4 h-4 text-foreground/50" />}
          <input
            value={node.name}
            onChange={(e) => onUpdateNode(node.id, { name: e.target.value })}
            onPointerDown={(event) => event.stopPropagation()}
            className="text-sm text-foreground/90 bg-transparent focus:outline-none flex-1"
          />
        </div>
        <div className="flex items-center gap-1">
          {(node.type === 'image' || node.type === 'video' || node.type === 'chat') && (
            <button
              onClick={() => onGenerate(node)}
              onPointerDown={(event) => event.stopPropagation()}
              disabled={node.data.status === 'pending' || node.data.status === 'processing'}
              className={cn(
                'text-foreground/40 hover:text-foreground transition',
                (node.data.status === 'pending' || node.data.status === 'processing') &&
                  'opacity-40 cursor-not-allowed'
              )}
              title="重新生成"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onRemoveNode(node.id)}
            onPointerDown={(event) => event.stopPropagation()}
            className="text-foreground/40 hover:text-red-400 transition"
            title="删除节点"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showInputHandle && (
        <button
          onClick={() => onFinishConnect(node.id)}
          className="absolute -left-2 top-[18px] w-4 h-4 rounded-full border border-border bg-card/80 hover:bg-card/70"
          title="输入"
        />
      )}
      {showOutputHandle && (
        <button
          onClick={() => onStartConnect(node.id)}
          className={cn(
            'absolute -right-2 top-[18px] w-4 h-4 rounded-full border border-border',
            connectingFrom === node.id ? 'bg-foreground' : 'bg-card/80 hover:bg-card/70'
          )}
          title="输出"
        />
      )}

      <div className="relative p-3 space-y-3 text-xs text-foreground/70">
        {node.type === 'prompt-template' && (
          <>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-foreground/40">模板</label>
              <div className="relative">
                <select
                  value={node.data.templateId || ''}
                  onChange={(e) => {
                    const templateId = e.target.value;
                    if (!templateId) {
                      onUpdateNodeData(node.id, { templateId: '', templateOutput: '' });
                      return;
                    }
                    const template = promptTemplates.find((item) => item.id === templateId);
                    if (template?.content) {
                      onUpdateNodeData(node.id, {
                        templateId,
                        templateOutput: template.content,
                      });
                      return;
                    }
                    onUpdateNodeData(node.id, { templateId, templateOutput: '' });
                    void (async () => {
                      try {
                        const res = await fetch(`/api/prompts?id=${encodeURIComponent(templateId)}`);
                        if (!res.ok) return;
                        const data = await res.json();
                        const content = data.data?.content || '';
                        onPromptTemplateLoaded(templateId, content);
                        onUpdateNodeData(node.id, { templateId, templateOutput: content });
                      } catch (error) {
                        console.error('Failed to load prompt template:', error);
                      }
                    })();
                  }}
                  className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
                >
                  <option value="" className="bg-card/95">
                    选择模板...
                  </option>
                  {promptTemplates.map((template) => (
                    <option key={template.id} value={template.id} className="bg-card/95">
                      {template.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-foreground/30 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            {promptTemplates.length === 0 && (
              <div className="text-[10px] text-foreground/40">
                暂无模板，请在 data/prompts 目录添加 .txt 文件
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-foreground/40">输出内容</label>
              <div className="text-[10px] text-foreground/60 bg-card/60 rounded-lg px-2 py-1.5 max-h-32 overflow-auto whitespace-pre-wrap">
                {node.data.templateOutput || '选择模板后显示内容'}
              </div>
            </div>
          </>
        )}

        {node.type === 'chat' && (
          <>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-foreground/40">聊天模型</label>
              <div className="relative">
                <select
                  value={node.data.chatModelId || ''}
                  onChange={(e) => onUpdateNodeData(node.id, { chatModelId: e.target.value })}
                  className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
                >
                  {chatModels.length === 0 ? (
                    <option value="" className="bg-card/95">
                      无可用模型
                    </option>
                  ) : (
                    chatModels.map((item) => (
                      <option key={item.id} value={item.id} className="bg-card/95">
                        {item.name} {item.supportsVision ? '(支持图片)' : ''}
                      </option>
                    ))
                  )}
                </select>
                <ChevronDown className="w-3 h-3 text-foreground/30 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {incomingSources.length > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-foreground/40">
                  <ImageIcon className="w-3 h-3 inline mr-1" />
                  输入图片 ({incomingSources.length})
                </label>
                <div className="flex flex-wrap gap-1">
                  {incomingSources.map((source) => (
                    <span
                      key={source.id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-card/70 text-foreground/60"
                    >
                      <Link2 className="w-3 h-3" />
                      {source.name}
                      <button
                        onClick={() => onRemoveEdge(source.id)}
                        className="text-foreground/40 hover:text-foreground"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-wider text-foreground/40">提示词</label>
                <span className="text-[10px] text-foreground/30">
                  {node.data.prompt.length}/{CHAT_MAX_LENGTH}
                </span>
              </div>
              <textarea
                value={node.data.prompt}
                onChange={(e) => {
                  if (e.target.value.length <= CHAT_MAX_LENGTH) {
                    onUpdateNodeData(node.id, { prompt: e.target.value });
                  }
                }}
                maxLength={CHAT_MAX_LENGTH}
                className="w-full h-20 px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground text-xs resize-none focus:outline-none focus:border-border"
                placeholder="输入聊天内容..."
              />
            </div>

            {node.data.errorMessage && (
              <div className="text-red-400 text-xs">{node.data.errorMessage}</div>
            )}

            <button
              onClick={() => onGenerate(node)}
              disabled={node.data.status === 'pending' || node.data.status === 'processing'}
              className={cn(
                'w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium transition',
                node.data.status === 'pending' || node.data.status === 'processing'
                  ? 'bg-card/70 text-foreground/50 cursor-not-allowed'
                  : 'bg-foreground text-background hover:bg-foreground/90'
              )}
            >
              {node.data.status === 'pending' || node.data.status === 'processing' ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  处理中...
                </>
              ) : (
                <>
                  <Send className="w-3 h-3" />
                  发送
                </>
              )}
            </button>

            {node.data.chatOutput && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-foreground/40">输出</label>
                <div className="text-[10px] text-foreground/60 bg-card/60 rounded-lg px-2 py-1.5 max-h-40 overflow-auto whitespace-pre-wrap">
                  {node.data.chatOutput}
                </div>
              </div>
            )}
          </>
        )}

        {(node.type === 'image' || node.type === 'video') && model && (
          <>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-foreground/40">模型</label>
              <div className="relative">
                <select
                  value={node.data.modelId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    if (node.type === 'image') {
                      const nextModel = imageModels.find((item) => item.id === nextId) || imageModels[0];
                      onUpdateNodeData(node.id, {
                        modelId: nextId,
                        aspectRatio: nextModel?.defaultAspectRatio || '1:1',
                        imageSize: nextModel?.defaultImageSize,
                      });
                      if (nextModel && !nextModel.features.imageToImage && incoming.length > 0) {
                        onRemoveIncomingEdges(node.id);
                      }
                    } else {
                      const nextModel = videoModels.find((item) => item.id === nextId) || videoModels[0];
                      onUpdateNodeData(node.id, {
                        modelId: nextId,
                        aspectRatio: nextModel?.defaultAspectRatio || 'landscape',
                        duration: nextModel?.defaultDuration || '8s',
                      });
                    }
                  }}
                  className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
                >
                  {(node.type === 'image' ? imageModels : videoModels).map((item) => (
                    <option key={item.id} value={item.id} className="bg-card/95">
                      {item.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-foreground/30 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-foreground/40">比例</label>
                <select
                  value={
                    node.data.aspectRatio ||
                    (model as SafeImageModel | SafeVideoModel)?.defaultAspectRatio ||
                    '1:1'
                  }
                  onChange={(e) => onUpdateNodeData(node.id, { aspectRatio: e.target.value })}
                  className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
                >
                  {node.type === 'image'
                    ? (model as SafeImageModel)?.aspectRatios?.map((ratio: string) => (
                        <option key={ratio} value={ratio} className="bg-card/95">
                          {ratio}
                        </option>
                      ))
                    : (model as SafeVideoModel)?.aspectRatios?.map((ratio: { value: string; label: string }) => (
                        <option key={ratio.value} value={ratio.value} className="bg-card/95">
                          {ratio.label}
                        </option>
                      ))}
                </select>
              </div>

              {node.type === 'image' ? (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-foreground/40">分辨率</label>
                  <select
                    value={node.data.imageSize || (model as SafeImageModel)?.defaultImageSize || '1K'}
                    onChange={(e) => onUpdateNodeData(node.id, { imageSize: e.target.value })}
                    disabled={!(model as SafeImageModel)?.features?.imageSize}
                    className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border disabled:opacity-40"
                  >
                    {(model as SafeImageModel)?.imageSizes?.map((size: string) => (
                      <option key={size} value={size} className="bg-card/95">
                        {size}
                      </option>
                    )) || (
                      <option value="1K" className="bg-card/95">
                        1K
                      </option>
                    )}
                  </select>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-foreground/40">时长</label>
                  <select
                    value={node.data.duration || (model as SafeVideoModel)?.defaultDuration || '8s'}
                    onChange={(e) => onUpdateNodeData(node.id, { duration: e.target.value })}
                    className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
                  >
                    {(model as SafeVideoModel)?.durations?.map((duration: { value: string; label: string }) => (
                      <option key={duration.value} value={duration.value} className="bg-card/95">
                        {duration.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {node.type === 'video' && !hasConnectedImage && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-foreground/40">参考图 (1张)</label>
                <div className="flex flex-wrap gap-1">
                  {(node.data.uploadedImages || []).slice(0, 1).map((img, idx) => (
                    <div key={idx} className="relative group">
                      <img src={img} alt="" className="w-12 h-12 rounded object-cover border border-border/70" />
                      <button
                        onClick={() => onUpdateNodeData(node.id, { uploadedImages: [] })}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-foreground text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {(!node.data.uploadedImages || node.data.uploadedImages.length === 0) && (
                    <label className="w-12 h-12 rounded border border-dashed border-border/70 flex items-center justify-center cursor-pointer hover:border-border transition">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const base64 = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result as string);
                            reader.readAsDataURL(file);
                          });
                          onUpdateNodeData(node.id, { uploadedImages: [base64] });
                          e.target.value = '';
                        }}
                      />
                      <ImageIcon className="w-4 h-4 text-foreground/30" />
                    </label>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-foreground/40">提示词</label>
              <textarea
                value={node.data.prompt}
                onChange={(e) => onUpdateNodeData(node.id, { prompt: e.target.value })}
                className="w-full h-20 px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground text-xs resize-none focus:outline-none focus:border-border"
                placeholder="描述生成内容"
              />
            </div>

            {incomingSources.length > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-foreground/40">输入</label>
                <div className="flex flex-wrap gap-1">
                  {incomingSources.map((source) => (
                    <span
                      key={source.id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-card/70 text-foreground/60"
                    >
                      <Link2 className="w-3 h-3" />
                      {source.name}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveEdge(source.id);
                        }}
                        className="text-foreground/40 hover:text-foreground"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {node.type === 'image' &&
              model &&
              (model as SafeImageModel).features.imageToImage &&
              !hasConnectedImage && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-foreground/40">
                    参考图 {(model as SafeImageModel).features.multipleImages ? '(可多张)' : '(1张)'}
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {(node.data.uploadedImages || []).map((img, idx) => (
                      <div key={idx} className="relative group">
                        <img src={img} alt="" className="w-12 h-12 rounded object-cover border border-border/70" />
                        <button
                          onClick={() => {
                            const newImages = [...(node.data.uploadedImages || [])];
                            newImages.splice(idx, 1);
                            onUpdateNodeData(node.id, { uploadedImages: newImages });
                          }}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-foreground text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <label className="w-12 h-12 rounded border border-dashed border-border/70 flex items-center justify-center cursor-pointer hover:border-border transition">
                      <input
                        type="file"
                        accept="image/*"
                        multiple={!!(model.features as { supportMultipleImages?: boolean }).supportMultipleImages}
                        className="hidden"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length === 0) return;
                          const supportsMultiple = !!(model.features as { supportMultipleImages?: boolean })
                            .supportMultipleImages;
                          const maxImages = supportsMultiple ? 10 : 1;
                          const currentImages = node.data.uploadedImages || [];
                          const newImages: string[] = [];
                          for (const file of files.slice(0, maxImages - currentImages.length)) {
                            const base64 = await new Promise<string>((resolve) => {
                              const reader = new FileReader();
                              reader.onload = () => resolve(reader.result as string);
                              reader.readAsDataURL(file);
                            });
                            newImages.push(base64);
                          }
                          onUpdateNodeData(node.id, {
                            uploadedImages: [...currentImages, ...newImages].slice(0, maxImages),
                          });
                          e.target.value = '';
                        }}
                      />
                      <ImageIcon className="w-4 h-4 text-foreground/30" />
                    </label>
                  </div>
                </div>
              )}

            {node.data.errorMessage && <div className="text-red-400 text-xs">{node.data.errorMessage}</div>}

            <button
              onClick={() => onGenerate(node)}
              disabled={node.data.status === 'pending' || node.data.status === 'processing'}
              className={cn(
                'w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium transition',
                node.data.status === 'pending' || node.data.status === 'processing'
                  ? 'bg-card/70 text-foreground/50 cursor-not-allowed'
                  : 'bg-foreground text-background hover:bg-foreground/90'
              )}
            >
              {node.data.status === 'pending' || node.data.status === 'processing' ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Wand2 className="w-3 h-3" />
                  生成
                </>
              )}
            </button>

            {node.data.outputUrl && (
              <div className="mt-2 space-y-2">
                {node.data.outputType === 'video' ? (
                  <video
                    key={`${node.data.generationId}-${node.data.outputUrl}`}
                    src={node.data.outputUrl}
                    controls
                    className="w-full rounded-lg border border-border/70"
                  />
                ) : (
                  <img
                    key={`${node.data.generationId}-${node.data.outputUrl}`}
                    src={node.data.outputUrl}
                    alt=""
                    className="w-full rounded-lg border border-border/70"
                  />
                )}
                <a
                  href={node.data.outputUrl}
                  download={`${node.name || 'output'}-${node.data.generationId || Date.now()}.${node.data.outputType === 'video' ? 'mp4' : 'png'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] text-foreground/60 hover:text-foreground bg-card/60 hover:bg-card/70 rounded-lg transition"
                >
                  <Download className="w-3 h-3" />
                  下载
                </a>
              </div>
            )}

            {node.data.revisedPrompt && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-foreground/40">改写提示词</label>
                <div className="text-[10px] text-foreground/60 bg-card/60 rounded-lg px-2 py-1.5 break-words max-h-24 overflow-auto">
                  {node.data.revisedPrompt}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
