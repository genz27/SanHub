'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Check,
  Loader2,
  MousePointer2,
  Plus,
  Video,
  Maximize2,
  RotateCcw,
  Save,
  ZoomIn,
  ZoomOut,
  MessageSquare,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

const GENERATION_POLL_TIMEOUT_MS = 30 * 60 * 1000;
import type { CharacterCard, WorkspaceData, WorkspaceEdge, WorkspaceNode, WorkspaceNodeType, ChatModel, SafeImageModel, SafeVideoModel } from '@/types';
import { WorkspaceEdges } from '@/components/workspace/WorkspaceEdges';
import type { HoveredCardState } from '@/components/workspace/types';

const WorkspaceNodeCard = dynamic(
  () => import('@/components/workspace/WorkspaceNodeCard').then((mod) => mod.WorkspaceNodeCard),
  {
    ssr: false,
    loading: () => (
      <div className="w-64 sm:w-72 h-80 bg-background/70 border border-border/70 rounded-xl" />
    ),
  }
);

interface PromptTemplate {
  id: string;
  name: string;
  content?: string;
}


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
  const characterCardsLoadedRef = useRef(false);
  const promptTemplatesLoadedRef = useRef(false);
  const imageModelsLoadedRef = useRef(false);
  const videoModelsLoadedRef = useRef(false);
  const chatModelsLoadedRef = useRef(false);

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
  const [hoveredCard, setHoveredCard] = useState<HoveredCardState | null>(null);
  const [chatModels, setChatModels] = useState<Pick<ChatModel, 'id' | 'name' | 'supportsVision' | 'enabled'>[]>([]);
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

  const loadCharacterCards = useCallback(async () => {
    if (characterCardsLoadedRef.current) return;
    characterCardsLoadedRef.current = true;
    try {
      const res = await fetch('/api/user/character-cards?status=completed&fields=picker');
      if (res.ok) {
        const data = await res.json();
        setCharacterCards(
          (data.data || []).filter((card: CharacterCard) => card.characterName)
        );
      }
    } catch (error) {
      characterCardsLoadedRef.current = false;
      console.error('Failed to load character cards:', error);
    }
  }, []);

  const loadPromptTemplates = useCallback(async () => {
    if (promptTemplatesLoadedRef.current) return;
    promptTemplatesLoadedRef.current = true;
    try {
      const res = await fetch('/api/prompts?fields=names');
      if (res.ok) {
        const data = await res.json();
        setPromptTemplates(data.data || []);
      }
    } catch (error) {
      promptTemplatesLoadedRef.current = false;
      console.error('Failed to load prompt templates:', error);
    }
  }, []);

  const loadImageModels = useCallback(async () => {
    if (imageModelsLoadedRef.current) return;
    imageModelsLoadedRef.current = true;
    try {
      const res = await fetch('/api/image-models?fields=workspace');
      if (res.ok) {
        const data = await res.json();
        setImageModels(data.data?.models || []);
      }
    } catch (error) {
      imageModelsLoadedRef.current = false;
      console.error('Failed to load image models:', error);
    }
  }, []);

  const loadVideoModels = useCallback(async () => {
    if (videoModelsLoadedRef.current) return;
    videoModelsLoadedRef.current = true;
    try {
      const res = await fetch('/api/video-models?fields=workspace');
      if (res.ok) {
        const data = await res.json();
        setVideoModels(data.data?.models || []);
      }
    } catch (error) {
      videoModelsLoadedRef.current = false;
      console.error('Failed to load video models:', error);
    }
  }, []);

  const loadChatModels = useCallback(async () => {
    if (chatModelsLoadedRef.current) return;
    chatModelsLoadedRef.current = true;
    try {
      const res = await fetch('/api/chat/models?fields=picker');
      if (res.ok) {
        const data = await res.json();
        setChatModels(
          (data.data || []).filter(
            (m: Pick<ChatModel, 'id' | 'name' | 'supportsVision' | 'enabled'>) => m.enabled !== false
          )
        );
      }
    } catch (error) {
      chatModelsLoadedRef.current = false;
      console.error('Failed to load chat models:', error);
    }
  }, []);

  const prefetchAddCatalogs = useCallback(() => {
    void loadImageModels();
    void loadVideoModels();
    void loadChatModels();
    void loadPromptTemplates();
  }, [loadChatModels, loadImageModels, loadPromptTemplates, loadVideoModels]);

  const hasImageNode = nodes.some((node) => node.type === 'image');
  const hasVideoNode = nodes.some((node) => node.type === 'video');
  const hasChatNode = nodes.some((node) => node.type === 'chat');
  const hasPromptTemplateNode = nodes.some((node) => node.type === 'prompt-template');

  useEffect(() => {
    if (hasImageNode) {
      void loadImageModels();
    }
  }, [hasImageNode, loadImageModels]);

  useEffect(() => {
    if (hasVideoNode) {
      void loadVideoModels();
    }
  }, [hasVideoNode, loadVideoModels]);

  useEffect(() => {
    if (hasChatNode) {
      void loadChatModels();
    }
  }, [hasChatNode, loadChatModels]);

  useEffect(() => {
    if (hasPromptTemplateNode) {
      void loadPromptTemplates();
    }
  }, [hasPromptTemplateNode, loadPromptTemplates]);

  useEffect(() => {
    if (imageModels.length === 0) return;
    const model = imageModels[0];
    setNodes((prev) => {
      let changed = false;
      const next = prev.map((node) => {
        if (node.type !== 'image' || node.data.modelId) return node;
        changed = true;
        return {
          ...node,
          data: {
            ...node.data,
            modelId: model.id,
            aspectRatio: node.data.aspectRatio || model.defaultAspectRatio,
            imageSize: node.data.imageSize || model.defaultImageSize,
          },
        };
      });
      return changed ? next : prev;
    });
  }, [imageModels]);

  useEffect(() => {
    if (videoModels.length === 0) return;
    const model = videoModels[0];
    setNodes((prev) => {
      let changed = false;
      const next = prev.map((node) => {
        if (node.type !== 'video' || node.data.modelId) return node;
        changed = true;
        return {
          ...node,
          data: {
            ...node.data,
            modelId: model.id,
            aspectRatio: node.data.aspectRatio || model.defaultAspectRatio,
            duration: node.data.duration || model.defaultDuration,
          },
        };
      });
      return changed ? next : prev;
    });
  }, [videoModels]);

  useEffect(() => {
    if (chatModels.length === 0) return;
    const modelId = chatModels[0].id;
    setNodes((prev) => {
      let changed = false;
      const next = prev.map((node) => {
        if (node.type !== 'chat' || node.data.chatModelId) return node;
        changed = true;
        return {
          ...node,
          data: {
            ...node.data,
            chatModelId: modelId,
          },
        };
      });
      return changed ? next : prev;
    });
  }, [chatModels]);

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
            duration: model?.defaultDuration || '8s',
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
      if (type === 'image') {
        void loadImageModels();
      } else if (type === 'video') {
        void loadVideoModels();
      } else if (type === 'chat') {
        void loadChatModels();
      } else {
        void loadPromptTemplates();
      }
      setNodesDirty((prev) => [...prev, createNode(type, position)]);
    },
    [createNode, loadChatModels, loadImageModels, loadPromptTemplates, loadVideoModels, setNodesDirty]
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
    prefetchAddCatalogs();
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
      try {
        const { pollGenerationTask } = await import('@/lib/generation-poll');
        const node = nodesRef.current.find((item) => item.id === nodeId);
        await pollGenerationTask({
          taskId,
          taskPrompt: node?.data.prompt || '',
          taskType: node?.type === 'video' ? 'video' : 'image',
          signal: controller.signal,
          onProgress: (payload) => {
            updateNodeData(nodeId, {
              status:
                payload.status === 'pending' || payload.status === 'processing'
                  ? payload.status
                  : 'processing',
            });
          },
          onCompleted: async (_generation, payload) => {
            await update();
            updateNodeData(nodeId, {
              status: 'completed',
              outputUrl: payload.url,
              outputType: payload.type?.includes('video') ? 'video' : 'image',
              generationId: payload.id,
              errorMessage: undefined,
            });
            toast({ title: '生成完成' });
          },
          onFailed: (errorMessage) => {
            updateNodeData(nodeId, {
              status: 'failed',
              errorMessage,
            });
          },
          onTimeout: () => {
            updateNodeData(nodeId, {
              status: 'failed',
              errorMessage: '任务超时',
            });
          },
        });
      } finally {
        abortControllersRef.current.delete(nodeId);
      }
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
    try {
      const { submitWorkspaceMediaNode } = await import('@/components/workspace/submit-workspace-node');
      const generationId = await submitWorkspaceMediaNode(node, {
        nodes: nodesRef.current,
        edges: edgesRef.current,
        imageModels,
        videoModels,
        updateNodeData,
      });
      if (generationId) {
        pollTaskStatus(node.id, generationId);
      }
    } catch (error) {
      updateNodeData(node.id, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : '生成失败',
      });
    }
  }, [imageModels, pollTaskStatus, updateNodeData, videoModels]);

  const handleChatGenerate = async (node: WorkspaceNode) => {
    try {
      const { submitWorkspaceChatNode } = await import('@/components/workspace/submit-workspace-node');
      const completed = await submitWorkspaceChatNode(node, {
        nodes: nodesRef.current,
        edges: edgesRef.current,
        chatModels,
        updateNodeData,
      });
      if (completed) {
        toast({ title: '聊天完成' });
      }
    } catch (error) {
      updateNodeData(node.id, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : '聊天失败',
      });
    }
  };

  const waitForNodeStatus = useCallback(
    (nodeId: string, timeoutMs = GENERATION_POLL_TIMEOUT_MS) =>
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
              <WorkspaceEdges
                nodes={nodes}
                edges={edges}
                connectingFrom={connectingFrom}
                cursorPos={cursorPos}
              />

              {nodes.map((node) => {
                const model =
                  node.type === 'image'
                    ? imageModels.find((m) => m.id === node.data.modelId) || imageModels[0]
                    : node.type === 'video'
                      ? videoModels.find((m) => m.id === node.data.modelId) || videoModels[0]
                      : null;
                const incoming = incomingEdges.get(node.id) || [];
                const incomingSources = incoming.map((edge) => ({
                  id: edge.id,
                  name:
                    nodes.find((item) => item.id === edge.from)?.name ||
                    (node.type === 'chat' ? '节点' : '图片节点'),
                }));
                const hasConnectedImage = incoming.some(
                  (edge) => nodes.find((item) => item.id === edge.from)?.type === 'image'
                );

                return (
                  <div
                    key={node.id}
                    className="absolute"
                    style={{ left: node.position.x, top: node.position.y }}
                  >
                    <WorkspaceNodeCard
                      node={node}
                      incoming={incoming}
                      incomingSources={incomingSources}
                      hasConnectedImage={hasConnectedImage}
                      connectingFrom={connectingFrom}
                      model={model}
                      imageModels={imageModels}
                      videoModels={videoModels}
                      chatModels={chatModels}
                      promptTemplates={promptTemplates}
                      characterCards={characterCards}
                      hoveredCard={hoveredCard}
                      onStartDrag={startDrag}
                      onUpdateNode={updateNode}
                      onUpdateNodeData={updateNodeData}
                      onRemoveNode={removeNode}
                      onRemoveEdge={removeEdge}
                      onRemoveIncomingEdges={(nodeId) => {
                        setEdgesDirty((prev) => prev.filter((edge) => edge.to !== nodeId));
                        toast({ title: '该模型不支持参考图，已移除引用' });
                      }}
                      onGenerate={(target) => {
                        if (target.type === 'video') void handleGenerateVideo(target);
                        else if (target.type === 'chat') void handleChatGenerate(target);
                        else void handleGenerateNode(target);
                      }}
                      onStartConnect={handleStartConnect}
                      onFinishConnect={handleFinishConnect}
                      onInsertCharacterMention={insertCharacterMention}
                      onLoadCharacterCards={loadCharacterCards}
                      onHoverCard={setHoveredCard}
                      onLeaveCard={(cardId) => {
                        setHoveredCard((prev) => (prev?.card.id === cardId ? null : prev));
                      }}
                      onPromptTemplateLoaded={(templateId, content) => {
                        setPromptTemplates((prev) =>
                          prev.map((item) => (item.id === templateId ? { ...item, content } : item))
                        );
                      }}
                    />
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
            onClick={() => {
              prefetchAddCatalogs();
              setMobileAddOpen(true);
            }}
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
