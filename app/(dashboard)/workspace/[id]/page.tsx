'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Check,
  ChevronDown,
  Link2,
  Loader2,
  MousePointer2,
  Maximize2,
  RotateCcw,
  Save,
  Trash2,
  Wand2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import {
  IMAGE_MODELS,
  VIDEO_MODELS,
  buildSoraModelId,
  getImageModelById,
  getImageResolution,
  getVideoModelById,
  ImageModelConfig,
  VideoModelConfig,
} from '@/lib/model-config';
import type { CharacterCard, WorkspaceData, WorkspaceEdge, WorkspaceNode, WorkspaceNodeType } from '@/types';

const CANVAS_WIDTH = 2400;
const CANVAS_HEIGHT = 1400;
const NODE_WIDTH = 280;
const HANDLE_OFFSET_Y = 24;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;

type DragState = { id: string; offsetX: number; offsetY: number } | null;

export default function WorkspaceEditorPage() {
  const params = useParams();
  const workspaceId = params?.id as string;
  const { update } = useSession();
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const [workspaceName, setWorkspaceName] = useState('');
  const [nodes, setNodes] = useState<WorkspaceNode[]>([]);
  const [edges, setEdges] = useState<WorkspaceEdge[]>([]);
  const [characterCards, setCharacterCards] = useState<CharacterCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<DragState>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [hoveredCard, setHoveredCard] = useState<{
    nodeId: string;
    card: CharacterCard;
    x: number;
    y: number;
  } | null>(null);
  const nodesRef = useRef<WorkspaceNode[]>([]);
  const edgesRef = useRef<WorkspaceEdge[]>([]);

  const getCanvasPoint = useCallback(
    (event: PointerEvent | MouseEvent | React.PointerEvent<Element> | React.MouseEvent<Element>) => {
    const container = scrollRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const x = (event.clientX - rect.left + container.scrollLeft) / zoom;
    const y = (event.clientY - rect.top + container.scrollTop) / zoom;
    return { x, y };
    },
    [zoom]
  );

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const setNodesDirty = useCallback((updater: (prev: WorkspaceNode[]) => WorkspaceNode[]) => {
    setNodes((prev) => {
      const next = updater(prev);
      return next;
    });
    setDirty(true);
  }, []);

  const setEdgesDirty = useCallback((updater: (prev: WorkspaceEdge[]) => WorkspaceEdge[]) => {
    setEdges((prev) => {
      const next = updater(prev);
      return next;
    });
    setDirty(true);
  }, []);

  useEffect(() => {
    const loadWorkspace = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || '加载失败');
        }
        const workspace = data.data;
        setWorkspaceName(workspace.name || '未命名工作空间');
        const workspaceData: WorkspaceData = workspace.data || { nodes: [], edges: [] };
        setNodes(Array.isArray(workspaceData.nodes) ? workspaceData.nodes : []);
        setEdges(Array.isArray(workspaceData.edges) ? workspaceData.edges : []);
        setDirty(false);
      } catch (error) {
        toast({
          title: '加载失败',
          description: error instanceof Error ? error.message : '加载工作空间失败',
        });
      } finally {
        setLoading(false);
      }
    };

    if (workspaceId) {
      loadWorkspace();
    }
  }, [workspaceId]);

  useEffect(() => {
    const loadCharacterCards = async () => {
      try {
        const res = await fetch('/api/user/character-cards');
        if (!res.ok) return;
        const data = await res.json();
        const completedCards = (data.data || []).filter(
          (card: CharacterCard) => card.status === 'completed' && card.characterName
        );
        setCharacterCards(completedCards);
      } catch (error) {
        console.error('Failed to load character cards:', error);
      }
    };
    loadCharacterCards();
  }, []);

  useEffect(() => {
    return () => {
      abortControllersRef.current.forEach((controller) => controller.abort());
      abortControllersRef.current.clear();
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: workspaceName.trim() || '未命名工作空间',
          data: { nodes, edges },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '保存失败');
      }
      setDirty(false);
      toast({ title: '已保存' });
    } catch (error) {
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '保存失败',
      });
    } finally {
      setSaving(false);
    }
  };

  const createNode = useCallback(
    (type: WorkspaceNodeType, position: { x: number; y: number }) => {
      const id = crypto.randomUUID();
      if (type === 'image') {
        const model = IMAGE_MODELS[0];
        return {
          id,
          type,
          name: '图片生成',
          position,
          data: {
            modelId: model.id,
            aspectRatio: model.defaultAspectRatio,
            imageSize: model.defaultImageSize,
            prompt: '',
            status: 'idle',
          },
        } as WorkspaceNode;
      }
      const model = VIDEO_MODELS[0];
      return {
        id,
        type,
        name: '视频生成',
        position,
        data: {
          modelId: model.id,
          aspectRatio: model.defaultAspectRatio,
          duration: model.defaultDuration,
          prompt: '',
          status: 'idle',
        },
      } as WorkspaceNode;
    },
    []
  );

  const addNodeAt = useCallback(
    (type: WorkspaceNodeType, position: { x: number; y: number }) => {
      setNodesDirty((prev) => [...prev, createNode(type, position)]);
    },
    [createNode, setNodesDirty]
  );

  const handleCanvasContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const point = getCanvasPoint(event);
    setContextMenu(point);
  };

  const startDrag = (event: React.PointerEvent, node: WorkspaceNode) => {
    if (event.button !== 0) return;
    const point = getCanvasPoint(event);
    setDragging({
      id: node.id,
      offsetX: point.x - node.position.x,
      offsetY: point.y - node.position.y,
    });
    setContextMenu(null);
  };

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (dragging) {
        const point = getCanvasPoint(event);
        setNodesDirty((prev) =>
          prev.map((node) =>
            node.id === dragging.id
              ? {
                  ...node,
                  position: {
                    x: Math.max(0, point.x - dragging.offsetX),
                    y: Math.max(0, point.y - dragging.offsetY),
                  },
                }
              : node
          )
        );
      }
      if (connectingFrom) {
        setCursorPos(getCanvasPoint(event));
      }
    };
    const handleUp = () => {
      setDragging(null);
      setCursorPos(null);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [connectingFrom, dragging, getCanvasPoint, setNodesDirty]);

  const handleStartConnect = (nodeId: string) => {
    if (connectingFrom === nodeId) {
      setConnectingFrom(null);
      setCursorPos(null);
      return;
    }
    setConnectingFrom(nodeId);
    setCursorPos(null);
  };

  const handleFinishConnect = (nodeId: string) => {
    if (!connectingFrom || connectingFrom === nodeId) return;
    const fromNode = nodes.find((node) => node.id === connectingFrom);
    const toNode = nodes.find((node) => node.id === nodeId);
    if (!fromNode || !toNode) return;

    if (toNode.type === 'video') {
      if (fromNode.type !== 'image') {
        toast({ title: '仅支持图片节点连接视频节点' });
        setConnectingFrom(null);
        return;
      }
    } else if (toNode.type === 'image') {
      if (fromNode.type !== 'image') {
        toast({ title: '仅支持图片节点作为参考图' });
        setConnectingFrom(null);
        return;
      }
      const targetModel = getImageModelById(toNode.data.modelId) || IMAGE_MODELS[0];
      if (!targetModel.features.supportReferenceImage) {
        toast({ title: '该模型不支持参考图' });
        setConnectingFrom(null);
        return;
      }
    } else {
      setConnectingFrom(null);
      return;
    }

    setEdgesDirty((prev) => [
      ...prev.filter((edge) => edge.to !== nodeId),
      { id: `${fromNode.id}-${toNode.id}`, from: fromNode.id, to: toNode.id },
    ]);
    setConnectingFrom(null);
  };

  const clampZoom = useCallback((value: number) => {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(value.toFixed(2))));
  }, []);

  const handleZoomIn = () => setZoom((prev) => clampZoom(prev + ZOOM_STEP));
  const handleZoomOut = () => setZoom((prev) => clampZoom(prev - ZOOM_STEP));
  const handleZoomReset = () => setZoom(1);
  const handleZoomFit = () => {
    const container = scrollRef.current;
    if (!container) return;
    const padding = 80;
    const nextZoom = clampZoom(
      Math.min(
        (container.clientWidth - padding) / CANVAS_WIDTH,
        (container.clientHeight - padding) / CANVAS_HEIGHT
      )
    );
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!scrollRef.current) return;
        const scrollLeft = Math.max(0, (CANVAS_WIDTH * nextZoom - container.clientWidth) / 2);
        const scrollTop = Math.max(0, (CANVAS_HEIGHT * nextZoom - container.clientHeight) / 2);
        scrollRef.current.scrollLeft = scrollLeft;
        scrollRef.current.scrollTop = scrollTop;
      });
    });
  };

  const handleCanvasWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!event.altKey) return;
      event.preventDefault();
      const container = scrollRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      const canvasX = (container.scrollLeft + offsetX) / zoom;
      const canvasY = (container.scrollTop + offsetY) / zoom;
      const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      const nextZoom = clampZoom(zoom + delta);
      if (nextZoom === zoom) return;
      container.scrollLeft = canvasX * nextZoom - offsetX;
      container.scrollTop = canvasY * nextZoom - offsetY;
      setZoom(nextZoom);
    },
    [clampZoom, zoom]
  );

  const incomingEdges = useMemo(() => {
    const map = new Map<string, WorkspaceEdge[]>();
    edges.forEach((edge) => {
      if (!map.has(edge.to)) map.set(edge.to, []);
      map.get(edge.to)?.push(edge);
    });
    return map;
  }, [edges]);

  const updateNodeData = (id: string, partial: Partial<WorkspaceNode['data']>) => {
    setNodesDirty((prev) =>
      prev.map((node) =>
        node.id === id
          ? {
              ...node,
              data: { ...node.data, ...partial },
            }
          : node
      )
    );
  };

  const updateNode = (id: string, partial: Partial<WorkspaceNode>) => {
    setNodesDirty((prev) => prev.map((node) => (node.id === id ? { ...node, ...partial } : node)));
  };

  const removeNode = (id: string) => {
    setNodesDirty((prev) => prev.filter((node) => node.id !== id));
    setEdgesDirty((prev) => prev.filter((edge) => edge.from !== id && edge.to !== id));
  };

  const removeEdge = (edgeId: string) => {
    setEdgesDirty((prev) => prev.filter((edge) => edge.id !== edgeId));
  };

  const insertCharacterMention = useCallback(
    (nodeId: string, mention: string) => {
      setNodesDirty((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;
          const currentPrompt = node.data.prompt || '';
          if (currentPrompt.includes(mention)) return node;
          const nextPrompt = currentPrompt.trim()
            ? `${currentPrompt.trim()} ${mention}`
            : mention;
          return {
            ...node,
            data: {
              ...node.data,
              prompt: nextPrompt,
            },
          };
        })
      );
    },
    [setNodesDirty]
  );

  const pollTaskStatus = useCallback(
    async (nodeId: string, taskId: string) => {
      if (abortControllersRef.current.has(nodeId)) return;
      const controller = new AbortController();
      abortControllersRef.current.set(nodeId, controller);
      let attempts = 0;
      const maxAttempts = 240;

      const poll = async () => {
        if (controller.signal.aborted) return;
        if (attempts >= maxAttempts) {
          updateNodeData(nodeId, { status: 'failed', errorMessage: '任务超时' });
          abortControllersRef.current.delete(nodeId);
          return;
        }
        attempts += 1;
        try {
          const res = await fetch(`/api/generate/status/${taskId}`, {
            signal: controller.signal,
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || '查询任务状态失败');
          }
          const status = data.data.status as string;
          if (status === 'completed') {
            await update();
            updateNodeData(nodeId, {
              status: 'completed',
              outputUrl: data.data.url,
              outputType: data.data.type?.includes('video') ? 'video' : 'image',
              generationId: data.data.id,
              revisedPrompt: data.data.params?.revised_prompt,
              errorMessage: undefined,
            });
            abortControllersRef.current.delete(nodeId);
            toast({ title: '生成完成' });
          } else if (status === 'failed') {
            updateNodeData(nodeId, {
              status: 'failed',
              errorMessage: data.data.errorMessage || '生成失败',
            });
            abortControllersRef.current.delete(nodeId);
          } else {
            updateNodeData(nodeId, { status: status as WorkspaceNode['data']['status'] });
            setTimeout(poll, 10000);
          }
        } catch (error) {
          if ((error as Error).name === 'AbortError') return;
          updateNodeData(nodeId, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : '生成失败',
          });
          abortControllersRef.current.delete(nodeId);
        }
      };

      await poll();
    },
    [update]
  );

  const handleGenerateNode = async (node: WorkspaceNode) => {
    const basePrompt = node.data.prompt.trim();

    try {
      if (node.type === 'image') {
        const model = getImageModelById(node.data.modelId) || IMAGE_MODELS[0];
        const inputEdge = edgesRef.current.find((edge) => edge.to === node.id);
        const inputNode = inputEdge
          ? nodesRef.current.find((n) => n.id === inputEdge.from)
          : undefined;
        const referenceImageUrl = model.features.supportReferenceImage
          ? inputNode?.data.outputUrl
          : undefined;

        if (inputEdge && model.features.supportReferenceImage && !referenceImageUrl) {
          updateNodeData(node.id, { errorMessage: '请先生成上游图片', status: 'failed' });
          return;
        }
        if (model.requiresReferenceImage && !referenceImageUrl) {
          updateNodeData(node.id, { errorMessage: '该模型需要参考图', status: 'failed' });
          return;
        }
        if (!basePrompt && !model.allowEmptyPrompt) {
          updateNodeData(node.id, { errorMessage: '请输入提示词', status: 'failed' });
          return;
        }

        updateNodeData(node.id, { status: 'pending', errorMessage: undefined });
        let res: Response;
        if (model.provider === 'sora') {
          const size = getImageResolution(model, node.data.aspectRatio || model.defaultAspectRatio);
          const payload: Record<string, unknown> = {
            prompt: basePrompt,
            model: model.apiModel,
          };
          if (referenceImageUrl) {
            payload.referenceImageUrl = referenceImageUrl;
          }
          if (size) {
            payload.size = size;
          }
          res = await fetch('/api/generate/sora-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } else if (model.provider === 'gemini') {
          res = await fetch('/api/generate/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: model.apiModel,
              prompt: basePrompt,
              aspectRatio: node.data.aspectRatio || model.defaultAspectRatio,
              imageSize: model.features.supportImageSize ? node.data.imageSize : undefined,
              ...(referenceImageUrl ? { referenceImageUrl } : {}),
            }),
          });
        } else {
          const size = getImageResolution(model, node.data.aspectRatio || model.defaultAspectRatio);
          const payload: Record<string, unknown> = {
            prompt: basePrompt,
            model: model.apiModel,
            channel: model.channel,
            ...(model.channel === 'gitee' && { numInferenceSteps: 9 }),
          };
          if (referenceImageUrl) {
            payload.referenceImageUrl = referenceImageUrl;
          }
          if (size) {
            payload.size = size;
          }
          res = await fetch('/api/generate/zimage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        }

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || '生成失败');
        }
        updateNodeData(node.id, { generationId: data.data.id, status: 'pending' });
        pollTaskStatus(node.id, data.data.id);
      } else {
        if (!basePrompt) {
          updateNodeData(node.id, { errorMessage: '请输入提示词', status: 'failed' });
          return;
        }
        updateNodeData(node.id, { status: 'pending', errorMessage: undefined });
        const model = getVideoModelById(node.data.modelId) || VIDEO_MODELS[0];
        const taskModel = buildSoraModelId(
          node.data.aspectRatio || model.defaultAspectRatio,
          node.data.duration || model.defaultDuration
        );
        const inputEdge = edgesRef.current.find((edge) => edge.to === node.id);
        const inputNode = inputEdge
          ? nodesRef.current.find((n) => n.id === inputEdge.from)
          : undefined;
        const referenceImageUrl = inputNode?.data.outputUrl;

        const res = await fetch('/api/generate/sora', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: taskModel,
            prompt: basePrompt,
            ...(referenceImageUrl ? { referenceImageUrl } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || '生成失败');
        }
        updateNodeData(node.id, { generationId: data.data.id, status: 'pending' });
        pollTaskStatus(node.id, data.data.id);
      }
    } catch (error) {
      updateNodeData(node.id, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : '生成失败',
      });
    }
  };

  const waitForNodeStatus = useCallback(
    (nodeId: string, timeoutMs = 8 * 60 * 1000) =>
      new Promise<WorkspaceNode>((resolve, reject) => {
        const startedAt = Date.now();

        const check = () => {
          const node = nodesRef.current.find((item) => item.id === nodeId);
          if (!node) {
            reject(new Error('节点不存在'));
            return;
          }
          if (node.data.status === 'completed' && node.data.outputUrl) {
            resolve(node);
            return;
          }
          if (node.data.status === 'failed') {
            reject(new Error(node.data.errorMessage || '生成失败'));
            return;
          }
          if (Date.now() - startedAt >= timeoutMs) {
            reject(new Error('任务超时'));
            return;
          }
          if (
            (node.data.status === 'pending' || node.data.status === 'processing') &&
            node.data.generationId
          ) {
            pollTaskStatus(nodeId, node.data.generationId);
          }
          setTimeout(check, 1000);
        };

        check();
      }),
    [pollTaskStatus]
  );

  const ensureNodeReady = useCallback(
    async (nodeId: string, visited = new Set<string>()): Promise<void> => {
      if (visited.has(nodeId)) {
        throw new Error('检测到循环依赖');
      }
      visited.add(nodeId);

      const node = nodesRef.current.find((item) => item.id === nodeId);
      if (!node) {
        throw new Error('节点不存在');
      }

      const incoming = edgesRef.current.find((edge) => edge.to === nodeId);
      if (incoming) {
        await ensureNodeReady(incoming.from, visited);
      }

      const latest = nodesRef.current.find((item) => item.id === nodeId);
      if (!latest) {
        throw new Error('节点不存在');
      }

      if (latest.data.status === 'completed' && latest.data.outputUrl) {
        return;
      }
      if (latest.data.status === 'pending' || latest.data.status === 'processing') {
        await waitForNodeStatus(nodeId);
        return;
      }
      if (latest.type === 'image') {
        await handleGenerateNode(latest);
        await waitForNodeStatus(nodeId);
      }
    },
    [handleGenerateNode, waitForNodeStatus]
  );

  const handleGenerateVideo = async (node: WorkspaceNode) => {
    const inputEdge = edgesRef.current.find((edge) => edge.to === node.id);
    if (inputEdge) {
      try {
        await ensureNodeReady(inputEdge.from, new Set([node.id]));
      } catch (error) {
        updateNodeData(node.id, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : '上游节点生成失败',
        });
        return;
      }
    }
    await handleGenerateNode(node);
  };

  const edgePaths = useMemo(() => {
    return edges
      .map((edge) => {
        const fromNode = nodes.find((node) => node.id === edge.from);
        const toNode = nodes.find((node) => node.id === edge.to);
        if (!fromNode || !toNode) return null;
        const x1 = fromNode.position.x + NODE_WIDTH;
        const y1 = fromNode.position.y + HANDLE_OFFSET_Y;
        const x2 = toNode.position.x;
        const y2 = toNode.position.y + HANDLE_OFFSET_Y;
        const dx = Math.max(80, Math.abs(x2 - x1) * 0.5);
        return {
          id: edge.id,
          d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
        };
      })
      .filter(Boolean) as Array<{ id: string; d: string }>;
  }, [edges, nodes]);

  const previewPath = useMemo(() => {
    if (!connectingFrom || !cursorPos) return null;
    const fromNode = nodes.find((node) => node.id === connectingFrom);
    if (!fromNode) return null;
    const x1 = fromNode.position.x + NODE_WIDTH;
    const y1 = fromNode.position.y + HANDLE_OFFSET_Y;
    const x2 = cursorPos.x;
    const y2 = cursorPos.y;
    const dx = Math.max(80, Math.abs(x2 - x1) * 0.5);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }, [connectingFrom, cursorPos, nodes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-white/50">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        加载中...
      </div>
    );
  }

  return (
    <div className="h-full w-full min-w-0 flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between min-w-0">
        <div className="flex flex-col gap-2">
          <input
            value={workspaceName}
            onChange={(e) => {
              setWorkspaceName(e.target.value);
              setDirty(true);
            }}
            className="text-2xl font-light text-white bg-transparent border border-white/10 rounded-lg px-3 py-2 w-full max-w-md focus:outline-none focus:border-white/30"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition shrink-0',
            dirty
              ? 'bg-white text-black hover:bg-white/90'
              : 'bg-white/10 text-white/40 cursor-not-allowed'
          )}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          保存
        </button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex-1 min-h-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 text-white/60 text-sm">
          <div className="flex items-center gap-3">
            <MousePointer2 className="w-4 h-4" />
            右键添加节点，拖拽布局，点击节点右侧圆点开始连线（Alt/Option + 滚轮缩放）
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleZoomOut}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/40 transition"
              title="缩小"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="w-14 text-center text-xs text-white/50">{Math.round(zoom * 100)}%</div>
            <button
              onClick={handleZoomIn}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/40 transition"
              title="放大"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomFit}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/40 transition"
              title="适配视图"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomReset}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/40 transition"
              title="还原缩放"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div
          ref={scrollRef}
          className="relative h-full overflow-auto"
          onWheel={handleCanvasWheel}
          onContextMenu={handleCanvasContextMenu}
          onClick={(event) => {
            setContextMenu(null);
            const target = event.target as HTMLElement | null;
            if (target?.closest('[data-workspace-node]')) return;
            setConnectingFrom(null);
            setCursorPos(null);
          }}
        >
          <div
            className="relative"
            style={{ width: CANVAS_WIDTH * zoom, height: CANVAS_HEIGHT * zoom }}
          >
            <div
              className="absolute inset-0"
              style={{
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
              }}
            >
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {edgePaths.map((edge) => (
                  <path
                    key={edge.id}
                    d={edge.d}
                    stroke="rgba(255,255,255,0.4)"
                    strokeWidth="2"
                    fill="none"
                  />
                ))}
                {previewPath && (
                  <path
                    d={previewPath}
                    stroke="rgba(255,255,255,0.25)"
                    strokeWidth="2"
                    fill="none"
                    strokeDasharray="6 6"
                  />
                )}
              </svg>

              {nodes.map((node) => {
                const model =
                  node.type === 'image'
                    ? getImageModelById(node.data.modelId) || IMAGE_MODELS[0]
                    : getVideoModelById(node.data.modelId) || VIDEO_MODELS[0];
              const incoming = incomingEdges.get(node.id) || [];
              const supportsReferenceInput =
                node.type === 'image' &&
                (model as typeof IMAGE_MODELS[number]).features.supportReferenceImage;
              const showInputHandle = node.type === 'video' || supportsReferenceInput;
              const showOutputHandle = node.type === 'image';
              return (
                  <div
                    key={node.id}
                    data-workspace-node
                    className="absolute w-72 bg-black/60 border border-white/15 rounded-xl shadow-lg"
                    style={{ left: node.position.x, top: node.position.y }}
                  >
                  <div
                    onPointerDown={(event) => startDrag(event, node)}
                    className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5 rounded-t-xl cursor-grab"
                  >
                    <input
                      value={node.name}
                      onChange={(e) => updateNode(node.id, { name: e.target.value })}
                      onPointerDown={(event) => event.stopPropagation()}
                      className="text-sm text-white/90 bg-transparent focus:outline-none flex-1"
                    />
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          node.type === 'video' ? handleGenerateVideo(node) : handleGenerateNode(node)
                        }
                        onPointerDown={(event) => event.stopPropagation()}
                        disabled={node.data.status === 'pending' || node.data.status === 'processing'}
                        className={cn(
                          'text-white/40 hover:text-white transition',
                          (node.data.status === 'pending' || node.data.status === 'processing') &&
                            'opacity-40 cursor-not-allowed'
                        )}
                        title="重新生成"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeNode(node.id)}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="text-white/40 hover:text-red-400 transition"
                        title="删除节点"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {showInputHandle && (
                    <button
                      onClick={() => handleFinishConnect(node.id)}
                      className="absolute -left-2 top-[18px] w-4 h-4 rounded-full border border-white/30 bg-black hover:bg-white/10"
                      title="输入"
                    />
                  )}
                  {showOutputHandle && (
                    <button
                      onClick={() => handleStartConnect(node.id)}
                      className={cn(
                        'absolute -right-2 top-[18px] w-4 h-4 rounded-full border border-white/30',
                        connectingFrom === node.id ? 'bg-white' : 'bg-black hover:bg-white/10'
                      )}
                      title="输出"
                    />
                  )}

                  <div className="p-3 space-y-3 text-xs text-white/70">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-white/40">模型</label>
                      <div className="relative">
                        <select
                          value={node.data.modelId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            if (node.type === 'image') {
                              const nextModel = getImageModelById(nextId) || IMAGE_MODELS[0];
                              updateNodeData(node.id, {
                                modelId: nextId,
                                aspectRatio: nextModel.defaultAspectRatio,
                                imageSize: nextModel.defaultImageSize,
                              });
                              if (!nextModel.features.supportReferenceImage) {
                                const hasIncoming = edges.some((edge) => edge.to === node.id);
                                if (hasIncoming) {
                                  setEdgesDirty((prev) => prev.filter((edge) => edge.to !== node.id));
                                  toast({ title: '该模型不支持参考图，已移除引用' });
                                }
                              }
                            } else {
                              const nextModel = getVideoModelById(nextId) || VIDEO_MODELS[0];
                              updateNodeData(node.id, {
                                modelId: nextId,
                                aspectRatio: nextModel.defaultAspectRatio,
                                duration: nextModel.defaultDuration,
                              });
                            }
                          }}
                          className="w-full px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30"
                        >
                          {(node.type === 'image' ? IMAGE_MODELS : VIDEO_MODELS).map((item) => (
                            <option key={item.id} value={item.id} className="bg-black">
                              {item.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3 h-3 text-white/30 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-white/40">比例</label>
                        <select
                          value={node.data.aspectRatio || model.defaultAspectRatio}
                          onChange={(e) => updateNodeData(node.id, { aspectRatio: e.target.value })}
                          className="w-full px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30"
                        >
                          {node.type === 'image'
                            ? (model as typeof IMAGE_MODELS[number]).aspectRatios.map((ratio) => (
                                <option key={ratio} value={ratio} className="bg-black">
                                  {ratio}
                                </option>
                              ))
                            : (model as typeof VIDEO_MODELS[number]).aspectRatios.map((ratio) => (
                                <option key={ratio.value} value={ratio.value} className="bg-black">
                                  {ratio.label}
                                </option>
                              ))}
                        </select>
                      </div>

                      {node.type === 'image' ? (
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-white/40">分辨率</label>
                          <select
                            value={node.data.imageSize || (model as ImageModelConfig).defaultImageSize || '1K'}
                            onChange={(e) => updateNodeData(node.id, { imageSize: e.target.value })}
                            disabled={!(model as ImageModelConfig).features.supportImageSize}
                            className="w-full px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30 disabled:opacity-40"
                          >
                            {(model as typeof IMAGE_MODELS[number]).imageSizes?.map((size) => (
                              <option key={size} value={size} className="bg-black">
                                {size}
                              </option>
                            )) || (
                              <option value="1K" className="bg-black">
                                1K
                              </option>
                            )}
                          </select>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-white/40">时长</label>
                          <select
                            value={node.data.duration || (model as VideoModelConfig).defaultDuration}
                            onChange={(e) => updateNodeData(node.id, { duration: e.target.value })}
                            className="w-full px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30"
                          >
                            {(model as typeof VIDEO_MODELS[number]).durations.map((duration) => (
                              <option key={duration.value} value={duration.value} className="bg-black">
                                {duration.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {node.type === 'video' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] uppercase tracking-wider text-white/40">角色卡</label>
                          <span className="text-[10px] text-white/30">
                            {characterCards.length} 个
                          </span>
                        </div>
                        {characterCards.length === 0 ? (
                          <div className="text-[10px] text-white/30">暂无角色卡</div>
                        ) : (
                          <>
                            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-auto pr-1">
                              {characterCards.map((card) => {
                                const mention = `@${card.characterName}`;
                                return (
                                  <button
                                    key={card.id}
                                    type="button"
                                    onClick={() => insertCharacterMention(node.id, mention)}
                                    onMouseEnter={(event) => {
                                      const target = event.currentTarget as HTMLElement;
                                      const nodeEl = target.closest('[data-workspace-node]') as HTMLElement | null;
                                      if (!nodeEl) return;
                                      const nodeRect = nodeEl.getBoundingClientRect();
                                      const targetRect = target.getBoundingClientRect();
                                      setHoveredCard({
                                        nodeId: node.id,
                                        card,
                                        x: targetRect.left - nodeRect.left,
                                        y: targetRect.top - nodeRect.top,
                                      });
                                    }}
                                    onMouseLeave={() => {
                                      setHoveredCard((prev) =>
                                        prev?.card.id === card.id ? null : prev
                                      );
                                    }}
                                    className="px-2 py-1 rounded-full border border-white/10 text-[10px] text-white/70 hover:text-white hover:border-white/30 transition"
                                    title="点击插入到提示词"
                                  >
                                    {mention}
                                  </button>
                                );
                              })}
                            </div>
                            {hoveredCard && hoveredCard.nodeId === node.id && (
                              <div
                                className="pointer-events-none absolute z-30 rounded-lg border border-white/20 bg-black/80 p-1 shadow-xl"
                                style={{
                                  left: hoveredCard.x,
                                  top: hoveredCard.y,
                                  transform: 'translate(-8px, calc(-100% - 8px))',
                                }}
                              >
                                {hoveredCard.card.avatarUrl ? (
                                  <img
                                    src={hoveredCard.card.avatarUrl}
                                    alt={hoveredCard.card.characterName}
                                    className="h-20 w-20 rounded-md object-cover"
                                  />
                                ) : (
                                  <div className="h-20 w-20 rounded-md bg-white/10" />
                                )}
                                <div className="mt-1 text-[10px] text-white/50 truncate w-20">
                                  @{hoveredCard.card.characterName}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        <div className="text-[10px] text-white/20">点击名称插入到提示词</div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-white/40">提示词</label>
                      <textarea
                        value={node.data.prompt}
                        onChange={(e) => updateNodeData(node.id, { prompt: e.target.value })}
                        className="w-full h-20 px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-xs resize-none focus:outline-none focus:border-white/30"
                        placeholder="描述生成内容"
                      />
                    </div>

                    {incoming.length > 0 && (
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-white/40">输入</label>
                        <div className="flex flex-wrap gap-1">
                          {incoming.map((edge) => {
                            const fromNode = nodes.find((n) => n.id === edge.from);
                            return (
                              <span
                                key={edge.id}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 text-white/60"
                              >
                                <Link2 className="w-3 h-3" />
                                {fromNode?.name || '图片节点'}
                                <button
                                  onClick={() => removeEdge(edge.id)}
                                  className="text-white/40 hover:text-white"
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {node.data.errorMessage && (
                      <div className="text-red-400 text-xs">{node.data.errorMessage}</div>
                    )}

                    <button
                      onClick={() => (node.type === 'video' ? handleGenerateVideo(node) : handleGenerateNode(node))}
                      disabled={node.data.status === 'pending' || node.data.status === 'processing'}
                      className={cn(
                        'w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium transition',
                        node.data.status === 'pending' || node.data.status === 'processing'
                          ? 'bg-white/10 text-white/50 cursor-not-allowed'
                          : 'bg-white text-black hover:bg-white/90'
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
                      <div className="mt-2">
                        {node.data.outputType === 'video' ? (
                          <video
                            key={`${node.data.generationId}-${node.data.outputUrl}`}
                            src={node.data.outputUrl}
                            controls
                            className="w-full rounded-lg border border-white/10"
                          />
                        ) : (
                          <img
                            key={`${node.data.generationId}-${node.data.outputUrl}`}
                            src={`${node.data.outputUrl}${node.data.outputUrl.includes('?') ? '&' : '?'}_t=${node.data.generationId || Date.now()}`}
                            alt=""
                            className="w-full rounded-lg border border-white/10"
                          />
                        )}
                      </div>
                    )}

                    {node.data.revisedPrompt && (
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-white/40">改写提示词</label>
                        <div className="text-[10px] text-white/60 bg-white/5 rounded-lg px-2 py-1.5 break-words">
                          {node.data.revisedPrompt}
                        </div>
                      </div>
                    )}
                  </div>
                  </div>
                );
              })}

              {contextMenu && (
                <div
                  className="absolute z-20 bg-black border border-white/10 rounded-lg shadow-xl p-2 text-sm text-white/80"
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                  <button
                    onClick={() => {
                      addNodeAt('image', contextMenu);
                      setContextMenu(null);
                    }}
                    className="block w-full text-left px-3 py-2 rounded hover:bg-white/10"
                  >
                    添加图片节点
                  </button>
                  <button
                    onClick={() => {
                      addNodeAt('video', contextMenu);
                      setContextMenu(null);
                    }}
                    className="block w-full text-left px-3 py-2 rounded hover:bg-white/10"
                  >
                    添加视频节点
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {connectingFrom && (
        <div className="text-xs text-white/40 flex items-center gap-2">
          <Check className="w-3 h-3" />
          点击目标节点左侧圆点完成连线
        </div>
      )}
    </div>
  );
}
