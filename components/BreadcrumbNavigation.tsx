'use client';

import { ChevronRight, Home } from 'lucide-react';
import useStore, { TreeNode } from '@/store/useStore';

interface BreadcrumbNavigationProps {
  onNodeClick: (nodeId: string) => void;
}

export default function BreadcrumbNavigation({ onNodeClick }: BreadcrumbNavigationProps) {
  const { breadcrumbPath, focusedNodeId, nodes } = useStore();

  if (!focusedNodeId || breadcrumbPath.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-4 left-4 z-20 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 px-4 py-3">
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => onNodeClick('root')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
          title="回到根節點"
        >
          <Home className="h-4 w-4 text-teal-600" />
          <span className="text-slate-700 font-medium">根節點</span>
        </button>
        
        {breadcrumbPath.map((node, index) => (
          <div key={node.id} className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4 text-slate-300" />
            <button
              onClick={() => onNodeClick(node.id)}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                index === breadcrumbPath.length - 1
                  ? 'bg-teal-50 text-teal-700 font-medium border border-teal-200'
                  : 'hover:bg-slate-50 text-slate-600'
              }`}
              title={node.description || node.label}
            >
              {node.label}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}