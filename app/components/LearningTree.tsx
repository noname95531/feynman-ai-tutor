'use client';

import { useMemo, useEffect, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  Position,
  ReactFlowProvider,
  useReactFlow,
  MarkerType,
  BackgroundVariant,
} from 'reactflow';
import dagre from 'dagre';
import { Layout } from 'lucide-react';
import 'reactflow/dist/style.css';

import useStore, { TreeNode } from '@/store/useStore';
import CustomNode from '@/components/CustomNode';
import BreadcrumbNavigation from '@/components/BreadcrumbNavigation';

const nodeTypes = {
  customNode: CustomNode,
};

interface LearningTreeProps {
  data: TreeNode[];
}

const nodeWidth = 80;
const nodeHeight = 80;

// 检测两个节点是否重叠
const isNodeIntersecting = (node1: Node, node2: Node): boolean => {
  const node1Left = node1.position.x;
  const node1Right = node1.position.x + (node1.width || nodeWidth);
  const node1Top = node1.position.y;
  const node1Bottom = node1.position.y + (node1.height || nodeHeight);

  const node2Left = node2.position.x;
  const node2Right = node2.position.x + (node2.width || nodeWidth);
  const node2Top = node2.position.y;
  const node2Bottom = node2.position.y + (node2.height || nodeHeight);

  // 检查是否有重叠：两个矩形是否相交
  return !(
    node1Right < node2Left ||
    node1Left > node2Right ||
    node1Bottom < node2Top ||
    node1Top > node2Bottom
  );
};

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  // 强制左右布局设置 - 使用最简单的配置确保LR布局
  dagreGraph.setGraph({ 
    rankdir: 'LR',     // 强制左右方向
    nodesep: 100,      // 同一层级节点之间的间距
    ranksep: 300,      // 不同层级之间的间距（大幅增加以确保明显分离）
    marginx: 50,       // 边距
    marginy: 50
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  // 调试信息：检查图的方向和节点位置
  console.log('=== Layout Debug Info ===');
  console.log('Graph direction:', dagreGraph.graph().rankdir);
  console.log('Graph config:', dagreGraph.graph());
  
  // 收集所有节点的x坐标来验证左右布局
  const nodePositions: { id: string; x: number; y: number }[] = [];
  
  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    // 强制左右布局：target在左侧，source在右侧
    node.targetPosition = Position.Left;
    node.sourcePosition = Position.Right;
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
    
    nodePositions.push({
      id: node.id,
      x: nodeWithPosition.x,
      y: nodeWithPosition.y
    });
  });
  
  // 按x坐标排序来验证左右布局
  nodePositions.sort((a, b) => a.x - b.x);
  console.log('Nodes ordered by X position (should show left-to-right progression):');
  nodePositions.forEach(pos => {
    console.log(`  ${pos.id}: x=${pos.x}, y=${pos.y}`);
  });
  console.log('=== End Layout Debug ===');

  return { nodes, edges };
};

function LearningTreeInner({ data }: LearningTreeProps) {
  const { 
    onNodeDragStop, 
    nodes: storeNodes, 
    reparentNode, 
    focusedNodeId, 
    setFocusedNode, 
    breadcrumbPath, 
    setBreadcrumbPath
  } = useStore();
  const hasAppliedLayoutRef = useRef(false);
  const previousDataLengthRef = useRef(data.length);
  const previousTreeIdRef = useRef<string | null>(null);

  // 优先使用 store 中的 nodes（实时更新），如果 store 为空则使用 prop 中的 data（初始加载）
  // 这样可以确保操作后能立即看到更新
  const allNodes = storeNodes.length > 0 ? storeNodes : data;
  
  // 計算focus時應該顯示的節點（當前節點 + 1層子節點）
  const getFocusedNodes = (focusNodeId: string, allNodes: TreeNode[]): TreeNode[] => {
    if (!focusNodeId) return allNodes;
    
    const focusNode = allNodes.find(n => n.id === focusNodeId);
    if (!focusNode) return allNodes;
    
    const result = [focusNode];
    
    // 獲取第一層子節點，顯示所有子節點
    const firstLevelChildren = allNodes.filter(n => n.parentId === focusNodeId);
    result.push(...firstLevelChildren);
    
    return result;
  };
  
  // 計算麵包屑路徑
  const calculateBreadcrumbPath = (nodeId: string, allNodes: TreeNode[]): TreeNode[] => {
    const path: TreeNode[] = [];
    let currentNode = allNodes.find(n => n.id === nodeId);
    
    while (currentNode && currentNode.parentId) {
      const parent = allNodes.find(n => n.id === currentNode!.parentId);
      if (parent) {
        path.unshift(parent);
        currentNode = parent;
      } else {
        break;
      }
    }
    
    // 添加當前節點
    const targetNode = allNodes.find(n => n.id === nodeId);
    if (targetNode) {
      path.push(targetNode);
    }
    
    return path;
  };
  
  // 默認顯示根節點加一層子節點
  const getDefaultFocusedNodes = (allNodes: TreeNode[]): TreeNode[] => {
    if (allNodes.length === 0) return [];
    
    // 找到根節點
    const rootNode = allNodes.find(n => n.parentId === null);
    if (!rootNode) return allNodes;
    
    const result = [rootNode];
    
    // 獲取第一層子節點，顯示所有子節點
    const firstLevelChildren = allNodes.filter(n => n.parentId === rootNode.id);
    result.push(...firstLevelChildren);
    
    return result;
  };
  
  const effectiveData = focusedNodeId 
    ? getFocusedNodes(focusedNodeId, allNodes) 
    : getDefaultFocusedNodes(allNodes);
  
  // #region agent log - commented out (no /ingest endpoint)
  // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/components/LearningTree.tsx:68',message:'effectiveData calculation',data:{storeNodesCount:storeNodes.length,dataPropCount:data.length,effectiveDataCount:effectiveData.length,usingStore:storeNodes.length>0,storeNodeIds:storeNodes.map(n=>n.id),dataPropIds:data.map(n=>n.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'B'})}).catch(()=>{});
  // #endregion

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    if (!effectiveData || effectiveData.length === 0) {
      hasAppliedLayoutRef.current = false;
      previousDataLengthRef.current = 0;
      return { nodes: [], edges: [] };
    }

    // 检查是否是新的树（节点数量变化或首次加载）
    const isNewTree = effectiveData.length !== previousDataLengthRef.current;
    previousDataLengthRef.current = effectiveData.length;

    // 检查节点是否已有位置信息
    const hasPositions = effectiveData.every(
      (item) => item.position && item.position.x !== 0 && item.position.y !== 0,
    );

    const nodes: Node[] = effectiveData.map((item) => ({
      id: item.id,
      type: 'customNode',
      position: item.position || { x: 0, y: 0 },
      targetPosition: Position.Left, // 默認左右佈局
      sourcePosition: Position.Right, // 默認左右佈局
      data: {
        label: item.label,
        raw: item,
      },
    }));

    const edges: Edge[] = effectiveData
      .filter((item) => item.parentId !== null)
      .map((item) => ({
        id: `${item.parentId}-${item.id}`,
        source: item.parentId!,
        target: item.id,
        type: 'bezier',
        animated: false,
        style: {
          stroke: '#14b8a6',
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#14b8a6',
        },
      }));

    // 只在首次加载或新树生成时应用自动布局
    if (isNewTree && !hasPositions) {
      const layouted = getLayoutedElements(nodes, edges, 'LR');
      hasAppliedLayoutRef.current = true;
      return { nodes: layouted.nodes, edges: layouted.edges };
    }

    // 否则使用已有的位置
    hasAppliedLayoutRef.current = false;
    return { nodes, edges };
  }, [effectiveData]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView, getNodes, getEdges } = useReactFlow();

  // 自动排版功能
  const handleAutoLayout = () => {
    // 获取最新的节点和边（确保使用最新状态）
    const currentNodes = getNodes();
    const currentEdges = getEdges();
    
    if (currentNodes.length === 0) return;

    // 使用 dagre 重新计算布局
    const layouted = getLayoutedElements([...currentNodes], [...currentEdges], 'LR');
    
    // 创建全新的节点数组，确保 React 能检测到变化
    const updatedNodes = layouted.nodes.map((node) => ({
      ...node,
      // 確保所有屬性都被正確設置（左右佈局）
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      // 创建新的 position 对象，确保引用不同
      position: { ...node.position },
    }));
    
    // 从 store 获取最新数据（不依赖 effectiveData，因为它可能还没更新）
    const latestStoreNodes = useStore.getState().nodes;
    const dataToUse = latestStoreNodes.length > 0 ? latestStoreNodes : effectiveData;
    
    // 更新 store 中的节点位置（先更新 store）
    const updatedStoreNodes = dataToUse.map((item) => {
      const layoutedNode = updatedNodes.find(n => n.id === item.id);
      if (layoutedNode) {
        return { ...item, position: { ...layoutedNode.position } };
      }
      return item;
    });
    useStore.getState().setNodes(updatedStoreNodes);
    
    // 立即更新 ReactFlow 的节点位置（直接替换整个数组确保立即生效）
    setNodes(updatedNodes);
    
    setEdges([...layouted.edges]);
    
    // 使用双重 requestAnimationFrame 确保 DOM 完全更新后调整视图
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitView({ padding: 0.2, duration: 300 });
      });
    });
    
    // 后台保存到数据库（不阻塞 UI 更新）
    useStore.getState().saveTreeToSupabase().catch((err) => {
      console.error('Failed to save layout to database', err);
    });
  };

  // 使用 ref 来跟踪之前的节点状态（ID 和父节点关系），检测结构变化
  const previousNodeStateRef = useRef<string>('');
  
  // 当 effectiveData 变化时，同步更新 ReactFlow 的节点和边
  // 检测节点结构变化（ID 变化、父节点关系变化），但不包括仅位置变化
  useEffect(() => {
    // #region agent log - commented out (no /ingest endpoint)
    // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/components/LearningTree.tsx:151',message:'useEffect sync nodes entry',data:{effectiveDataCount:effectiveData.length,effectiveDataIds:effectiveData.map(n=>n.id),storeNodesCount:storeNodes.length,dataPropCount:data.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run6',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // 检查节点状态是否发生变化（ID、父节点关系、标签或描述）
    // 创建节点状态签名：ID、父节点关系、标签和描述的组合
    const nodeStateSignature = effectiveData.length > 0
      ? effectiveData
          .map((n) => `${n.id}:${n.parentId || 'null'}:${n.label}:${n.description || ''}`)
          .sort()
          .join('|')
      : '';
    const structureChanged = nodeStateSignature !== previousNodeStateRef.current;
    
    // 如果结构没有变化且数据不为空，跳过更新（仅位置变化）
    if (!structureChanged && effectiveData.length > 0) {
      // #region agent log - commented out (no /ingest endpoint)
      // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/components/LearningTree.tsx:163',message:'useEffect skipping sync - only position changed',data:{effectiveDataCount:effectiveData.length,currentSignature:nodeStateSignature,previousSignature:previousNodeStateRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run6',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return;
    }
    
    if (effectiveData.length > 0) {
      const newNodes: Node[] = effectiveData.map((item) => ({
        id: item.id,
        type: 'customNode',
        position: item.position || { x: 0, y: 0 },
        targetPosition: Position.Left, // 默認左右佈局
        sourcePosition: Position.Right, // 默認左右佈局
        data: {
          label: item.label,
          raw: item,
        },
      }));

      const newEdges: Edge[] = effectiveData
        .filter((item) => item.parentId !== null)
        .map((item) => ({
          id: `${item.parentId}-${item.id}`,
          source: item.parentId!,
          target: item.id,
          type: 'bezier',
          animated: false,
          style: {
            stroke: '#14b8a6',
            strokeWidth: 2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#14b8a6',
          },
        }));

      // 检查节点是否都堆叠在一起（位置相同或都是 (0,0)）
      const positions = newNodes.map(n => `${n.position.x},${n.position.y}`);
      const uniquePositions = new Set(positions);
      const allNodesStacked = uniquePositions.size === 1;
      
      // 如果节点堆叠在一起，应用自动布局
      let finalNodes = newNodes;
      let finalEdges = newEdges;
      if (allNodesStacked && newNodes.length > 1) {
        // #region agent log - commented out (no /ingest endpoint)
        // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/components/LearningTree.tsx:165',message:'applying auto layout - nodes stacked',data:{nodesCount:newNodes.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'layout'})}).catch(()=>{});
        // #endregion
        const layouted = getLayoutedElements(newNodes, newEdges, 'LR');
        finalNodes = layouted.nodes;
        finalEdges = layouted.edges;
        
        // 更新 store 中的节点位置
        const updatedStoreNodes = effectiveData.map((item) => {
          const layoutedNode = finalNodes.find(n => n.id === item.id);
          if (layoutedNode) {
            return { ...item, position: layoutedNode.position };
          }
          return item;
        });
        useStore.getState().setNodes(updatedStoreNodes);
        // 保存到数据库
        useStore.getState().saveTreeToSupabase().catch(() => {});
      }

      // #region agent log - commented out (no /ingest endpoint)
      // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/components/LearningTree.tsx:220',message:'before setNodes setEdges',data:{newNodesCount:finalNodes.length,newEdgesCount:finalEdges.length,structureChanged,allNodesStacked,appliedLayout:allNodesStacked && newNodes.length > 1},timestamp:Date.now(),sessionId:'debug-session',runId:'run6',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      setNodes(finalNodes);
      setEdges(finalEdges);
      previousNodeStateRef.current = nodeStateSignature;
      previousDataLengthRef.current = effectiveData.length;
      // #region agent log - commented out (no /ingest endpoint)
      // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/components/LearningTree.tsx:188',message:'after setNodes setEdges',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    } else {
      // #region agent log - commented out (no /ingest endpoint)
      // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/components/LearningTree.tsx:166',message:'useEffect clearing nodes - effectiveData is empty',data:{effectiveDataCount:effectiveData.length,storeNodesCount:storeNodes.length,dataPropCount:data.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      // 只有在确实没有数据时才清空（防止在拖动过程中误清空）
      if (storeNodes.length === 0 && data.length === 0) {
        setNodes([]);
        setEdges([]);
        previousNodeStateRef.current = '';
        previousDataLengthRef.current = 0;
      }
    }
  }, [effectiveData, setNodes, setEdges, storeNodes, data]);

  useEffect(() => {
    if (nodes.length > 0) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.2, duration: 300 });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [nodes.length, fitView]);

  // 處理節點focus
  const handleNodeFocus = (nodeId: string) => {
    if (nodeId === 'root') {
      // 回到根節點，清除focus
      setFocusedNode(null);
      setBreadcrumbPath([]);
    } else {
      setFocusedNode(nodeId);
      const path = calculateBreadcrumbPath(nodeId, allNodes);
      setBreadcrumbPath(path);
    }
  };

  // 處理父節點導航
  const handleNavigateToParent = () => {
    if (!focusedNodeId) return;
    
    const currentNode = allNodes.find(n => n.id === focusedNodeId);
    if (currentNode && currentNode.parentId) {
      handleNodeFocus(currentNode.parentId);
    }
  };

  // 處理子節點導航
  const handleNavigateToChild = (childId: string) => {
    handleNodeFocus(childId);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      connectionMode={ConnectionMode.Loose}
      nodeTypes={nodeTypes}
      onNodeClick={(e, node) => {
        // 检查是否点击在输入框上（通过检查事件目标）
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.closest('input')) {
          // 如果点击在输入框上，不触发节点选择
          return;
        }
        
        const rawNode = (node.data as { raw?: TreeNode }).raw;
        if (rawNode) {
          // 單擊打開聊天室面板
          const { openPanel } = useStore.getState();
          openPanel(rawNode.id);
        }
      }}
      onNodeDoubleClick={(e, node) => {
        // 阻止事件冒泡，避免觸發其他事件
        e.stopPropagation();
        e.preventDefault();
        
        // 雙擊聚焦到節點
        const rawNode = (node.data as { raw?: TreeNode }).raw;
        if (rawNode) {
          handleNodeFocus(rawNode.id);
        }
      }}
      onNodeDragStop={async (_, draggedNode) => {
        // #region agent log - commented out (no /ingest endpoint)
        // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/components/LearningTree.tsx:247',message:'ReactFlow onNodeDragStop',data:{nodeId:draggedNode.id,nodePosition:draggedNode.position},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        // 检测重叠：查找与拖拽节点重叠的其他节点
        const otherIntersectingNodes = nodes.filter(
          (node) => node.id !== draggedNode.id && isNodeIntersecting(draggedNode, node),
        );
        
        if (otherIntersectingNodes.length > 0) {
          // 找到第一个重叠的节点作为新的父节点
          const newParentNode = otherIntersectingNodes[0];
          const draggedNodeData = draggedNode.data as { raw?: TreeNode };
          const newParentNodeData = newParentNode.data as { raw?: TreeNode };
          
          if (draggedNodeData.raw && newParentNodeData.raw) {
            const draggedNodeId = draggedNodeData.raw.id;
            const newParentId = newParentNodeData.raw.id;
            
            // 检查是否会造成循环引用（新父节点不能是被拖拽节点的子孙）
            const isDescendant = (ancestorId: string, descendantId: string): boolean => {
              const descendant = storeNodes.find((n) => n.id === descendantId);
              if (!descendant || !descendant.parentId) {
                return false;
              }
              if (descendant.parentId === ancestorId) {
                return true;
              }
              return isDescendant(ancestorId, descendant.parentId);
            };
            
            // 如果新父节点不是被拖拽节点的子孙，则执行 reparent
            if (!isDescendant(draggedNodeId, newParentId)) {
              // #region agent log - commented out (no /ingest endpoint)
              // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/components/LearningTree.tsx:270',message:'reparenting node',data:{draggedNodeId,newParentId},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'reparent'})}).catch(()=>{});
              // #endregion
              // 先更新位置，然后更新父节点
              await onNodeDragStop(draggedNode.id, draggedNode.position);
              await reparentNode(draggedNodeId, newParentId);
              return;
            } else {
              // #region agent log - commented out (no /ingest endpoint)
              // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/components/LearningTree.tsx:277',message:'reparent blocked - circular reference',data:{draggedNodeId,newParentId},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'reparent'})}).catch(()=>{});
              // #endregion
            }
          }
        }
        
        // 如果没有重叠或无法 reparent，仅更新位置
        await onNodeDragStop(draggedNode.id, draggedNode.position);
      }}
    >
      <Controls />
      <Background 
        variant={BackgroundVariant.Dots}
        gap={20} 
        size={1} 
        color="#e2e8f0"
      />
      
      {/* 麵包屑導航 */}
      <BreadcrumbNavigation onNodeClick={handleNodeFocus} />
      
      {/* 導航控制按鈕 */}
      {focusedNodeId && (
        <div className="absolute top-4 right-4 z-20 flex gap-2">
          {/* 返回父節點按鈕 */}
          {(() => {
            const currentNode = allNodes.find(n => n.id === focusedNodeId);
            return currentNode && currentNode.parentId ? (
              <button
                type="button"
                onClick={handleNavigateToParent}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-600 px-3 py-2 text-sm font-medium text-white shadow-lg transition-all hover:bg-slate-700"
                title="返回父節點"
              >
                ⬅️ 父節點
              </button>
            ) : null;
          })()}
          
          {/* 清除focus按鈕 */}
          <button
            type="button"
            onClick={() => handleNodeFocus('root')}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white shadow-lg transition-all hover:bg-teal-700"
            title="顯示全部節點"
          >
            🌳 全部
          </button>
        </div>
      )}
      
      {/* 自动排版按钮 */}
      <div className="absolute bottom-4 right-4 z-10">
        <button
          type="button"
          onClick={handleAutoLayout}
          disabled={nodes.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:bg-teal-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
          title="自動排版"
        >
          <Layout className="h-4 w-4" />
          自動排版
        </button>
      </div>

    </ReactFlow>
  );
}

export default function LearningTree({ data }: LearningTreeProps) {
  return (
    <div className="relative h-full w-full">
      <ReactFlowProvider>
        <LearningTreeInner data={data} />
      </ReactFlowProvider>
    </div>
  );
}

