'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { Plus, BookOpen, LogOut, User as UserIcon } from 'lucide-react';
import LearningTree from './components/LearningTree';
import FlashcardReview from './components/FlashcardReview';
import NodeDetailDialog from '@/components/NodeDetailDialog';
import InspectorPanel from '@/components/InspectorPanel';
import { supabase } from '@/lib/supabaseClient';
import { apiRequest } from '@/lib/config';
import useStore, { type TreeNode } from '@/store/useStore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface LearningTreeRecord {
  id: string;
  user_id: string;
  topic: string;
  nodes: TreeNode[] | null;
}

export default function Home() {
  const router = useRouter();
  const { setCurrentTreeId, createEmptyTree, setNodes, nodes: storeNodes } = useStore();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const [trees, setTrees] = useState<LearningTreeRecord[]>([]);
  const [isTreesLoading, setIsTreesLoading] = useState(false);

  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [currentNodes, setCurrentNodes] = useState<TreeNode[]>([]);

  const [topicInput, setTopicInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isCreateEmptyTreeOpen, setIsCreateEmptyTreeOpen] = useState(false);
  const [emptyTreeTopic, setEmptyTreeTopic] = useState('');
  const [isCreatingEmptyTree, setIsCreatingEmptyTree] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data, error: userError } = await supabase.auth.getUser();
        if (userError) {
          // eslint-disable-next-line no-console
          console.error('Failed to get user', userError);
          setUser(null);
        } else {
          setUser(data.user ?? null);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Unexpected auth error', err);
        setUser(null);
      } finally {
        setIsAuthLoading(false);
      }
    };

    void fetchUser();
  }, []);

  const loadTrees = async (currentUser: User) => {
    // #region agent log
    // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:71',message:'loadTrees entry',data:{userId:currentUser.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{}); // commented out - no /ingest endpoint
    // #endregion
    setIsTreesLoading(true);
    setError(null);
    try {
      const { data, error: treesError } = await supabase
        .from('learning_trees')
        .select('*')
        .eq('user_id', currentUser.id);

      if (treesError) {
        setError('載入學習樹失敗，請稍後再試。');
        // eslint-disable-next-line no-console
        console.error('Failed to load trees', treesError);
        return;
      }

      const typed = (data ?? []) as LearningTreeRecord[];
      // #region agent log
      const firstTree = typed[0];
      const firstTreeNodes = firstTree?.nodes;
      // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:91',message:'trees loaded from DB',data:{treeCount:typed.length,firstTreeId:firstTree?.id,firstTreeTopic:firstTree?.topic,firstTreeNodesType:typeof firstTreeNodes,firstTreeNodesIsNull:firstTreeNodes===null,firstTreeNodesIsArray:Array.isArray(firstTreeNodes),firstTreeNodesCount:Array.isArray(firstTreeNodes)?firstTreeNodes.length:'N/A',firstTreeNodesStringified:JSON.stringify(firstTreeNodes)},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'})}).catch(()=>{}); // commented out - no /ingest endpoint
      // #endregion
      setTrees(typed);

      if (typed.length > 0) {
        const first = typed[0];
        const nodes = (first.nodes ?? []) as TreeNode[];
        // #region agent log
        // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:92',message:'before setting nodes',data:{nodesCount:nodes.length,nodeIds:nodes.map(n=>n.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{}); // commented out - no /ingest endpoint
        // #endregion
        setSelectedTreeId(first.id);
        setCurrentTreeId(first.id);
        setCurrentNodes(nodes);
        setNodes(nodes);
        // #region agent log
        // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:96',message:'after setNodes called',data:{treeId:first.id,nodesCount:nodes.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{}); // commented out - no /ingest endpoint
        // #endregion
        setTopicInput(first.topic ?? '');
      } else {
        setSelectedTreeId(null);
        setCurrentTreeId(null);
        setCurrentNodes([]);
        setNodes([]);
      }
    } catch (err) {
      setError('載入學習樹時發生錯誤。');
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setIsTreesLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      void loadTrees(user);
    }
  }, [user]);

  // 同步 store 中的 nodes 到 currentNodes，确保 UI 即时更新
  useEffect(() => {
    if (storeNodes.length > 0 && selectedTreeId) {
      setCurrentNodes(storeNodes);
    }
  }, [storeNodes, selectedTreeId]);

  const handleSelectTree = (tree: LearningTreeRecord) => {
    // #region agent log
    // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:133',message:'handleSelectTree entry',data:{treeId:tree.id,treeNodesType:typeof tree.nodes,treeNodesIsNull:tree.nodes===null,treeNodesIsArray:Array.isArray(tree.nodes),treeNodesStringified:JSON.stringify(tree.nodes)},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'})}).catch(()=>{}); // commented out - no /ingest endpoint
    // #endregion
    const nodes = (tree.nodes ?? []) as TreeNode[];
    // #region agent log
    // fetch('http://127.0.0.1:8000/ingest/23f54ba5-2f0e-45da-af57-9f911b300207',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:136',message:'handleSelectTree after parse',data:{nodesCount:nodes.length,nodeIds:nodes.map(n=>n.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'})}).catch(()=>{}); // commented out - no /ingest endpoint
    // #endregion
    setSelectedTreeId(tree.id);
    setCurrentTreeId(tree.id);
    setCurrentNodes(nodes);
    setNodes(nodes);
    setTopicInput(tree.topic ?? '');
  };

  const handleNewTree = () => {
    setSelectedTreeId(null);
    setCurrentTreeId(null);
    setCurrentNodes([]);
    setTopicInput('');
    setError(null);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setTrees([]);
    setSelectedTreeId(null);
    setCurrentTreeId(null);
    setCurrentNodes([]);
    setTopicInput('');
    router.push('/auth');
  };

  const handleCreateEmptyTree = async () => {
    if (!user) {
      setError('請先登入後再創建學習樹。');
      return;
    }

    const topic = emptyTreeTopic.trim();
    if (!topic) {
      setError('請先輸入主題。');
      return;
    }

    setIsCreatingEmptyTree(true);
    setError(null);

    try {
      await createEmptyTree(topic, user.id);
      await loadTrees(user);
      setIsCreateEmptyTreeOpen(false);
      setEmptyTreeTopic('');
      setTopicInput(topic);
    } catch (err) {
      setError('創建空白學習樹時發生錯誤。');
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setIsCreatingEmptyTree(false);
    }
  };

  const handleGenerate = async () => {
    if (!user) {
      setError('請先登入後再生成學習樹。');
      return;
    }

    const topic = topicInput.trim();
    if (!topic) {
      setError('請先輸入主題。');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await apiRequest('/generate-tree', {
        method: 'POST',
        body: JSON.stringify({ topic }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data: { nodes?: TreeNode[] } = await response.json();
      const nodes = data.nodes ?? [];

      if (!Array.isArray(nodes) || nodes.length === 0) {
        setError('生成結果為空，請嘗試其他主題或稍後再試。');
        return;
      }

      setCurrentNodes(nodes);
      setNodes(nodes);

      const { data: inserted, error: insertError } = await supabase
        .from('learning_trees')
        .insert({
          user_id: user.id,
          topic,
          nodes,
        })
        .select()
        .single();

      if (insertError) {
        // 儲存失敗但不影響前端顯示
        setError('生成成功，但保存到資料庫時發生錯誤。');
        // eslint-disable-next-line no-console
        console.error('Failed to insert learning tree', insertError);
      } else if (inserted) {
        await loadTrees(user);
        const newTreeId = (inserted as LearningTreeRecord).id;
        setSelectedTreeId(newTreeId);
        setCurrentTreeId(newTreeId);
      }
    } catch (err) {
      setError('生成學習樹時發生錯誤，請確認後端服務已啟動。');
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  if (isAuthLoading) {
    return (
      <main className="flex h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
        <p className="text-sm text-slate-600">正在檢查登入狀態...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-slate-200/20 bg-white/95 p-8 text-center shadow-lg backdrop-blur-sm">
          <h1 className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-2xl font-bold text-transparent">
            Feynman AI
          </h1>
          <p className="mt-2 text-sm text-slate-600">請先登入以管理你的學習樹。</p>
          <Link
            href="/auth"
            className="mt-6 inline-flex items-center justify-center rounded-md bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:from-indigo-600 hover:to-purple-700"
          >
            前往登入
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen w-screen flex flex-col overflow-hidden bg-white">
      {/* Top Header */}
      <header className="flex-shrink-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">
            Feynman AI
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsReviewOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
          >
            <BookOpen className="h-4 w-4" />
            開始複習
          </button>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <UserIcon className="h-4 w-4 text-slate-500" />
            <span className="max-w-[200px] truncate text-sm text-slate-700">{user.email}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              void handleSignOut();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            登出
          </button>
        </div>
      </header>

      {/* Main Dashboard Layout */}
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="flex-shrink-0 w-[250px] border-r border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex h-full flex-col">
            {/* Sidebar Header */}
            <div className="border-b border-slate-200 bg-gradient-to-r from-teal-50 to-cyan-50 px-4 py-4">
              <h2 className="text-sm font-semibold text-slate-800">我的知識樹列表</h2>
            </div>

            {/* New Tree Button */}
            <div className="border-b border-slate-200 p-3">
              <button
                type="button"
                onClick={() => setIsCreateEmptyTreeOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700"
              >
                <Plus className="h-4 w-4" />
                新建樹
              </button>
            </div>

            {/* Trees List */}
            <div className="flex-1 overflow-y-auto p-3">
              {isTreesLoading ? (
                <p className="text-xs text-slate-400">載入中...</p>
              ) : trees.length === 0 ? (
                <p className="text-xs text-slate-400">
                  目前尚未有已保存的學習樹，試著點擊上方「新建樹」按鈕創建一個吧！
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {trees.map((tree) => (
                    <li key={tree.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectTree(tree)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-xs transition ${
                          tree.id === selectedTreeId
                            ? 'bg-teal-50 border border-teal-200 text-teal-700 font-medium'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <div className="truncate">{tree.topic}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </aside>

        {/* Center: Learning Tree Canvas */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Topic Input Bar */}
          <div className="flex-shrink-0 border-b border-slate-200 bg-slate-50 px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  主題
                </label>
                <input
                  type="text"
                  value={topicInput}
                  onChange={(event) => setTopicInput(event.target.value)}
                  placeholder="例如：線性代數、機器學習基礎、作業系統..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleGenerate();
                }}
                disabled={isGenerating}
                className="mt-1 inline-flex h-10 items-center justify-center rounded-lg bg-teal-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60 sm:mt-0"
              >
                {isGenerating ? '生成中...' : '生成學習樹'}
              </button>
            </div>
            {error && (
              <p className="mt-2 text-xs text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>

          {/* Learning Tree Canvas */}
          <div className="relative flex-1 min-h-0 bg-white overflow-hidden">
            {/* Grid Background Pattern */}
            <div className="absolute inset-0 opacity-30">
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>

            {currentNodes.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                尚未有學習樹。請從左側選擇一棵已保存的樹，或在上方輸入主題後點擊「生成學習樹」。
              </div>
            ) : (
              <LearningTree data={currentNodes} />
            )}
          </div>
        </div>

        {/* Inspector Panel */}
        <InspectorPanel />
      </div>
      
      {/* 节点详情弹窗 - 暫時停用 */}
      {/* <NodeDetailDialog /> */}

      {/* 闪卡复习组件 */}
      <FlashcardReview
        open={isReviewOpen}
        onOpenChange={setIsReviewOpen}
        user={user}
      />

      {/* 新建空白树对话框 */}
      <Dialog open={isCreateEmptyTreeOpen} onOpenChange={setIsCreateEmptyTreeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建空白學習樹</DialogTitle>
            <DialogDescription>
              輸入主題名稱，創建一個空白的學習樹，之後可以手動添加節點。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              主題
            </label>
            <input
              type="text"
              value={emptyTreeTopic}
              onChange={(e) => setEmptyTreeTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && emptyTreeTopic.trim()) {
                  void handleCreateEmptyTree();
                }
              }}
              placeholder="例如：線性代數、機器學習基礎..."
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-offset-background placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              autoFocus
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setIsCreateEmptyTreeOpen(false)}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                void handleCreateEmptyTree();
              }}
              disabled={isCreatingEmptyTree || !emptyTreeTopic.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreatingEmptyTree ? '創建中...' : '創建'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

