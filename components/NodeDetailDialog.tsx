'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { X, ChevronRight } from 'lucide-react';
import useStore, { type TreeNode } from '@/store/useStore';
import { supabase } from '@/lib/supabaseClient';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import AITutorTab from '@/app/components/AITutorTab';
import NotesTab from '@/app/components/NotesTab';
import FilesTab from '@/app/components/FilesTab';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function NodeDetailDialog() {
  const { selectedNode, currentTreeId, isPanelOpen, closePanel, nodes } = useStore();
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user on mount
  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    };
    void fetchUser();
  }, []);

  // Build breadcrumb path from root to current node
  const breadcrumbPath = useMemo(() => {
    if (!selectedNode || !nodes.length) {
      return [];
    }

    const path: TreeNode[] = [];
    let currentNode: TreeNode | undefined = selectedNode;

    // Traverse up the tree to build the path
    while (currentNode) {
      path.unshift(currentNode); // Add to beginning of array
      
      // Find parent node
      if (currentNode.parentId) {
        currentNode = nodes.find((n) => n.id === currentNode!.parentId);
      } else {
        currentNode = undefined; // Reached root
      }
    }

    return path;
  }, [selectedNode, nodes]);

  if (!selectedNode) {
    return null;
  }

  return (
    <Dialog open={isPanelOpen} onOpenChange={(open) => !open && closePanel()}>
      <DialogContent className="w-[800px] max-w-[90vw] h-[80vh] max-h-[80vh] p-0 flex flex-col overflow-hidden bg-white rounded-lg shadow-xl border-0 [&>button]:hidden">
        {/* Header */}
        <DialogHeader className="flex-shrink-0 border-b border-slate-200/20 bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4">
          <div className="flex flex-col gap-2">
            {/* Breadcrumb Navigation */}
            {breadcrumbPath.length > 1 && (
              <nav 
                className="flex items-center gap-1 text-xs text-white/80 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" 
                aria-label="Breadcrumb"
              >
                {breadcrumbPath.map((node, index) => (
                  <React.Fragment key={node.id}>
                    {index > 0 && (
                      <ChevronRight className="h-3 w-3 text-white/60 flex-shrink-0 mx-0.5" />
                    )}
                    <span
                      className={`truncate max-w-[150px] px-1.5 py-0.5 rounded transition-colors flex-shrink-0 ${
                        index === breadcrumbPath.length - 1
                          ? 'text-white font-medium'
                          : 'text-white/80 hover:text-white hover:bg-white/10 cursor-pointer'
                      }`}
                      title={node.label}
                      onClick={() => {
                        if (index < breadcrumbPath.length - 1) {
                          const { openPanel } = useStore.getState();
                          openPanel(node.id);
                        }
                      }}
                    >
                      {node.label}
                    </span>
                  </React.Fragment>
                ))}
              </nav>
            )}
            
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-base font-semibold text-white break-words">
                  {selectedNode.label}
                </DialogTitle>
                {selectedNode.description && (
                  <p className="mt-1 text-xs text-white/80 break-words line-clamp-2">
                    {selectedNode.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="flex-shrink-0 rounded-md p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
                aria-label="關閉"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Tabs Content */}
        <Tabs defaultValue="ai-tutor" className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-shrink-0 border-b border-slate-200/20 px-6 bg-white">
            <TabsList className="bg-transparent h-auto p-0 gap-1">
              <TabsTrigger
                value="ai-tutor"
                className="data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-700 text-slate-600 hover:text-slate-900 rounded-md px-3 py-2 text-sm font-medium"
              >
                💬 AI 導師
              </TabsTrigger>
              <TabsTrigger
                value="notes"
                className="data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-700 text-slate-600 hover:text-slate-900 rounded-md px-3 py-2 text-sm font-medium"
              >
                📝 筆記
              </TabsTrigger>
              <TabsTrigger
                value="files"
                className="data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-700 text-slate-600 hover:text-slate-900 rounded-md px-3 py-2 text-sm font-medium"
              >
                📂 文件
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="ai-tutor" className="flex-1 min-h-0 m-0 mt-0 overflow-hidden">
            <AITutorTab
              selectedNode={selectedNode}
              currentTreeId={currentTreeId}
              userId={userId}
            />
          </TabsContent>

          <TabsContent value="notes" className="flex-1 min-h-0 m-0 mt-0 overflow-hidden">
            <NotesTab
              selectedNode={selectedNode}
              currentTreeId={currentTreeId}
              userId={userId}
            />
          </TabsContent>

          <TabsContent value="files" className="flex-1 min-h-0 m-0 mt-0 overflow-hidden">
            <FilesTab
              selectedNode={selectedNode}
              currentTreeId={currentTreeId}
              userId={userId}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

