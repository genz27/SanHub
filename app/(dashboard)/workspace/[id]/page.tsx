'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Check,
  ChevronDown,
  Download,
  Link2,
  Loader2,
  MousePointer2,
  Plus,
  Video,
  Maximize2,
  RotateCcw,
  Save,
  Trash2,
  Wand2,
  ZoomIn,
  ZoomOut,
  MessageSquare,
  FileText,
  Send,
  Image as ImageIcon,
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import type { CharacterCard, WorkspaceData, WorkspaceEdge, WorkspaceNode, WorkspaceNodeType, ChatModel, SafeImageModel, SafeVideoModel } from '@/types';

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
}

// 获取图像分辨率
function getImageResolution(
  model: SafeImageModel,
  aspectRatio: string,
  imageSize?: string
): string {
  if (model.features.imageSize && imageSize && typeof model.resolutions[imageSize] === 'object') {
    return (model.resolutions[imageSize] as Record<string, string>)[aspectRatio] || '';
  }
  return (model.resolutions as Record<string, string>)[aspectRatio] || '';
}

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
}

const CHAT_MAX_LENGTH = 2000;

const MOBILE_NODE_OPTIONS: Array<{
  type: WorkspaceNodeType;
  label: string;
  icon: typeof ImageIcon;
}> = [
  { type: 'image', label: 'Image', icon: ImageIcon },
  { type: 'video', label: 'Video', icon: Video },
  { type: 'chat', label: 'Chat', icon: MessageSquare },
  { type: 'prompt-template', label: 'Template', icon: FileText },
];

const BASE_CANVAS_WIDTH = 2400;
const BASE_CANVAS_HEIGHT = 1400;
const CANVAS_PADDING = 400; // Extra space beyond nodes
const NODE_WIDTH = 280;
const NODE_HEIGHT = 400; // Approximate node height
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
  const [mobileAddOpen, setMobileAddOpen] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<{
    nodeId: string;
    card: CharacterCard;
    x: number;
    y: number;
  } | null>(null);
  const [chatModels, setChatModels] = useState<ChatModel[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [imageModels, setImageModels] = useState<SafeImageModel[]>([]);
  const [videoModels, setVideoModels] = useState<SafeVideoModel[]>([]);
  const nodesRef = useRef<WorkspaceNode[]>([]);
  const edgesRef = useRef<WorkspaceEdge[]>([]);

  // Dynamic canvas size based on node positions
  const canvasSize = useMemo(() => {
    if (nodes.length === 0) {
      return { width: BASE_CANVAS_WIDTH, height: BASE_CANVAS_HEIGHT };
    }
    
    let maxX = 0;
    let maxY = 0;
    
    for (const node of nodes) {
      const nodeRight = node.position.x + NODE_WIDTH;
      const nodeBottom = node.position.y + NODE_HEIGHT;
      if (nodeRight > maxX) maxX = nodeRight;
      if (nodeBottom > maxY) maxY = nodeBottom;
    }
    
    return {
      width: Math.max(BASE_CANVAS_WIDTH, maxX + CANVAS_PADDING),
      height: Math.max(BASE_CANVAS_HEIGHT, maxY + CANVAS_PADDING),
    };
  }, [nodes]);

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

  const getViewportCenter = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return { x: 0, y: 0 };
    return {
      x: (container.scrollLeft + container.clientWidth / 2) / zoom,
      y: (container.scrollTop + container.clientHeight / 2) / zoom,
    };
  }, [zoom]);

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

  // Track if polling recovery has been done for this workspace load
  const pollingRecoveredRef = useRef(false);

  useEffect(() => {
    const loadWorkspace = async () => {
      setLoading(true);
      pollingRecoveredRef.current = false; // Reset on new load
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
    const loadChatModels = async () => {
      try {
        const res = await fetch('/api/chat/models');
        if (!res.ok) return;
        const data = await res.json();
        setChatModels((data.data || []).filter((m: ChatModel) => m.enabled));
      } catch (error) {
        console.error('Failed to load chat models:', error);
      }
    };
    loadChatModels();
  }, []);

  useEffect(() => {
    const loadImageModels = async () => {
      try {
        const res = await fetch('/api/image-models');
        if (!res.ok) return;
        const data = await res.json();
        setImageModels(data.data?.models || []);
      } catch (error) {
        console.error('Failed to load image models:', error);
      }
    };
    loadImageModels();
  }, []);

  useEffect(() => {
    const loadVideoModels = async () => {
      try {
        const res = await fetch('/api/video-models');
        if (!res.ok) return;
        const data = await res.json();
        setVideoModels(data.data?.models || []);
      } catch (error) {
        console.error('Failed to load video models:', error);
      }
    };
    loadVideoModels();
  }, []);

  useEffect(() => {
    const loadPromptTemplates = async () => {
      try {
        const res = await fetch('/api/prompts');
        if (!res.ok) return;
        const data = await res.json();
        setPromptTemplates(data.data || []);
      } catch (error) {
        console.error('Failed to load prompt templates:', error);
      }
    };
    loadPromptTemplates();
  }, []);

  useEffect(() => {
    const abortControllers = abortControllersRef.current;
    return () => {
      abortControllers.forEach((controller) => controller.abort());
      abortControllers.clear();
    };
  }, [setNodesDirty]);

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
        const model = imageModels[0];
        return {
          id,
          type,
          name: '图片生成',
          position,
          data: {
            modelId: model?.id || '',
            aspectRatio: model?.defaultAspectRatio || '1:1',
            imageSize: model?.defaultImageSize,
            prompt: '',
            status: 'idle',
          },
        } as WorkspaceNode;
      }
      if (type === 'video') {
        const model = videoModels[0];
        return {
          id,
          type,
          name: '视频生成',
          position,
          data: {
            modelId: model?.id || '',
            aspectRatio: model?.defaultAspectRatio || 'landscape',
            duration: model?.defaultDuration || '10s',
            prompt: '',
            status: 'idle',
          },
        } as WorkspaceNode;
      }
      if (type === 'chat') {
        return {
          id,
          type,
          name: '聊天节点',
          position,
          data: {
            prompt: '',
            chatModelId: chatModels[0]?.id || '',
            chatMessages: [],
            chatOutput: '',
            inputImages: [],
            status: 'idle',
          },
        } as WorkspaceNode;
      }
      // prompt-template
      return {
        id,
        type,
        name: '提示词模板',
        position,
        data: {
          prompt: '',
          templateId: '',
          templateOutput: '',
          status: 'idle',
        },
      } as WorkspaceNode;
    },
    [chatModels, imageModels, videoModels]
  );

  const addNodeAt = useCallback(
    (type: WorkspaceNodeType, position: { x: number; y: number }) => {
      setNodesDirty((prev) => [...prev, createNode(type, position)]);
    },
    [createNode, setNodesDirty]
  );

  const handleAddNodeAtCenter = useCallback(
    (type: WorkspaceNodeType) => {
      const point = getViewportCenter();
      addNodeAt(type, point);
      setMobileAddOpen(false);
      setContextMenu(null);
    },
    [addNodeAt, getViewportCenter]
  );

  const handleCanvasContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (window.innerWidth < 640) {
      return;
    }
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

    // Connection rules:
    // - chat node: can receive from image nodes (multiple), output to image/video nodes
    // - prompt-template node: no input, output to image/video/chat nodes
    // - image node: can receive from image/chat/prompt-template nodes
    // - video node: can receive from image/chat/prompt-template nodes

    if (toNode.type === 'video') {
      if (fromNode.type !== 'image' && fromNode.type !== 'chat' && fromNode.type !== 'prompt-template') {
        toast({ title: '视频节点仅支持图片、聊天或模板节点连接' });
        setConnectingFrom(null);
        return;
      }
    } else if (toNode.type === 'image') {
      if (fromNode.type !== 'image' && fromNode.type !== 'chat' && fromNode.type !== 'prompt-template') {
        toast({ title: '图片节点仅支持图片、聊天或模板节点连接' });
        setConnectingFrom(null);
        return;
      }
      if (fromNode.type === 'image') {
        const targetModel = imageModels.find(m => m.id === toNode.data.modelId) || imageModels[0];
        if (targetModel && !targetModel.features.imageToImage) {
          toast({ title: '该模型不支持参考图' });
          setConnectingFrom(null);
          return;
        }
      }
    } else if (toNode.type === 'chat') {
      // Chat node can receive from image nodes (for vision) or prompt-template nodes
      if (fromNode.type !== 'image' && fromNode.type !== 'prompt-template') {
        toast({ title: '聊天节点仅支持图片或模板节点连接' });
        setConnectingFrom(null);
        return;
      }
    } else if (toNode.type === 'prompt-template') {
      // Prompt template node has no input
      toast({ title: '提示词模板节点不支持输入连接' });
      setConnectingFrom(null);
      return;
    } else {
      setConnectingFrom(null);
      return;
    }

    // For chat nodes, allow multiple inputs from image nodes
    if (toNode.type === 'chat' && fromNode.type === 'image') {
      // Check if this edge already exists
      const existingEdge = edges.find((e) => e.from === fromNode.id && e.to === toNode.id);
      if (existingEdge) {
        toast({ title: '该连接已存在' });
        setConnectingFrom(null);
        return;
      }
      setEdgesDirty((prev) => [
        ...prev,
        { id: `${fromNode.id}-${toNode.id}`, from: fromNode.id, to: toNode.id },
      ]);
    } else if ((toNode.type === 'image' || toNode.type === 'video') && (fromNode.type === 'chat' || fromNode.type === 'prompt-template')) {
      // Prompt/chat connection: replace only prompt/chat connections, keep image connections
      setEdgesDirty((prev) => [
        ...prev.filter((edge) => {
          if (edge.to !== nodeId) return true;
          const sourceNode = nodes.find((n) => n.id === edge.from);
          return sourceNode?.type === 'image'; // Keep image connections
        }),
        { id: `${fromNode.id}-${toNode.id}`, from: fromNode.id, to: toNode.id },
      ]);
    } else if ((toNode.type === 'image' || toNode.type === 'video') && fromNode.type === 'image') {
      // Image connection: replace only image connections, keep prompt/chat connections
      setEdgesDirty((prev) => [
        ...prev.filter((edge) => {
          if (edge.to !== nodeId) return true;
          const sourceNode = nodes.find((n) => n.id === edge.from);
          return sourceNode?.type !== 'image'; // Keep non-image connections
        }),
        { id: `${fromNode.id}-${toNode.id}`, from: fromNode.id, to: toNode.id },
      ]);
    } else {
      // For other connections, replace existing input of same type
      setEdgesDirty((prev) => [
        ...prev.filter((edge) => edge.to !== nodeId),
        { id: `${fromNode.id}-${toNode.id}`, from: fromNode.id, to: toNode.id },
      ]);
    }
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
        (container.clientWidth - padding) / canvasSize.width,
        (container.clientHeight - padding) / canvasSize.height
      )
    );
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!scrollRef.current) return;
        const scrollLeft = Math.max(0, (canvasSize.width * nextZoom - container.clientWidth) / 2);
        const scrollTop = Math.max(0, (canvasSize.height * nextZoom - container.clientHeight) / 2);
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

  const updateNodeData = useCallback((id: string, partial: Partial<WorkspaceNode['data']>) => {
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
  }, [setNodesDirty]);

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
      let consecutiveErrors = 0;
      const maxAttempts = 240;
      const maxConsecutiveErrors = 5;

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
          // Reset error counter on success
          consecutiveErrors = 0;
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
          consecutiveErrors += 1;
          const errMsg = error instanceof Error ? error.message : '网络错误';
          // Retry on transient network errors (socket closed, timeout, etc.)
          const isTransientError =
            errMsg.includes('socket') ||
            errMsg.includes('Socket') ||
            errMsg.includes('ECONNRESET') ||
            errMsg.includes('ETIMEDOUT') ||
            errMsg.includes('network') ||
            errMsg.includes('fetch');
          if (isTransientError && consecutiveErrors < maxConsecutiveErrors) {
            console.warn(`[Poll] Transient error (${consecutiveErrors}/${maxConsecutiveErrors}), retrying...`, errMsg);
            // Exponential backoff: 5s, 10s, 20s, 40s...
            const delay = Math.min(5000 * Math.pow(2, consecutiveErrors - 1), 60000);
            setTimeout(poll, delay);
            return;
          }
          updateNodeData(nodeId, {
            status: 'failed',
            errorMessage: errMsg,
          });
          abortControllersRef.current.delete(nodeId);
        }
      };

      await poll();
    },
    [update, updateNodeData]
  );

  // Recover polling for pending/processing nodes on workspace load
  useEffect(() => {
    if (loading || pollingRecoveredRef.current) return;
    
    const pendingNodes = nodes.filter(
      (node) =>
        (node.type === 'image' || node.type === 'video') &&
        (node.data.status === 'pending' || node.data.status === 'processing') &&
        node.data.generationId
    );

    if (pendingNodes.length > 0) {
      pollingRecoveredRef.current = true;
      pendingNodes.forEach((node) => {
        pollTaskStatus(node.id, node.data.generationId!);
      });
    }
  }, [loading, nodes, pollTaskStatus]);

  const handleGenerateNode = useCallback(async (node: WorkspaceNode) => {
    // Get prompt from node itself or from connected chat/template node
    let basePrompt = node.data.prompt.trim();
    
    // Check for connected chat or prompt-template node to get prompt
    const inputEdge = edgesRef.current.find((edge) => edge.to === node.id);
    if (inputEdge) {
      const inputNode = nodesRef.current.find((n) => n.id === inputEdge.from);
      if (inputNode?.type === 'chat' && inputNode.data.chatOutput) {
        // Use chat output as prompt if no prompt is set
        if (!basePrompt) {
          basePrompt = inputNode.data.chatOutput.trim();
        }
      } else if (inputNode?.type === 'prompt-template' && inputNode.data.templateOutput) {
        // Use template output as prompt if no prompt is set
        if (!basePrompt) {
          basePrompt = inputNode.data.templateOutput.trim();
        }
      }
    }

    try {
      if (node.type === 'image') {
        const model = imageModels.find(m => m.id === node.data.modelId) || imageModels[0];
        if (!model) {
          updateNodeData(node.id, { errorMessage: '无可用模型', status: 'failed' });
          return;
        }
        
        const imageInputEdge = edgesRef.current.find((edge) => edge.to === node.id);
        const imageInputNode = imageInputEdge
          ? nodesRef.current.find((n) => n.id === imageInputEdge.from && n.type === 'image')
          : undefined;
        
        // Use connected image output, or uploaded images if no connection
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
          updateNodeData(node.id, { errorMessage: '请先生成上游图片', status: 'failed' });
          return;
        }
        if (model.requiresReferenceImage && !referenceImageUrl && !referenceImages) {
          updateNodeData(node.id, { errorMessage: '该模型需要参考图', status: 'failed' });
          return;
        }
        if (!basePrompt && !model.allowEmptyPrompt) {
          updateNodeData(node.id, { errorMessage: '请输入提示词', status: 'failed' });
          return;
        }

        updateNodeData(node.id, { status: 'pending', errorMessage: undefined });
        
        // 使用统一的图像生成 API
        const res = await fetch('/api/generate/image', {
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
        updateNodeData(node.id, { generationId: data.data.id, status: 'pending' });
        pollTaskStatus(node.id, data.data.id);
      } else {
        // Video generation
        if (!basePrompt) {
          updateNodeData(node.id, { errorMessage: '请输入提示词', status: 'failed' });
          return;
        }
        updateNodeData(node.id, { status: 'pending', errorMessage: undefined });
        
        const model = videoModels.find(m => m.id === node.data.modelId) || videoModels[0];
        const taskModel = `sora-video-${node.data.aspectRatio || model?.defaultAspectRatio || 'landscape'}-${node.data.duration || model?.defaultDuration || '10s'}`;
        
        // Find image input node for reference image
        const videoInputEdge = edgesRef.current.find((edge) => edge.to === node.id);
        const videoInputNode = videoInputEdge
          ? nodesRef.current.find((n) => n.id === videoInputEdge.from && n.type === 'image')
          : undefined;
        
        let referenceImageUrl = videoInputNode?.data.outputUrl;
        if (!referenceImageUrl && node.data.uploadedImages && node.data.uploadedImages.length > 0) {
          referenceImageUrl = node.data.uploadedImages[0];
        }

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
  }, [imageModels, pollTaskStatus, updateNodeData, videoModels]);

  const handleChatGenerate = async (node: WorkspaceNode) => {
    let prompt = node.data.prompt.trim();
    if (!node.data.chatModelId) {
      updateNodeData(node.id, { errorMessage: '请选择聊天模型', status: 'failed' });
      return;
    }

    // Collect inputs from connected nodes
    const inputEdges = edgesRef.current.filter((edge) => edge.to === node.id);
    const inputImages: string[] = [];
    let templateContent = '';
    
    for (const edge of inputEdges) {
      const inputNode = nodesRef.current.find((n) => n.id === edge.from);
      if (inputNode?.type === 'image' && inputNode.data.outputUrl) {
        inputImages.push(inputNode.data.outputUrl);
      } else if (inputNode?.type === 'prompt-template' && inputNode.data.templateOutput) {
        templateContent = inputNode.data.templateOutput.trim();
      }
    }

    // Combine template content with user prompt
    if (templateContent && prompt) {
      prompt = `${templateContent}\n\n${prompt}`;
    } else if (templateContent && !prompt) {
      prompt = templateContent;
    }

    if (!prompt) {
      updateNodeData(node.id, { errorMessage: '请输入提示词或连接模板节点', status: 'failed' });
      return;
    }

    // Check if model supports vision when images are provided
    const selectedModel = chatModels.find((m) => m.id === node.data.chatModelId);
    if (inputImages.length > 0 && selectedModel && !selectedModel.supportsVision) {
      updateNodeData(node.id, { errorMessage: '该模型不支持图片输入', status: 'failed' });
      return;
    }

    updateNodeData(node.id, { status: 'pending', errorMessage: undefined, inputImages });

    try {
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
      updateNodeData(node.id, {
        status: 'completed',
        chatOutput: data.data.content,
        chatMessages: [
          ...(node.data.chatMessages || []),
          { role: 'user', content: prompt },
          { role: 'assistant', content: data.data.content },
        ],
        errorMessage: undefined,
      });
      toast({ title: '聊天完成' });
    } catch (error) {
      updateNodeData(node.id, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : '聊天失败',
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
      <div className="flex items-center justify-center py-12 text-foreground/50">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        加载中...
      </div>
    );
  }

  return (
    <div className="h-full w-full min-w-0 flex flex-col gap-4 p-4 pb-24 sm:p-6 sm:pb-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between min-w-0">
        <div className="flex flex-col gap-2">
          <input
            value={workspaceName}
            onChange={(e) => {
              setWorkspaceName(e.target.value);
              setDirty(true);
            }}
            className="text-xl sm:text-2xl font-light text-foreground bg-transparent border border-border/70 rounded-lg px-3 py-2 w-full max-w-md focus:outline-none focus:border-border"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className={cn(
            'w-full sm:w-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition shrink-0',
            dirty
              ? 'bg-foreground text-background hover:bg-foreground/90'
              : 'bg-card/70 text-foreground/40 cursor-not-allowed'
          )}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          保存
        </button>
      </div>

      <div className="bg-card/60 border border-border/70 rounded-2xl overflow-hidden flex-1 min-h-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 px-4 py-3 border-b border-border/70 text-foreground/60 text-sm">
          <div className="hidden sm:flex items-center gap-3">
            <MousePointer2 className="w-4 h-4" />
            右键添加节点，拖拽布局，点击节点右侧圆点开始连线（Alt/Option + 滚轮缩放）
          </div>
          <div className="sm:hidden text-xs text-foreground/50">
            Tap + to add nodes. Drag to move. Use the bottom bar to zoom.
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={handleZoomOut}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
              title="缩小"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="w-14 text-center text-xs text-foreground/50">{Math.round(zoom * 100)}%</div>
            <button
              onClick={handleZoomIn}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
              title="放大"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomFit}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
              title="适配视图"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomReset}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
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
            style={{ width: canvasSize.width * zoom, height: canvasSize.height * zoom }}
          >
            <div
              className="absolute inset-0"
              style={{
                width: canvasSize.width,
                height: canvasSize.height,
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
                // Determine model only for image/video nodes
                const model =
                  node.type === 'image'
                    ? imageModels.find(m => m.id === node.data.modelId) || imageModels[0]
                    : node.type === 'video'
                    ? videoModels.find(m => m.id === node.data.modelId) || videoModels[0]
                    : null;
              const incoming = incomingEdges.get(node.id) || [];
              
              // Determine input/output handles based on node type
              const supportsReferenceInput =
                node.type === 'image' &&
                model &&
                (model as SafeImageModel).features.imageToImage;
              const showInputHandle = 
                node.type === 'video' || 
                node.type === 'chat' || 
                supportsReferenceInput;
              const showOutputHandle = 
                node.type === 'image' || 
                node.type === 'chat' || 
                node.type === 'prompt-template';
              
              // Get node icon based on type
              const NodeIcon = node.type === 'chat' 
                ? MessageSquare 
                : node.type === 'prompt-template' 
                ? FileText 
                : null;
              
              return (
                  <div
                    key={node.id}
                    data-workspace-node
                    className="absolute w-64 sm:w-72 bg-background/70 border border-border/70 rounded-xl shadow-lg"
                    style={{ left: node.position.x, top: node.position.y }}
                  >
                  <div
                    onPointerDown={(event) => startDrag(event, node)}
                    className="flex items-center justify-between px-3 py-2 border-b border-border/70 bg-card/60 rounded-t-xl cursor-grab"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {NodeIcon && <NodeIcon className="w-4 h-4 text-foreground/50" />}
                      <input
                        value={node.name}
                        onChange={(e) => updateNode(node.id, { name: e.target.value })}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="text-sm text-foreground/90 bg-transparent focus:outline-none flex-1"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      {(node.type === 'image' || node.type === 'video' || node.type === 'chat') && (
                        <button
                          onClick={() => {
                            if (node.type === 'video') handleGenerateVideo(node);
                            else if (node.type === 'chat') handleChatGenerate(node);
                            else handleGenerateNode(node);
                          }}
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
                        onClick={() => removeNode(node.id)}
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
                      onClick={() => handleFinishConnect(node.id)}
                      className="absolute -left-2 top-[18px] w-4 h-4 rounded-full border border-border bg-card/80 hover:bg-card/70"
                      title="输入"
                    />
                  )}
                  {showOutputHandle && (
                    <button
                      onClick={() => handleStartConnect(node.id)}
                      className={cn(
                        'absolute -right-2 top-[18px] w-4 h-4 rounded-full border border-border',
                        connectingFrom === node.id ? 'bg-foreground' : 'bg-card/80 hover:bg-card/70'
                      )}
                      title="输出"
                    />
                  )}

                  <div className="p-3 space-y-3 text-xs text-foreground/70">
                    {/* Prompt Template Node */}
                    {node.type === 'prompt-template' && (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-foreground/40">模板</label>
                          <div className="relative">
                            <select
                              value={node.data.templateId || ''}
                              onChange={(e) => {
                                const template = promptTemplates.find((t) => t.id === e.target.value);
                                updateNodeData(node.id, {
                                  templateId: e.target.value,
                                  templateOutput: template?.content || '',
                                });
                              }}
                              className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
                            >
                              <option value="" className="bg-card/95">选择模板...</option>
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

                    {/* Chat Node */}
                    {node.type === 'chat' && (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-foreground/40">聊天模型</label>
                          <div className="relative">
                            <select
                              value={node.data.chatModelId || ''}
                              onChange={(e) => updateNodeData(node.id, { chatModelId: e.target.value })}
                              className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
                            >
                              {chatModels.length === 0 ? (
                                <option value="" className="bg-card/95">无可用模型</option>
                              ) : (
                                chatModels.map((m) => (
                                  <option key={m.id} value={m.id} className="bg-card/95">
                                    {m.name} {m.supportsVision ? '(支持图片)' : ''}
                                  </option>
                                ))
                              )}
                            </select>
                            <ChevronDown className="w-3 h-3 text-foreground/30 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>

                        {incoming.length > 0 && (
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-wider text-foreground/40">
                              <ImageIcon className="w-3 h-3 inline mr-1" />
                              输入图片 ({incoming.length})
                            </label>
                            <div className="flex flex-wrap gap-1">
                              {incoming.map((edge) => {
                                const fromNode = nodes.find((n) => n.id === edge.from);
                                return (
                                  <span
                                    key={edge.id}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-card/70 text-foreground/60"
                                  >
                                    <Link2 className="w-3 h-3" />
                                    {fromNode?.name || '节点'}
                                    <button
                                      onClick={() => removeEdge(edge.id)}
                                      className="text-foreground/40 hover:text-foreground"
                                    >
                                      ×
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] uppercase tracking-wider text-foreground/40">提示词</label>
                            <span className="text-[10px] text-foreground/30">{node.data.prompt.length}/{CHAT_MAX_LENGTH}</span>
                          </div>
                          <textarea
                            value={node.data.prompt}
                            onChange={(e) => {
                              if (e.target.value.length <= CHAT_MAX_LENGTH) {
                                updateNodeData(node.id, { prompt: e.target.value });
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
                          onClick={() => handleChatGenerate(node)}
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

                    {/* Image/Video Node - Model Selection */}
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
                              const nextModel = imageModels.find(m => m.id === nextId) || imageModels[0];
                              updateNodeData(node.id, {
                                modelId: nextId,
                                aspectRatio: nextModel?.defaultAspectRatio || '1:1',
                                imageSize: nextModel?.defaultImageSize,
                              });
                              if (nextModel && !nextModel.features.imageToImage) {
                                const hasIncoming = edges.some((edge) => edge.to === node.id);
                                if (hasIncoming) {
                                  setEdgesDirty((prev) => prev.filter((edge) => edge.to !== node.id));
                                  toast({ title: '该模型不支持参考图，已移除引用' });
                                }
                              }
                            } else {
                              const nextModel = videoModels.find(m => m.id === nextId) || videoModels[0];
                              updateNodeData(node.id, {
                                modelId: nextId,
                                aspectRatio: nextModel?.defaultAspectRatio || 'landscape',
                                duration: nextModel?.defaultDuration || '10s',
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
                          value={node.data.aspectRatio || (model as SafeImageModel | SafeVideoModel)?.defaultAspectRatio || '1:1'}
                          onChange={(e) => updateNodeData(node.id, { aspectRatio: e.target.value })}
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
                            onChange={(e) => updateNodeData(node.id, { imageSize: e.target.value })}
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
                            value={node.data.duration || (model as SafeVideoModel)?.defaultDuration || '10s'}
                            onChange={(e) => updateNodeData(node.id, { duration: e.target.value })}
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

                    {node.type === 'video' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] uppercase tracking-wider text-foreground/40">角色卡</label>
                          <span className="text-[10px] text-foreground/30">
                            {characterCards.length} 个
                          </span>
                        </div>
                        {characterCards.length === 0 ? (
                          <div className="text-[10px] text-foreground/30">暂无角色卡</div>
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
                                    className="px-2 py-1 rounded-full border border-border/70 text-[10px] text-foreground/70 hover:text-foreground hover:border-border transition"
                                    title="点击插入到提示词"
                                  >
                                    {mention}
                                  </button>
                                );
                              })}
                            </div>
                            {hoveredCard && hoveredCard.nodeId === node.id && (
                              <div
                                className="pointer-events-none absolute z-30 rounded-lg border border-border/70 bg-background/80 p-1 shadow-xl"
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
                                  <div className="h-20 w-20 rounded-md bg-card/70" />
                                )}
                                <div className="mt-1 text-[10px] text-foreground/50 truncate w-20">
                                  @{hoveredCard.card.characterName}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        <div className="text-[10px] text-foreground/30">点击名称插入到提示词</div>
                      </div>
                    )}

                    {/* Upload reference image for video - only when no connected image node */}
                    {/* Upload reference image for video - only when no connected image node */}
                    {node.type === 'video' && !incoming.some(e => nodes.find(n => n.id === e.from)?.type === 'image') && (
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-foreground/40">参考图 (1张)</label>
                        <div className="flex flex-wrap gap-1">
                          {(node.data.uploadedImages || []).slice(0, 1).map((img, idx) => (
                            <div key={idx} className="relative group">
                              <img src={img} alt="" className="w-12 h-12 rounded object-cover border border-border/70" />
                              <button
                                onClick={() => updateNodeData(node.id, { uploadedImages: [] })}
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
                                  updateNodeData(node.id, { uploadedImages: [base64] });
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
                        onChange={(e) => updateNodeData(node.id, { prompt: e.target.value })}
                        className="w-full h-20 px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground text-xs resize-none focus:outline-none focus:border-border"
                        placeholder="描述生成内容"
                      />
                    </div>

                    {incoming.length > 0 && (
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-foreground/40">输入</label>
                        <div className="flex flex-wrap gap-1">
                          {incoming.map((edge) => {
                            const fromNode = nodes.find((n) => n.id === edge.from);
                            return (
                              <span
                                key={edge.id}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-card/70 text-foreground/60"
                              >
                                <Link2 className="w-3 h-3" />
                                {fromNode?.name || '图片节点'}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeEdge(edge.id);
                                  }}
                                  className="text-foreground/40 hover:text-foreground"
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Upload reference images - only for image nodes without connected image node */}
                    {node.type === 'image' && model && (model as SafeImageModel).features.imageToImage && !incoming.some(e => nodes.find(n => n.id === e.from)?.type === 'image') && (
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
                                  updateNodeData(node.id, { uploadedImages: newImages });
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
                                const supportsMultiple = !!(model.features as { supportMultipleImages?: boolean }).supportMultipleImages;
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
                                updateNodeData(node.id, { uploadedImages: [...currentImages, ...newImages].slice(0, maxImages) });
                                e.target.value = '';
                              }}
                            />
                            <ImageIcon className="w-4 h-4 text-foreground/30" />
                          </label>
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
                            src={`${node.data.outputUrl}${node.data.outputUrl.includes('?') ? '&' : '?'}_t=${node.data.generationId || Date.now()}`}
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
              })}

              {contextMenu && (
                <div
                  className="absolute z-20 bg-card/95 border border-border/70 rounded-lg shadow-xl p-2 text-sm text-foreground/80"
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                  <button
                    onClick={() => {
                      addNodeAt('image', contextMenu);
                      setContextMenu(null);
                    }}
                    className="block w-full text-left px-3 py-2 rounded hover:bg-card/70"
                  >
                    添加图片节点
                  </button>
                  <button
                    onClick={() => {
                      addNodeAt('video', contextMenu);
                      setContextMenu(null);
                    }}
                    className="block w-full text-left px-3 py-2 rounded hover:bg-card/70"
                  >
                    添加视频节点
                  </button>
                  <button
                    onClick={() => {
                      addNodeAt('chat', contextMenu);
                      setContextMenu(null);
                    }}
                    className="block w-full text-left px-3 py-2 rounded hover:bg-card/70"
                  >
                    添加聊天节点
                  </button>
                  <button
                    onClick={() => {
                      addNodeAt('prompt-template', contextMenu);
                      setContextMenu(null);
                    }}
                    className="block w-full text-left px-3 py-2 rounded hover:bg-card/70"
                  >
                    添加提示词模板
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 p-3 safe-bottom">
        <div className="flex items-center justify-between gap-2 bg-card/80 border border-border/70 rounded-2xl px-3 py-2 backdrop-blur">
          <button
            onClick={handleZoomOut}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomIn}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomFit}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
            title="Fit"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMobileAddOpen(true)}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-foreground text-background hover:opacity-90 transition"
            title="Add node"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className={cn(
              'h-9 w-9 inline-flex items-center justify-center rounded-lg border transition',
              dirty
                ? 'border-border/70 text-foreground/70 hover:text-foreground hover:border-border'
                : 'border-border/40 text-foreground/30 cursor-not-allowed'
            )}
            title="Save"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {mobileAddOpen && (
        <div className="sm:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileAddOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 p-4 safe-bottom">
            <div className="bg-card/95 border border-border/70 rounded-2xl p-4 space-y-3">
              <div className="text-[10px] uppercase tracking-wider text-foreground/40">Add node</div>
              <div className="grid grid-cols-2 gap-2">
                {MOBILE_NODE_OPTIONS.map(({ type, label, icon: Icon }) => (
                  <button
                    key={type}
                    onClick={() => handleAddNodeAtCenter(type)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/70 border border-border/70 text-foreground/70 hover:text-foreground hover:border-border transition"
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {connectingFrom && (
        <div className="text-xs text-foreground/40 flex items-center gap-2">
          <Check className="w-3 h-3" />
          点击目标节点左侧圆点完成连线
        </div>
      )}
    </div>
  );
}
