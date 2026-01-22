'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { apiRequest } from '@/lib/config';
import type { TreeNode } from '@/store/useStore';

interface NotesTabProps {
  selectedNode: TreeNode | null;
  currentTreeId: string | null;
  userId: string | null;
}

export default function NotesTab({
  selectedNode,
  currentTreeId,
  userId,
}: NotesTabProps) {
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load note when node changes
  useEffect(() => {
    if (!selectedNode || !currentTreeId || !userId) {
      setNote('');
      setIsLoading(false);
      setSaveStatus('idle');
      return;
    }

    const loadNote = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('node_notes')
          .select('content')
          .eq('tree_id', currentTreeId)
          .eq('node_id', selectedNode.id)
          .eq('user_id', userId)
          .single();

        if (error && error.code !== 'PGRST116') {
          // PGRST116 means no rows found, which is expected for new notes
          // eslint-disable-next-line no-console
          console.error('Failed to load note:', error);
        }

        if (data?.content) {
          setNote(data.content);
        } else {
          setNote('');
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error loading note:', err);
        setNote('');
      } finally {
        setIsLoading(false);
        setSaveStatus('idle');
      }
    };

    void loadNote();
  }, [selectedNode?.id, currentTreeId, userId]);

  // Auto-save with debounce
  useEffect(() => {
    if (!selectedNode || !currentTreeId || !userId) {
      return;
    }

    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set save status to saving
    setSaveStatus('saving');

    // Set new timer for auto-save (1 second debounce)
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('node_notes')
          .upsert(
            {
              user_id: userId,
              tree_id: currentTreeId,
              node_id: selectedNode.id,
              content: note,
            },
            {
              onConflict: 'user_id,tree_id,node_id',
            },
          );

        if (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to save note:', error);
          setSaveStatus('idle');
        } else {
          setSaveStatus('saved');
          
          // 同步向量化到后端 (非阻塞)
          syncNoteToBackend(userId, currentTreeId, selectedNode.id, note);
          
          // Reset to idle after 2 seconds
          setTimeout(() => {
            setSaveStatus('idle');
          }, 2000);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error saving note:', err);
        setSaveStatus('idle');
      }
    }, 1000);

    // Cleanup function
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [note, selectedNode?.id, currentTreeId, userId]);

  // 向量化同步函数 (射后不理)
  const syncNoteToBackend = async (
    userId: string,
    treeId: string,
    nodeId: string,
    content: string,
  ) => {
    try {
      const response = await apiRequest('/sync-note', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          tree_id: treeId,
          node_id: nodeId,
          content: content,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // eslint-disable-next-line no-console
      console.log('✅ Note synchronized to vector database');
    } catch (error) {
      // 静默失败，只在console打印警告
      // eslint-disable-next-line no-console
      console.warn('⚠️ Failed to sync note to vector database:', error);
    }
  };

  if (!selectedNode) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-slate-500 text-center px-4">
          請先選擇一個節點以查看或編輯筆記。
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Save status indicator */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-slate-200/20">
        <AnimatePresence mode="wait">
          {saveStatus === 'saving' && (
            <motion.div
              key="saving"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex items-center gap-2 text-xs text-slate-500"
            >
              <div className="h-2 w-2 rounded-full bg-slate-400 animate-pulse" />
              <span>保存中...</span>
            </motion.div>
          )}
          {saveStatus === 'saved' && (
            <motion.div
              key="saved"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex items-center gap-2 text-xs text-green-600"
            >
              <Check className="h-3 w-3" />
              <span>已保存</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Textarea */}
      <div className="flex-1 min-h-0 p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-500">載入中...</p>
          </div>
        ) : (
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="在此輸入你的筆記..."
            className="w-full h-full resize-none rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm shadow-sm outline-none ring-offset-background placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          />
        )}
      </div>
    </div>
  );
}








