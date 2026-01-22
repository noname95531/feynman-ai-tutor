'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabaseClient';

export interface TreeNode {
  id: string;
  label: string;
  description?: string;
  parentId: string | null;
  position: { x: number; y: number };
}

interface StoreState {
  selectedNode: TreeNode | null;
  currentTreeId: string | null;
  nodes: TreeNode[];
  isPanelOpen: boolean;
  focusedNodeId: string | null;
  breadcrumbPath: TreeNode[];
  setSelectedNode: (node: TreeNode) => void;
  clearSelection: () => void;
  setCurrentTreeId: (treeId: string | null) => void;
  setNodes: (nodes: TreeNode[]) => void;
  openPanel: (nodeId: string) => void;
  closePanel: () => void;
  setFocusedNode: (nodeId: string | null) => void;
  setBreadcrumbPath: (path: TreeNode[]) => void;
  createEmptyTree: (topic: string, userId: string) => Promise<void>;
  addNode: (parentId: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  updateNodeLabel: (nodeId: string, newLabel: string) => Promise<void>;
  updateNodeDescription: (nodeId: string, newDescription: string) => Promise<void>;
  onNodeDragStop: (nodeId: string, position: { x: number; y: number }) => Promise<void>;
  reparentNode: (nodeId: string, newParentId: string) => Promise<void>;
  saveTreeToSupabase: () => Promise<void>;
}

const useStore = create<StoreState>((set, get) => ({
  selectedNode: null,
  currentTreeId: null,
  nodes: [],
  isPanelOpen: false,
  focusedNodeId: null,
  breadcrumbPath: [],
  setSelectedNode: (node) => set({ selectedNode: node }),
  clearSelection: () => set({ selectedNode: null }),
  setFocusedNode: (nodeId) => set({ focusedNodeId: nodeId }),
  setBreadcrumbPath: (path) => set({ breadcrumbPath: path }),
  openPanel: (nodeId: string) => {
    const { nodes } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      set({ selectedNode: node, isPanelOpen: true });
    }
  },
  closePanel: () => set({ isPanelOpen: false }),
  setCurrentTreeId: (treeId) => set({ currentTreeId: treeId }),
  setNodes: (nodes) => {
    // #region agent log
    // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store/useStore.ts:37',message:'setNodes called',data:{nodesCount:nodes.length,nodeIds:nodes.map(n=>n.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{}); // commented out - no /ingest endpoint
    // #endregion
    set({ nodes });
    // #region agent log
    // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store/useStore.ts:40',message:'setNodes completed',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{}); // commented out - no /ingest endpoint
    // #endregion
  },

  createEmptyTree: async (topic: string, userId: string) => {
    const rootNode: TreeNode = {
      id: 'root',
      label: topic,
      parentId: null,
      position: { x: 0, y: 0 },
    };

    try {
      const { data, error } = await supabase
        .from('learning_trees')
        .insert({
          user_id: userId,
          topic,
          nodes: [rootNode],
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to create empty tree', error);
        throw error;
      }

      if (data) {
        set({
          currentTreeId: data.id,
          nodes: [rootNode],
        });
      }
    } catch (err) {
      console.error('Error creating empty tree', err);
      throw err;
    }
  },

  addNode: async (parentId: string) => {
    const { nodes, currentTreeId } = get();
    if (!currentTreeId) {
      console.error('No current tree selected');
      return;
    }

    const parentNode = nodes.find((n) => n.id === parentId);
    if (!parentNode) {
      console.error('Parent node not found');
      return;
    }

    const newId = crypto.randomUUID();
    const offset = 50; // 改为 50，避免重叠
    const newNode: TreeNode = {
      id: newId,
      label: '新節點',
      description: undefined, // 新节点默认没有描述，用户可以稍后添加
      parentId,
      position: {
        x: parentNode.position.x + offset,
        y: parentNode.position.y + offset,
      },
    };

    const updatedNodes = [...nodes, newNode];

    set({ nodes: updatedNodes });

    try {
      await get().saveTreeToSupabase();
    } catch (err) {
      console.error('Failed to save node to Supabase', err);
      set({ nodes });
      throw err;
    }
  },

  deleteNode: async (nodeId: string) => {
    const { nodes, currentTreeId } = get();
    if (!currentTreeId) {
      console.error('No current tree selected');
      return;
    }

    const findChildren = (parentId: string): string[] => {
      const children: string[] = [];
      nodes.forEach((node) => {
        if (node.parentId === parentId) {
          children.push(node.id);
          children.push(...findChildren(node.id));
        }
      });
      return children;
    };

    const nodesToDelete = new Set([nodeId, ...findChildren(nodeId)]);
    const updatedNodes = nodes.filter((node) => !nodesToDelete.has(node.id));

    set({ nodes: updatedNodes });

    try {
      await get().saveTreeToSupabase();
    } catch (err) {
      console.error('Failed to delete node from Supabase', err);
      set({ nodes });
      throw err;
    }
  },

  updateNodeLabel: async (nodeId: string, newLabel: string) => {
    const { nodes, currentTreeId } = get();
    if (!currentTreeId) {
      console.error('No current tree selected');
      return;
    }

    const updatedNodes = nodes.map((node) =>
      node.id === nodeId ? { ...node, label: newLabel } : node,
    );

    set({ nodes: updatedNodes });

    try {
      await get().saveTreeToSupabase();
    } catch (err) {
      console.error('Failed to update node label in Supabase', err);
      set({ nodes });
      throw err;
    }
  },

  updateNodeDescription: async (nodeId: string, newDescription: string) => {
    const { nodes, currentTreeId } = get();
    if (!currentTreeId) {
      console.error('No current tree selected');
      return;
    }

    const updatedNodes = nodes.map((node) =>
      node.id === nodeId ? { ...node, description: newDescription || undefined } : node,
    );

    set({ nodes: updatedNodes });

    try {
      await get().saveTreeToSupabase();
    } catch (err) {
      console.error('Failed to update node description in Supabase', err);
      set({ nodes });
      throw err;
    }
  },

  reparentNode: async (nodeId: string, newParentId: string) => {
    const { nodes, currentTreeId } = get();
    if (!currentTreeId) {
      console.error('No current tree selected');
      return;
    }

    // 检查循环引用：确保 newParentId 不是 nodeId 的子孙节点
    const isAncestor = (ancestorId: string, descendantId: string): boolean => {
      const descendant = nodes.find((n) => n.id === descendantId);
      if (!descendant || !descendant.parentId) {
        return false;
      }
      if (descendant.parentId === ancestorId) {
        return true;
      }
      return isAncestor(ancestorId, descendant.parentId);
    };

    if (isAncestor(nodeId, newParentId)) {
      console.error('Cannot reparent: would create circular reference');
      return;
    }

    const updatedNodes = nodes.map((node) =>
      node.id === nodeId ? { ...node, parentId: newParentId } : node,
    );

    set({ nodes: updatedNodes });

    try {
      await get().saveTreeToSupabase();
    } catch (err) {
      console.error('Failed to reparent node in Supabase', err);
      set({ nodes });
      throw err;
    }
  },

  onNodeDragStop: async (nodeId: string, position: { x: number; y: number }) => {
    // #region agent log
    // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store/useStore.ts:175',message:'onNodeDragStop entry',data:{nodeId,position,currentNodesCount:get().nodes.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'C'})}).catch(()=>{}); // commented out - no /ingest endpoint
    // #endregion
    const { nodes, currentTreeId } = get();
    if (!currentTreeId) {
      console.error('No current tree selected');
      return;
    }

    // #region agent log
    // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store/useStore.ts:182',message:'before updating nodes',data:{nodesCount:nodes.length,nodeIds:nodes.map(n=>n.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'E'})}).catch(()=>{}); // commented out - no /ingest endpoint
    // #endregion
    const updatedNodes = nodes.map((node) =>
      node.id === nodeId ? { ...node, position } : node,
    );

    // #region agent log
    // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store/useStore.ts:186',message:'after updating nodes',data:{updatedNodesCount:updatedNodes.length,updatedNodeIds:updatedNodes.map(n=>n.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'E'})}).catch(()=>{}); // commented out - no /ingest endpoint
    // #endregion
    set({ nodes: updatedNodes });

    try {
      // #region agent log
      // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store/useStore.ts:189',message:'before saveTreeToSupabase',data:{nodesCount:updatedNodes.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'C'})}).catch(()=>{}); // commented out - no /ingest endpoint
      // #endregion
      await get().saveTreeToSupabase();
      // #region agent log
      // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store/useStore.ts:191',message:'after saveTreeToSupabase success',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'C'})}).catch(()=>{}); // commented out - no /ingest endpoint
      // #endregion
    } catch (err) {
      // #region agent log
      // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store/useStore.ts:193',message:'saveTreeToSupabase error',data:{error:String(err)},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'C'})}).catch(()=>{}); // commented out - no /ingest endpoint
      // #endregion
      console.error('Failed to save node position to Supabase', err);
      set({ nodes });
      throw err;
    }
  },

  saveTreeToSupabase: async () => {
    const { currentTreeId, nodes } = get();
    // #region agent log
    // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store/useStore.ts:197',message:'saveTreeToSupabase entry',data:{currentTreeId,nodesCount:nodes.length,nodeIds:nodes.map(n=>n.id),nodesStringified:JSON.stringify(nodes)},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'D'})}).catch(()=>{}); // commented out - no /ingest endpoint
    // #endregion
    if (!currentTreeId) {
      console.error('No current tree selected');
      return;
    }

    const { error } = await supabase
      .from('learning_trees')
      .update({ nodes })
      .eq('id', currentTreeId);

    if (error) {
      // #region agent log
      // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store/useStore.ts:209',message:'saveTreeToSupabase error',data:{error:JSON.stringify(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'D'})}).catch(()=>{}); // commented out - no /ingest endpoint
      // #endregion
      console.error('Failed to save tree to Supabase', error);
      throw error;
    }
    // #region agent log
    // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store/useStore.ts:212',message:'saveTreeToSupabase success',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'D'})}).catch(()=>{}); // commented out - no /ingest endpoint
    // #endregion
  },
}));

export default useStore;

