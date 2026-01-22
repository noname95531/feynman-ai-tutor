'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Upload, File, Trash2, Download, Loader2, X, CheckCircle, Info, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { apiRequest } from '@/lib/config';
import type { TreeNode } from '@/store/useStore';

interface FileItem {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  file_type?: string;
  created_at?: string;
}

interface FilesTabProps {
  selectedNode: TreeNode | null;
  currentTreeId: string | null;
  userId: string | null;
}

interface ToastMessage {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export default function FilesTab({
  selectedNode,
  currentTreeId,
  userId,
}: FilesTabProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load files when node changes
  useEffect(() => {
    if (!selectedNode || !currentTreeId || !userId) {
      setFiles([]);
      setIsLoading(false);
      return;
    }

    const loadFiles = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('node_files')
          .select('*')
          .eq('tree_id', currentTreeId)
          .eq('node_id', selectedNode.id)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to load files:', error);
          setFiles([]);
        } else {
          setFiles(data || []);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error loading files:', err);
        setFiles([]);
      } finally {
        setIsLoading(false);
      }
    };

    void loadFiles();
  }, [selectedNode?.id, currentTreeId, userId]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`;
  };

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    const toast: ToastMessage = { id, message, type };
    setToasts(prev => [...prev, toast]);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const processFileWithAI = async (fileData: FileItem & { storage_path?: string }) => {
    if (!userId || !currentTreeId || !selectedNode) {
      return;
    }

    try {
      // Show processing toast
      showToast('正在 AI 解析文件...', 'info');

      // 優先使用 storage_path，如果沒有則從 URL 提取路徑
      let filePath: string;
      
      if (fileData.storage_path) {
        // 使用安全路徑 (新上傳的文件)
        filePath = fileData.storage_path;
      } else {
        // 從 URL 提取路徑 (舊有文件的兼容性處理)
        const urlObj = new URL(fileData.file_url);
        const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/node_assets\/(.+)/);
        filePath = pathMatch ? pathMatch[1] : `${userId}/${currentTreeId}/${selectedNode.id}/${fileData.file_name}`;
      }

      // Call backend API (使用安全路徑)
      const response = await apiRequest('/process-file', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          tree_id: currentTreeId,
          node_id: selectedNode.id,
          file_path: filePath, // 這裡必須是安全路徑，因為後端需要用這個路徑下載文件
          file_type: fileData.file_type || 'application/octet-stream',
        }),
      });

      if (response.ok) {
        showToast('文件解析完成，AI 已讀取內容', 'success');
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      // Only log error to console, don't block user operations
      // eslint-disable-next-line no-console
      console.error('Error processing file with AI:', error);
    }
  };

  const handleFileUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !selectedNode || !currentTreeId || !userId) {
      return;
    }

    setIsUploading(true);

    try {
      const file = fileList[0];
      
      // 1. 生成安全路徑 (Safe Path)
      const fileExt = file.name.split('.').pop() || '';
      const safeFileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const storagePath = `${userId}/${currentTreeId}/${selectedNode.id}/${safeFileName}`;

      // 2. 上傳到 Storage (使用安全路徑)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('node_assets')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // 3. 獲取公開連結
      const { data: urlData } = supabase.storage
        .from('node_assets')
        .getPublicUrl(storagePath);

      if (!urlData?.publicUrl) {
        throw new Error('Failed to get public URL');
      }

      // 4. 寫入 Database (原始檔名顯示，安全路徑存儲)
      const { data: fileData, error: dbError } = await supabase
        .from('node_files')
        .insert({
          user_id: userId,
          tree_id: currentTreeId,
          node_id: selectedNode.id,
          file_name: file.name, // 存原始檔名，用於 UI 顯示
          file_url: urlData.publicUrl, // 使用安全路徑的公開連結
          file_size: file.size,
          file_type: file.type,
          // 如果資料庫有 storage_path 欄位，可以取消註解下面這行
          // storage_path: storagePath, // 存安全路徑，用於後端處理
        })
        .select()
        .single();

      if (dbError) {
        throw dbError;
      }

      // 5. 添加到本地狀態
      if (fileData) {
        // 為了後續處理，我們需要在 fileData 中添加 storage_path 信息
        const enhancedFileData = {
          ...fileData,
          storage_path: storagePath // 臨時添加，用於 AI 處理
        };
        
        setFiles((prev) => [fileData, ...prev]);
        
        // 6. 觸發 AI 文件處理 (使用安全路徑)
        void processFileWithAI(enhancedFileData);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error uploading file:', error);
      
      // 提供更詳細的錯誤信息
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = (error as { message: string }).message;
        if (errorMessage.includes('Invalid key') || errorMessage.includes('StorageApiError')) {
          alert('文件名包含特殊字符，上傳失敗。請重新命名文件後再試。');
        } else {
          alert(`文件上傳失敗：${errorMessage}`);
        }
      } else {
        alert('文件上傳失敗，請稍後再試。');
      }
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (fileId: string, filePath: string) => {
    if (!confirm('確定要刪除這個文件嗎？')) {
      return;
    }

    try {
      // Delete from storage
      // filePath should be in format: userId/treeId/nodeId/filename
      const { error: storageError } = await supabase.storage
        .from('node_assets')
        .remove([filePath]);

      if (storageError) {
        // eslint-disable-next-line no-console
        console.error('Failed to delete from storage:', storageError);
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('node_files')
        .delete()
        .eq('id', fileId);

      if (dbError) {
        throw dbError;
      }

      // Remove from local state
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error deleting file:', error);
      alert('文件刪除失敗，請稍後再試。');
    }
  };

  const handleDrag = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'dragenter' || event.type === 'dragover') {
      setDragActive(true);
    } else if (event.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      void handleFileUpload(event.dataTransfer.files);
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void handleFileUpload(event.target.files);
  };

  if (!selectedNode) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-slate-500 text-center px-4">
          請先選擇一個節點以查看或上傳文件。
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden relative">
      {/* Upload area */}
      <div className="flex-shrink-0 p-4 border-b border-slate-200/20">
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`relative rounded-lg border-2 border-dashed transition-colors ${
            dragActive
              ? 'border-indigo-500 bg-indigo-50'
              : 'border-slate-300 bg-slate-50 hover:border-slate-400'
          } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileInputChange}
            className="hidden"
            disabled={isUploading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full py-6 px-4 flex flex-col items-center justify-center gap-2 text-slate-600 hover:text-slate-900 transition-colors disabled:cursor-not-allowed"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm">上傳中...</span>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6" />
                <span className="text-sm font-medium">點擊或拖拽文件到此處上傳</span>
                <span className="text-xs text-slate-500">支持單個文件上傳</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Files list */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-500">載入中...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-500 text-center px-4">
              尚未上傳任何文件
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence>
              {files.map((file) => (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                >
                  <File className="h-5 w-5 text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <a
                      href={file.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-slate-900 hover:text-indigo-600 truncate block"
                    >
                      {file.file_name}
                    </a>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatFileSize(file.file_size)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <a
                      href={file.file_url}
                      download={file.file_name}
                      className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                      title="下載"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        // Extract storage path from URL for deletion
                        // URL format: https://xxx.supabase.co/storage/v1/object/public/node_assets/userId/treeId/nodeId/safeFileName
                        try {
                          const urlObj = new URL(file.file_url);
                          const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/node_assets\/(.+)/);
                          const storagePath = pathMatch ? pathMatch[1] : '';
                          
                          if (storagePath) {
                            void handleDelete(file.id, storagePath);
                          } else {
                            // 如果無法從 URL 提取路徑，顯示錯誤
                            alert('無法確定文件存儲路徑，刪除失敗。');
                          }
                        } catch (error) {
                          // eslint-disable-next-line no-console
                          console.error('Error extracting storage path:', error);
                          alert('無法確定文件存儲路徑，刪除失敗。');
                        }
                      }}
                      className="p-1.5 rounded-md text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="刪除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 100, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.95 }}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg max-w-sm ${
                toast.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : toast.type === 'error'
                  ? 'bg-red-50 border border-red-200 text-red-800'
                  : 'bg-blue-50 border border-blue-200 text-blue-800'
              }`}
            >
              {toast.type === 'success' && <CheckCircle className="h-5 w-5 text-green-600" />}
              {toast.type === 'error' && <AlertCircle className="h-5 w-5 text-red-600" />}
              {toast.type === 'info' && <Info className="h-5 w-5 text-blue-600" />}
              <span className="text-sm font-medium flex-1">{toast.message}</span>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

