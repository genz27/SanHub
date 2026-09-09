// ========================================
// Workspace Component Types
// ========================================

import type { WorkspaceEdge, WorkspaceNode, WorkspaceNodeType, ChatModel } from '@/types';

export interface PromptTemplate {
  id: string;
  name: string;
  content?: string;
}

// Canvas constants
export const CANVAS_WIDTH = 2400;
export const CANVAS_HEIGHT = 1400;
export const NODE_WIDTH = 280;
export const HANDLE_OFFSET_Y = 24;
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 1.6;
export const ZOOM_STEP = 0.1;
export const CHAT_MAX_LENGTH = 2000;

// Drag state
export type DragState = { 
  id: string; 
  offsetX: number; 
  offsetY: number;
} | null;

// Edge path for rendering
export interface EdgePath {
  id: string;
  d: string;
}

// Workspace context menu position
export interface ContextMenuPosition {
  x: number;
  y: number;
}

// Workspace state
export interface WorkspaceState {
  workspaceName: string;
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  zoom: number;
  dragging: DragState;
  connectingFrom: string | null;
  cursorPos: { x: number; y: number } | null;
  contextMenu: ContextMenuPosition | null;
}

// Workspace actions
export interface WorkspaceActions {
  setWorkspaceName: (name: string) => void;
  setNodes: (updater: (prev: WorkspaceNode[]) => WorkspaceNode[]) => void;
  setEdges: (updater: (prev: WorkspaceEdge[]) => WorkspaceEdge[]) => void;
  setDirty: (dirty: boolean) => void;
  setZoom: (zoom: number) => void;
  setDragging: (state: DragState) => void;
  setConnectingFrom: (nodeId: string | null) => void;
  setCursorPos: (pos: { x: number; y: number } | null) => void;
  setContextMenu: (pos: ContextMenuPosition | null) => void;
}

// Node update helpers
export interface NodeHelpers {
  updateNodeData: (id: string, partial: Partial<WorkspaceNode['data']>) => void;
  updateNode: (id: string, partial: Partial<WorkspaceNode>) => void;
  removeNode: (id: string) => void;
  removeEdge: (edgeId: string) => void;
  addNodeAt: (type: WorkspaceNodeType, position: { x: number; y: number }) => void;
  createNode: (type: WorkspaceNodeType, position: { x: number; y: number }) => WorkspaceNode;
}

// Generation handlers
export interface GenerationHandlers {
  handleGenerateNode: (node: WorkspaceNode) => Promise<void>;
  handleGenerateVideo: (node: WorkspaceNode) => Promise<void>;
  handleChatGenerate: (node: WorkspaceNode) => Promise<void>;
  pollTaskStatus: (nodeId: string, taskId: string) => Promise<void>;
}

// Connection handlers
export interface ConnectionHandlers {
  handleStartConnect: (nodeId: string) => void;
  handleFinishConnect: (nodeId: string) => void;
}

// Zoom handlers
export interface ZoomHandlers {
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleZoomReset: () => void;
  handleZoomFit: () => void;
  clampZoom: (value: number) => number;
}

// External data
export interface ExternalData {
  chatModels: ChatModel[];
  promptTemplates: PromptTemplate[];
}
