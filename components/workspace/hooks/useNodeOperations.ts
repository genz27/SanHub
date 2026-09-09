import { useCallback } from 'react';
import { toast } from '@/components/ui/toaster';
import { IMAGE_MODELS, VIDEO_MODELS, getImageModelById } from '@/lib/model-config';
import type { WorkspaceNode, WorkspaceEdge, WorkspaceNodeType, ChatModel } from '@/types';

interface UseNodeOperationsOptions {
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  chatModels: ChatModel[];
  setNodesDirty: (updater: (prev: WorkspaceNode[]) => WorkspaceNode[]) => void;
  setEdgesDirty: (updater: (prev: WorkspaceEdge[]) => WorkspaceEdge[]) => void;
}

interface UseNodeOperationsReturn {
  createNode: (type: WorkspaceNodeType, position: { x: number; y: number }) => WorkspaceNode;
  addNodeAt: (type: WorkspaceNodeType, position: { x: number; y: number }) => void;
  updateNodeData: (id: string, partial: Partial<WorkspaceNode['data']>) => void;
  updateNode: (id: string, partial: Partial<WorkspaceNode>) => void;
  removeNode: (id: string) => void;
  removeEdge: (edgeId: string) => void;
  handleStartConnect: (nodeId: string, connectingFrom: string | null, setConnectingFrom: (id: string | null) => void, setCursorPos: (pos: null) => void) => void;
  handleFinishConnect: (nodeId: string, connectingFrom: string | null, setConnectingFrom: (id: string | null) => void) => void;
}

export function useNodeOperations({
  nodes,
  edges,
  chatModels,
  setNodesDirty,
  setEdgesDirty,
}: UseNodeOperationsOptions): UseNodeOperationsReturn {
  
  const createNode = useCallback(
    (type: WorkspaceNodeType, position: { x: number; y: number }): WorkspaceNode => {
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
        };
      }
      
      if (type === 'video') {
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
        };
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
        };
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
      };
    },
    [chatModels]
  );

  const addNodeAt = useCallback(
    (type: WorkspaceNodeType, position: { x: number; y: number }) => {
      setNodesDirty((prev) => [...prev, createNode(type, position)]);
    },
    [createNode, setNodesDirty]
  );

  const updateNodeData = useCallback(
    (id: string, partial: Partial<WorkspaceNode['data']>) => {
      setNodesDirty((prev) =>
        prev.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, ...partial } }
            : node
        )
      );
    },
    [setNodesDirty]
  );

  const updateNode = useCallback(
    (id: string, partial: Partial<WorkspaceNode>) => {
      setNodesDirty((prev) =>
        prev.map((node) => (node.id === id ? { ...node, ...partial } : node))
      );
    },
    [setNodesDirty]
  );

  const removeNode = useCallback(
    (id: string) => {
      setNodesDirty((prev) => prev.filter((node) => node.id !== id));
      setEdgesDirty((prev) => prev.filter((edge) => edge.from !== id && edge.to !== id));
    },
    [setNodesDirty, setEdgesDirty]
  );

  const removeEdge = useCallback(
    (edgeId: string) => {
      setEdgesDirty((prev) => prev.filter((edge) => edge.id !== edgeId));
    },
    [setEdgesDirty]
  );

  const handleStartConnect = useCallback(
    (
      nodeId: string,
      connectingFrom: string | null,
      setConnectingFrom: (id: string | null) => void,
      setCursorPos: (pos: null) => void
    ) => {
      if (connectingFrom === nodeId) {
        setConnectingFrom(null);
        setCursorPos(null);
        return;
      }
      setConnectingFrom(nodeId);
      setCursorPos(null);
    },
    []
  );

  const handleFinishConnect = useCallback(
    (
      nodeId: string,
      connectingFrom: string | null,
      setConnectingFrom: (id: string | null) => void
    ) => {
      if (!connectingFrom || connectingFrom === nodeId) return;
      
      const fromNode = nodes.find((node) => node.id === connectingFrom);
      const toNode = nodes.find((node) => node.id === nodeId);
      if (!fromNode || !toNode) return;

      // Connection rules validation
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
          const targetModel = getImageModelById(toNode.data.modelId || '') || IMAGE_MODELS[0];
          if (!targetModel.features.supportReferenceImage) {
            toast({ title: '该模型不支持参考图' });
            setConnectingFrom(null);
            return;
          }
        }
      } else if (toNode.type === 'chat') {
        if (fromNode.type !== 'image' && fromNode.type !== 'prompt-template') {
          toast({ title: '聊天节点仅支持图片或模板节点连接' });
          setConnectingFrom(null);
          return;
        }
      } else if (toNode.type === 'prompt-template') {
        toast({ title: '提示词模板节点不支持输入连接' });
        setConnectingFrom(null);
        return;
      } else {
        setConnectingFrom(null);
        return;
      }

      // Create edge based on connection type
      if (toNode.type === 'chat' && fromNode.type === 'image') {
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
        setEdgesDirty((prev) => [
          ...prev.filter((edge) => {
            if (edge.to !== nodeId) return true;
            const sourceNode = nodes.find((n) => n.id === edge.from);
            return sourceNode?.type === 'image';
          }),
          { id: `${fromNode.id}-${toNode.id}`, from: fromNode.id, to: toNode.id },
        ]);
      } else if ((toNode.type === 'image' || toNode.type === 'video') && fromNode.type === 'image') {
        setEdgesDirty((prev) => [
          ...prev.filter((edge) => {
            if (edge.to !== nodeId) return true;
            const sourceNode = nodes.find((n) => n.id === edge.from);
            return sourceNode?.type !== 'image';
          }),
          { id: `${fromNode.id}-${toNode.id}`, from: fromNode.id, to: toNode.id },
        ]);
      } else {
        setEdgesDirty((prev) => [
          ...prev.filter((edge) => edge.to !== nodeId),
          { id: `${fromNode.id}-${toNode.id}`, from: fromNode.id, to: toNode.id },
        ]);
      }
      
      setConnectingFrom(null);
    },
    [nodes, edges, setEdgesDirty]
  );

  return {
    createNode,
    addNodeAt,
    updateNodeData,
    updateNode,
    removeNode,
    removeEdge,
    handleStartConnect,
    handleFinishConnect,
  };
}
