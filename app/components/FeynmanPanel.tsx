'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import useStore from '@/store/useStore';
import { supabase } from '@/lib/supabaseClient';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import AITutorTab from './AITutorTab';
import NotesTab from './NotesTab';
import FilesTab from './FilesTab';

export default function FeynmanPanel() {
  const { selectedNode, currentTreeId, clearSelection } = useStore();
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

  return (
    <div className="flex h-full w-full flex-col bg-white/95 backdrop-blur-sm shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-200/20 bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-white break-words">
              {selectedNode?.label ?? '未選擇節點'}
            </h3>
            {selectedNode?.description && (
              <p className="mt-1 text-xs text-white/80 break-words line-clamp-2">
                {selectedNode.description}
              </p>
            )}
          </div>
          {selectedNode && (
            <button
              type="button"
              onClick={clearSelection}
              className="flex-shrink-0 rounded-md p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
              aria-label="關閉"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      {selectedNode ? (
        <Tabs defaultValue="ai-tutor" className="flex-1 flex flex-col min-h-0">
          <div className="flex-shrink-0 border-b border-slate-200/20 px-4">
            <TabsList className="bg-transparent h-auto p-0 gap-1">
              <TabsTrigger
                value="ai-tutor"
                className="data-[state=active]:bg-white/20 data-[state=active]:text-white text-white/80 hover:text-white rounded-md px-3 py-2 text-sm font-medium"
              >
                💬 AI 導師
              </TabsTrigger>
              <TabsTrigger
                value="notes"
                className="data-[state=active]:bg-white/20 data-[state=active]:text-white text-white/80 hover:text-white rounded-md px-3 py-2 text-sm font-medium"
              >
                📝 筆記
              </TabsTrigger>
              <TabsTrigger
                value="files"
                className="data-[state=active]:bg-white/20 data-[state=active]:text-white text-white/80 hover:text-white rounded-md px-3 py-2 text-sm font-medium"
              >
                📂 文件
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="ai-tutor" className="flex-1 min-h-0 m-0 mt-0">
            <AITutorTab
              selectedNode={selectedNode}
              currentTreeId={currentTreeId}
              userId={userId}
            />
          </TabsContent>

          <TabsContent value="notes" className="flex-1 min-h-0 m-0 mt-0">
            <NotesTab
              selectedNode={selectedNode}
              currentTreeId={currentTreeId}
              userId={userId}
            />
          </TabsContent>

          <TabsContent value="files" className="flex-1 min-h-0 m-0 mt-0">
            <FilesTab
              selectedNode={selectedNode}
              currentTreeId={currentTreeId}
              userId={userId}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-slate-500 text-center px-4">
            在學習樹中點選一個節點以查看細節，<br />
            並與 AI 導師進行費曼學習對話。
          </p>
        </div>
      )}
    </div>
  );
}
