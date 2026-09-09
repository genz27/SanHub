import type { WorkspaceData } from '@/types';

export function parseWorkspaceData(raw: unknown): WorkspaceData {
  if (!raw) {
    return { nodes: [], edges: [] };
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as WorkspaceData;
      return {
        nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
        edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      };
    } catch {
      return { nodes: [], edges: [] };
    }
  }
  if (typeof raw === 'object' && raw !== null) {
    const data = raw as WorkspaceData;
    return {
      nodes: Array.isArray(data.nodes) ? data.nodes : [],
      edges: Array.isArray(data.edges) ? data.edges : [],
    };
  }
  return { nodes: [], edges: [] };
}
