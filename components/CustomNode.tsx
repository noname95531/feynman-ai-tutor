'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Handle, Position, NodeProps, useEdges } from 'reactflow';
import useStore from '@/store/useStore';

interface CustomNodeData {
  label: string;
  raw: {
    id: string;
    parentId: string | null;
    description?: string;
  };
}

export default function CustomNode({ data, id, selected, targetPosition, sourcePosition }: NodeProps<CustomNodeData>) {
  const { addNode, deleteNode, updateNodeLabel, updateNodeDescription, nodes, focusedNodeId, setFocusedNode, setBreadcrumbPath } = useStore();
  const edges = useEdges();
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editLabelValue, setEditLabelValue] = useState(data.label);
  const [editDescriptionValue, setEditDescriptionValue] = useState(data.raw.description || '');
  const [isHovered, setIsHovered] = useState(false);

  // 当 data.label 变化时，同步更新 editLabelValue（如果不在编辑状态）
  useEffect(() => {
    if (!isEditingLabel) {
      setEditLabelValue(data.label);
    }
  }, [data.label, isEditingLabel]);

  // 当 data.raw.description 变化时，同步更新 editDescriptionValue（如果不在编辑状态）
  useEffect(() => {
    if (!isEditingDescription) {
      setEditDescriptionValue(data.raw.description || '');
    }
  }, [data.raw.description, isEditingDescription]);

  // 如果是新创建的节点（label 为"新節點"），自动进入编辑状态
  useEffect(() => {
    if (data.label === '新節點' && !isEditingLabel) {
      setIsEditingLabel(true);
      setEditLabelValue('');
    }
  }, [data.label, isEditingLabel]);

  const isRootNode = data.raw.parentId === null;

  // 计算节点层级以确定图标
  const nodeLevel = useMemo(() => {
    if (isRootNode) return 0; // Root
    const parent = nodes.find((n) => n.id === data.raw.parentId);
    if (parent && parent.parentId === null) return 1; // Chapter (父节点是 Root)
    return 2; // Topic (其他情况)
  }, [isRootNode, nodes, data.raw.parentId]);

  // 根据层级返回图标
  const getNodeIcon = () => {
    if (nodeLevel === 0) return '🌳'; // Root
    if (nodeLevel === 1) return '📖'; // Chapter
    return '💡'; // Topic
  };

  // 检查是否有连接（用于改变 Handle 颜色）
  const hasConnections = useMemo(() => {
    return edges.some((edge) => edge.source === id || edge.target === id);
  }, [edges, id]);

  const handleLabelDoubleClick = useCallback(() => {
    setIsEditingLabel(true);
    setEditLabelValue(data.label);
  }, [data.label]);

  const handleDescriptionDoubleClick = useCallback(() => {
    setIsEditingDescription(true);
    setEditDescriptionValue(data.raw.description || '');
  }, [data.raw.description]);

  const handleLabelBlur = useCallback(async () => {
    const trimmedValue = editLabelValue.trim();
    
    // 如果输入有内容，保存新标签
    if (trimmedValue) {
      // 只有当新标签与当前标签不同时才更新
      if (trimmedValue !== data.label) {
        try {
          await updateNodeLabel(id, trimmedValue);
          setIsEditingLabel(false);
        } catch (err) {
          console.error('Failed to update node label', err);
        }
      } else {
        setIsEditingLabel(false);
      }
    } else {
      // 如果输入为空，恢复原标签并退出编辑状态
      setEditLabelValue(data.label);
      setIsEditingLabel(false);
    }
  }, [editLabelValue, data.label, id, updateNodeLabel]);

  const handleDescriptionBlur = useCallback(async () => {
    const trimmedValue = editDescriptionValue.trim();
    
    // 保存描述（可以为空）
    try {
      await updateNodeDescription(id, trimmedValue);
      setIsEditingDescription(false);
    } catch (err) {
      console.error('Failed to update node description', err);
    }
  }, [editDescriptionValue, id, updateNodeDescription]);

  const handleLabelKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await handleLabelBlur();
      } else if (e.key === 'Escape') {
        setIsEditingLabel(false);
        setEditLabelValue(data.label);
      }
    },
    [handleLabelBlur, data.label],
  );

  const handleDescriptionKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Enter 保存，Shift+Enter 换行
        e.preventDefault();
        await handleDescriptionBlur();
      } else if (e.key === 'Escape') {
        setIsEditingDescription(false);
        setEditDescriptionValue(data.raw.description || '');
      }
    },
    [handleDescriptionBlur, data.raw.description],
  );

  const handleAddChild = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation(); // 防止触发节点选择或拖拽
      await addNode(id);
    },
    [id, addNode],
  );

  const handleDelete = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation(); // 防止触发节点选择或拖拽
      if (!isRootNode) {
        await deleteNode(id);
      }
    },
    [id, isRootNode, deleteNode],
  );

  // 計算麵包屑路徑
  const calculateBreadcrumbPath = (nodeId: string, allNodes: any[]): any[] => {
    const path: any[] = [];
    let currentNode = allNodes.find((n: any) => n.id === nodeId);
    
    while (currentNode && currentNode.parentId) {
      const parent = allNodes.find((n: any) => n.id === currentNode.parentId);
      if (parent) {
        path.unshift(parent);
        currentNode = parent;
      } else {
        break;
      }
    }
    
    // 添加當前節點
    const targetNode = allNodes.find((n: any) => n.id === nodeId);
    if (targetNode) {
      path.push(targetNode);
    }
    
    return path;
  };

  // 處理focus到子節點
  const handleFocusToChild = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();
      setFocusedNode(id);
      const path = calculateBreadcrumbPath(id, nodes);
      setBreadcrumbPath(path);
    },
    [id, nodes, setFocusedNode, setBreadcrumbPath],
  );

  // 檢查是否有子節點
  const hasChildren = useMemo(() => {
    return nodes.some(node => node.parentId === id);
  }, [nodes, id]);

  return (
    <div
      className="group relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        // 如果正在编辑，阻止点击事件冒泡，避免触发节点选择
        if (isEditingLabel || isEditingDescription) {
          e.stopPropagation();
        }
      }}
    >
      {/* Target Handle - 輸入連接點（左右佈局：左側，上下佈局：上側） */}
      <Handle
        type="target"
        position={targetPosition || Position.Left}
        className={`!w-2 !h-2 !rounded-full !border-0 transition-colors duration-200 ${
          hasConnections ? '!bg-teal-500' : '!bg-slate-300'
        }`}
      />

      {/* 圓形節點 */}
      <div className={`relative w-16 h-16 rounded-full shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-110 ${
        selected
          ? 'bg-gradient-to-br from-teal-400 to-teal-600 shadow-teal-200'
          : nodeLevel === 0 
            ? 'bg-gradient-to-br from-slate-100 to-slate-200 hover:from-slate-200 hover:to-slate-300'
            : nodeLevel === 1
            ? 'bg-gradient-to-br from-teal-50 to-teal-100 hover:from-teal-100 hover:to-teal-200'
            : 'bg-gradient-to-br from-cyan-50 to-cyan-100 hover:from-cyan-100 hover:to-cyan-200'
      }`}>
        {/* 節點圖標 */}
        <div className={`absolute inset-0 flex items-center justify-center text-xl ${
          selected ? 'text-white' : 'text-slate-600'
        }`}>
          {getNodeIcon()}
        </div>

        {/* 編輯狀態覆蓋層 */}
        {(isEditingLabel || isEditingDescription) && (
          <div className="absolute inset-0 bg-white/95 rounded-full flex items-center justify-center">
            <div className="w-3 h-3 bg-teal-500 rounded-full animate-pulse"></div>
          </div>
        )}
      </div>

      {/* 節點標籤 */}
      <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 min-w-max max-w-32">
        {isEditingLabel ? (
          <input
            type="text"
            value={editLabelValue}
            onChange={(e) => setEditLabelValue(e.target.value)}
            onClick={(e) => {
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onBlur={(e) => {
              setTimeout(() => {
                if (document.activeElement !== e.currentTarget) {
                  handleLabelBlur();
                }
              }, 150);
            }}
            onKeyDown={handleLabelKeyDown}
            className="w-full rounded-md border-2 border-teal-500 bg-white px-2 py-1 text-xs font-medium text-center outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1"
            autoFocus
            placeholder="節點標題"
          />
        ) : (
          <div
            onDoubleClick={handleLabelDoubleClick}
            className="cursor-text select-none text-xs font-medium text-slate-700 text-center bg-white/90 backdrop-blur-sm rounded-md px-2 py-1 shadow-sm border border-slate-200"
          >
            {data.label}
          </div>
        )}
      </div>

      {/* 描述（如果有的話） */}
      {data.raw.description && !isEditingDescription && (
        <div
          onDoubleClick={handleDescriptionDoubleClick}
          className="absolute top-full left-1/2 transform -translate-x-1/2 mt-10 min-w-max max-w-40 cursor-text select-none text-xs text-slate-500 text-center bg-white/80 backdrop-blur-sm rounded-md px-2 py-1 shadow-sm border border-slate-100 line-clamp-2"
        >
          {data.raw.description}
        </div>
      )}

      {/* 描述編輯 */}
      {isEditingDescription && (
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-10 min-w-max max-w-40">
          <textarea
            value={editDescriptionValue}
            onChange={(e) => setEditDescriptionValue(e.target.value)}
            onClick={(e) => {
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onBlur={(e) => {
              setTimeout(() => {
                if (document.activeElement !== e.currentTarget) {
                  handleDescriptionBlur();
                }
              }, 150);
            }}
            onKeyDown={handleDescriptionKeyDown}
            className="w-full rounded-md border-2 border-teal-500 bg-white px-2 py-1 text-xs text-slate-600 outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 resize-none"
            rows={2}
            placeholder="節點描述"
          />
        </div>
      )}

      {/* 操作按鈕（Hover 時顯示） */}
      <div
        className={`absolute -bottom-2 left-1/2 transform -translate-x-1/2 flex items-center gap-1 transition-opacity duration-200 ${
          isHovered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={handleAddChild}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-500 text-white text-xs shadow-md transition-all hover:bg-teal-600 hover:shadow-lg hover:scale-110"
          title="添加子节点"
        >
          +
        </button>
        {hasChildren && (
          <button
            type="button"
            onDoubleClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleFocusToChild(e);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white text-xs shadow-md transition-all hover:bg-emerald-600 hover:shadow-lg hover:scale-110"
            title="雙擊聚焦到此節點"
          >
            ◉
          </button>
        )}
        {!isRootNode && (
          <button
            type="button"
            onClick={handleDelete}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white text-xs shadow-md transition-all hover:bg-red-600 hover:shadow-lg hover:scale-110"
            title="删除节点"
          >
            ×
          </button>
        )}
      </div>

      {/* Source Handle - 輸出連接點（左右佈局：右側，上下佈局：下側） */}
      <Handle
        type="source"
        position={sourcePosition || Position.Right}
        className={`!w-2 !h-2 !rounded-full !border-0 transition-colors duration-200 ${
          hasConnections ? '!bg-teal-500' : '!bg-slate-300'
        }`}
      />
    </div>
  );
}

