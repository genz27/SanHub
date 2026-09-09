import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/toaster';
import type { WorkspaceData, WorkspaceEdge, WorkspaceNode, ChatModel } from '@/types';
import type { PromptTemplate } from '../types';

interface UseWorkspaceDataOptions {
  workspaceId: string;
}

interface UseWorkspaceDataReturn {
  // Workspace data
  workspaceName: string;
  setWorkspaceName: (name: string) => void;
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  nodesRef: React.MutableRefObject<WorkspaceNode[]>;
  edgesRef: React.MutableRefObject<WorkspaceEdge[]>;
  
  // State flags
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  
  // Actions
  setNodesDirty: (updater: (prev: WorkspaceNode[]) => WorkspaceNode[]) => void;
  setEdgesDirty: (updater: (prev: WorkspaceEdge[]) => WorkspaceEdge[]) => void;
  handleSave: () => Promise<void>;
  
  // External data
  chatModels: Pick<ChatModel, 'id' | 'name' | 'supportsVision' | 'enabled'>[];
  promptTemplates: PromptTemplate[];
}

export function useWorkspaceData({ workspaceId }: UseWorkspaceDataOptions): UseWorkspaceDataReturn {
  const [workspaceName, setWorkspaceName] = useState('');
  const [nodes, setNodes] = useState<WorkspaceNode[]>([]);
  const [edges, setEdges] = useState<WorkspaceEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  
  const [chatModels, setChatModels] = useState<Pick<ChatModel, 'id' | 'name' | 'supportsVision' | 'enabled'>[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  
  const nodesRef = useRef<WorkspaceNode[]>([]);
  const edgesRef = useRef<WorkspaceEdge[]>([]);

  // Keep refs in sync
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // Dirty setters
  const setNodesDirty = useCallback((updater: (prev: WorkspaceNode[]) => WorkspaceNode[]) => {
    setNodes(updater);
    setDirty(true);
  }, []);

  const setEdgesDirty = useCallback((updater: (prev: WorkspaceEdge[]) => WorkspaceEdge[]) => {
    setEdges(updater);
    setDirty(true);
  }, []);

  // Load workspace
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
    const loadCatalogs = async () => {
      const [chatRes, promptsRes] = await Promise.all([
        fetch('/api/chat/models?fields=picker'),
        fetch('/api/prompts?fields=names'),
      ]);

      try {
        if (chatRes.ok) {
          const data = await chatRes.json();
          setChatModels(
            (data.data || []).filter(
              (m: Pick<ChatModel, 'id' | 'name' | 'supportsVision' | 'enabled'>) => m.enabled !== false
            )
          );
        }
      } catch (error) {
        console.error('Failed to load chat models:', error);
      }

      try {
        if (promptsRes.ok) {
          const data = await promptsRes.json();
          setPromptTemplates(data.data || []);
        }
      } catch (error) {
        console.error('Failed to load prompt templates:', error);
      }
    };
    void loadCatalogs();
  }, []);

  // Save handler
  const handleSave = useCallback(async () => {
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
  }, [workspaceId, workspaceName, nodes, edges]);

  return {
    workspaceName,
    setWorkspaceName: (name: string) => {
      setWorkspaceName(name);
      setDirty(true);
    },
    nodes,
    edges,
    nodesRef,
    edgesRef,
    loading,
    saving,
    dirty,
    setNodesDirty,
    setEdgesDirty,
    handleSave,
    chatModels,
    promptTemplates,
  };
}
