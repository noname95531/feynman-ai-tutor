'use client';

import { X, FileText, MessageSquare, Folder } from 'lucide-react';
import useStore, { TreeNode } from '@/store/useStore';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import AITutorTab from '@/app/components/AITutorTab';
import NotesTab from '@/app/components/NotesTab';
import FilesTab from '@/app/components/FilesTab';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function InspectorPanel() {
  const { selectedNode, currentTreeId, clearSelection, isPanelOpen, closePanel } = useStore();
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

  if (!isPanelOpen || !selectedNode) {
    return null;
  }

  return (
    <div className="fixed right-4 top-20 bottom-4 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden z-50">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-gradient-to-r from-teal-50 to-cyan-50 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-teal-500"></div>
              <h3 className="text-base font-semibold text-slate-900 truncate">
                {selectedNode.label}
              </h3>
            </div>
            {selectedNode.description && (
              <p className="text-sm text-slate-600 line-clamp-3">
                {selectedNode.description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={closePanel}
            className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white/50 hover:text-slate-600 transition-colors"
            aria-label="關閉面板"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="ai-tutor" className="flex-1 flex flex-col min-h-0">
        <div className="flex-shrink-0 border-b border-slate-200 px-4 py-2">
          <TabsList className="bg-slate-50 h-auto p-1 gap-0 w-full">
            <TabsTrigger
              value="ai-tutor"
              className="flex-1 data-[state=active]:bg-white data-[state=active]:text-teal-700 data-[state=active]:shadow-sm text-slate-600 hover:text-slate-900 rounded-md px-3 py-2 text-sm font-medium transition-all"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              AI 導師
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="flex-1 data-[state=active]:bg-white data-[state=active]:text-teal-700 data-[state=active]:shadow-sm text-slate-600 hover:text-slate-900 rounded-md px-3 py-2 text-sm font-medium transition-all"
            >
              <FileText className="h-4 w-4 mr-2" />
              筆記
            </TabsTrigger>
            <TabsTrigger
              value="files"
              className="flex-1 data-[state=active]:bg-white data-[state=active]:text-teal-700 data-[state=active]:shadow-sm text-slate-600 hover:text-slate-900 rounded-md px-3 py-2 text-sm font-medium transition-all"
            >
              <Folder className="h-4 w-4 mr-2" />
              文件
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="ai-tutor" className="flex-1 min-h-0 m-0">
          <AITutorTab
            selectedNode={selectedNode}
            currentTreeId={currentTreeId}
            userId={userId}
          />
        </TabsContent>

        <TabsContent value="notes" className="flex-1 min-h-0 m-0">
          <NotesTab
            selectedNode={selectedNode}
            currentTreeId={currentTreeId}
            userId={userId}
          />
        </TabsContent>

        <TabsContent value="files" className="flex-1 min-h-0 m-0">
          <FilesTab
            selectedNode={selectedNode}
            currentTreeId={currentTreeId}
            userId={userId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}