'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Bot, Send, Mic, MicOff, AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { apiRequest } from '@/lib/config';
import type { TreeNode } from '@/store/useStore';

type Role = 'user' | 'assistant';

interface ChatMessage {
  role: Role;
  content: string;
  audioUrl?: string; // 可選的音頻URL，用於顯示語音消息
}

interface ToastMessage {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

interface AITutorTabProps {
  selectedNode: TreeNode | null;
  currentTreeId: string | null;
  userId: string | null;
}

export default function AITutorTab({
  selectedNode,
  currentTreeId,
  userId,
}: AITutorTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 語音錄製相關狀態
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [pendingAudioUrl, setPendingAudioUrl] = useState<string | null>(null);

  // Toast 通知狀態
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Toast 輔助函數
  const showToast = (message: string, type: 'info' | 'success' | 'error') => {
    const id = Math.random().toString(36).substr(2, 9);
    const toast: ToastMessage = { id, message, type };
    setToasts(prev => [...prev, toast]);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
      removeToast(id);
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // Load chat history when node changes
  useEffect(() => {
    if (!selectedNode || !currentTreeId || !userId) {
      setMessages([]);
      setInput('');
      setIsLoading(false);
      return;
    }

    const loadChatHistory = async () => {
      try {
        const { data, error } = await supabase
          .from('node_chats')
          .select('messages')
          .eq('tree_id', currentTreeId)
          .eq('node_id', selectedNode.id)
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to load chat history:', error);
          // Fallback to default opening message on error
          const opening: ChatMessage = {
            role: 'assistant',
            content: `你可以試著用簡單的話向我解釋一下什麽是「${selectedNode.label}」嗎？`,
          };
          setMessages([opening]);
        } else if (data?.messages && Array.isArray(data.messages)) {
          // Load saved messages
          setMessages(data.messages as ChatMessage[]);
        } else {
          // No history found (data is null), show default opening message
          const opening: ChatMessage = {
            role: 'assistant',
            content: `你可以試著用簡單的話向我解釋一下什麽是「${selectedNode.label}」嗎？`,
          };
          setMessages([opening]);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error loading chat history:', err);
        // Fallback to default opening message
        const opening: ChatMessage = {
          role: 'assistant',
          content: `你可以試著用簡單的話向我解釋一下什麽是「${selectedNode.label}」嗎？`,
        };
        setMessages([opening]);
      } finally {
        setInput('');
        setIsLoading(false);
      }
    };

    void loadChatHistory();
  }, [selectedNode?.id, currentTreeId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // 清理音頻URL以防止內存洩漏
  useEffect(() => {
    return () => {
      // 清理待處理的音頻URL
      if (pendingAudioUrl) {
        URL.revokeObjectURL(pendingAudioUrl);
      }
      // 清理消息中的音頻URL
      messages.forEach(msg => {
        if (msg.audioUrl) {
          URL.revokeObjectURL(msg.audioUrl);
        }
      });
    };
  }, [pendingAudioUrl, messages]);

  const handleSend = async () => {
    if (!selectedNode || !input.trim() || isLoading || !currentTreeId || !userId) {
      return;
    }

    const userText = input.trim();

    const nextMessages: ChatMessage[] = [
      ...messages,
      { 
        role: 'user', 
        content: userText,
        audioUrl: pendingAudioUrl || undefined // 如果有音頻URL，添加到消息中
      },
    ];

    setMessages(nextMessages);
    setInput('');
    setPendingAudioUrl(null); // 清除待處理的音頻URL
    setIsLoading(true);

    try {
      const response = await apiRequest('/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: userText,
          history: nextMessages.map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          })),
          node_context: selectedNode,
          user_id: userId,
          tree_id: currentTreeId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data: { reply?: string } = await response.json();
      const aiReply =
        data.reply ??
        '抱歉，我沒有收到有效的回覆，請稍後再試一次。';

      const finalMessages: ChatMessage[] = [
        ...nextMessages,
        { role: 'assistant', content: aiReply },
      ];

      setMessages(finalMessages);

      // Save messages to Supabase
      try {
        const { error: saveError } = await supabase
          .from('node_chats')
          .upsert(
            {
              user_id: userId,
              tree_id: currentTreeId,
              node_id: selectedNode.id,
              messages: finalMessages,
            },
            {
              onConflict: 'user_id,tree_id,node_id',
            },
          );

        if (saveError) {
          // eslint-disable-next-line no-console
          console.error('Failed to save chat history:', saveError);
        }
      } catch (saveErr) {
        // eslint-disable-next-line no-console
        console.error('Error saving chat history:', saveErr);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Chat request failed:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '抱歉，後端服務暫時無法回應，請稍後再試一次。',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    void handleSend();
  };

  // 開始錄音
  const startRecording = async () => {
    try {
      // HTTPS 檢查
      if (typeof window !== 'undefined' && window.location.protocol === 'http:' && 
          !window.location.hostname.includes('localhost') && 
          !window.location.hostname.includes('127.0.0.1')) {
        console.warn('警告：getUserMedia 在非 HTTPS 環境下可能無法正常工作，除非是 localhost');
      }

      // 檢查瀏覽器支持
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('您的瀏覽器不支援錄音功能', 'error');
        return;
      }

      // 檢查可用的音頻輸入設備
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
        
        if (audioInputDevices.length === 0) {
          showToast('未檢測到麥克風，請檢查硬體連接', 'error');
          return;
        }
      } catch (deviceError) {
        console.error('無法枚舉設備:', deviceError);
        showToast('無法檢測音頻設備', 'error');
        return;
      }

       // 請求麥克風權限並開始錄音
       const stream = await navigator.mediaDevices.getUserMedia({ 
         audio: {
           echoCancellation: true,
           noiseSuppression: true,
           autoGainControl: true
         }
       });

       // 選擇最佳的音頻格式
       let options: MediaRecorderOptions = {};
       if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
         options.mimeType = 'audio/webm;codecs=opus';
       } else if (MediaRecorder.isTypeSupported('audio/webm')) {
         options.mimeType = 'audio/webm';
       } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
         options.mimeType = 'audio/mp4';
       }

       console.log('Starting MediaRecorder with options:', options);

       const mediaRecorder = new MediaRecorder(stream, options);
       mediaRecorderRef.current = mediaRecorder;
       audioChunksRef.current = [];

       mediaRecorder.ondataavailable = (event) => {
         console.log('Audio data available:', event.data.size, 'bytes');
         if (event.data.size > 0) {
           audioChunksRef.current.push(event.data);
         }
       };

       mediaRecorder.onstop = () => {
         console.log('MediaRecorder stopped, total chunks:', audioChunksRef.current.length);
         // 停止所有音軌以釋放麥克風
         stream.getTracks().forEach(track => track.stop());
       };

       mediaRecorder.onerror = (event) => {
         console.error('MediaRecorder error:', event);
         showToast('錄音過程中發生錯誤', 'error');
       };

       // 開始錄音，每100ms收集一次數據
       mediaRecorder.start(100);
       setIsRecording(true);
       showToast('開始錄音', 'success');
       console.log('Recording started');

    } catch (error) {
      console.error('無法啟動錄音:', error);
      
      // 詳細錯誤處理
      if (error instanceof Error) {
        switch (error.name) {
          case 'NotFoundError':
            showToast('未檢測到麥克風，請檢查硬體連接', 'error');
            break;
          case 'NotAllowedError':
            showToast('請允許瀏覽器使用麥克風', 'error');
            break;
          case 'NotReadableError':
            showToast('麥克風被其他應用程式佔用', 'error');
            break;
          case 'OverconstrainedError':
            showToast('麥克風不支援所需的設定', 'error');
            break;
          case 'AbortError':
            showToast('錄音請求被中止', 'error');
            break;
          case 'NotSupportedError':
            showToast('您的瀏覽器不支援錄音功能', 'error');
            break;
          case 'SecurityError':
            showToast('安全限制：請確保在安全環境下使用', 'error');
            break;
          default:
            showToast(`錄音失敗：${error.message}`, 'error');
        }
      } else {
        showToast('未知錄音錯誤，請重試', 'error');
      }
    }
  };

  // 停止錄音並轉錄
  const stopRecording = async () => {
    if (!mediaRecorderRef.current || !isRecording) {
      console.warn('stopRecording called but no active recording');
      return;
    }

    return new Promise<void>((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;
      
      mediaRecorder.onstop = async () => {
        console.log('MediaRecorder stopped, processing audio...');
        setIsRecording(false);
        setIsTranscribing(true);

        try {
          // 檢查是否有錄音數據
          console.log('Audio chunks count:', audioChunksRef.current.length);
          if (audioChunksRef.current.length === 0) {
            throw new Error('沒有錄音數據');
          }

          // 嘗試不同的音頻格式
          let audioBlob: Blob;
          let mimeType = 'audio/webm';
          
          // 檢查瀏覽器支援的格式
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
            mimeType = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            mimeType = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp4' });
            mimeType = 'audio/mp4';
          } else {
            // 回退到通用格式
            audioBlob = new Blob(audioChunksRef.current);
            mimeType = 'audio/webm'; // 後端預期的格式
          }

          console.log('Audio blob created:', {
            size: audioBlob.size,
            type: audioBlob.type,
            mimeType: mimeType
          });

          if (audioBlob.size === 0) {
            throw new Error('錄音文件為空');
          }

          // 創建音頻 URL 用於播放
          const audioUrl = URL.createObjectURL(audioBlob);

          // 發送到後端進行轉錄
          const formData = new FormData();
          formData.append('file', audioBlob, `recording.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`);

          console.log('Sending transcription request to backend...');
          showToast('正在轉錄語音...', 'info');


          // 添加超時控制
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            controller.abort();
            console.error('Request timeout after 30 seconds');
          }, 30000);

          console.log('FormData contents:');
          for (let [key, value] of formData.entries()) {
            if (value instanceof File) {
              console.log(`${key}: File(${value.name}, ${value.size} bytes, ${value.type})`);
            } else {
              console.log(`${key}: ${value}`);
            }
          }

          console.log('Making transcribe-audio request...');
          const response = await apiRequest('/transcribe-audio', {
            method: 'POST',
            body: formData,
            signal: controller.signal,
            headers: {
              // 不要設置 Content-Type，讓瀏覽器自動設置 multipart/form-data
              // X-API-SECRET 會由 apiRequest 自動添加
            },
          });

          clearTimeout(timeoutId);
          console.log('Backend response received!');
          console.log('Response status:', response.status);
          console.log('Response headers:', Object.fromEntries(response.headers.entries()));

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Backend error response:', errorText);
            throw new Error(`轉錄失敗 (${response.status}): ${errorText}`);
          }

          const data = await response.json();
          console.log('Transcription result:', data);
          
          const transcribedText = data.text || '';

          if (transcribedText.trim()) {
            // 將轉錄的文字填入輸入框
            setInput(transcribedText);
            
            // 保存音頻URL，當用戶發送消息時會包含在內
            setPendingAudioUrl(audioUrl);
            showToast('語音轉錄完成', 'success');
          } else {
            showToast('未能識別語音內容，請重試', 'error');
            // 如果轉錄失敗，清理音頻URL
            URL.revokeObjectURL(audioUrl);
          }
        } catch (error) {
          console.error('語音轉錄失敗:', error);
          
          // 更詳細的錯誤信息
          if (error instanceof Error) {
            const errorMessage = error.message;
            
            if (errorMessage.includes('Failed to fetch')) {
              showToast('無法連接到後端服務，請確認後端正在運行', 'error');
            } else if (errorMessage.includes('NetworkError')) {
              showToast('網絡錯誤，請檢查網絡連接', 'error');
            } else if (errorMessage.includes('503') || errorMessage.includes('overloaded')) {
              showToast('AI 服務暫時過載，請稍後再試', 'error');
            } else if (errorMessage.includes('500')) {
              showToast('轉錄服務暫時不可用，請稍後再試', 'error');
            } else if (errorMessage.includes('400')) {
              showToast('音頻格式不支援，請重新錄音', 'error');
            } else if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
              showToast('轉錄請求超時，請重試', 'error');
            } else {
              // 嘗試從錯誤消息中提取更友好的信息
              if (errorMessage.includes('語音轉錄服務暫時過載')) {
                showToast('AI 語音服務繁忙，請稍後再試', 'error');
              } else if (errorMessage.includes('音頻格式錯誤')) {
                showToast('音頻格式不支援，請重新錄音', 'error');
              } else {
                showToast('語音轉錄失敗，請重試', 'error');
              }
            }
          } else {
            showToast('未知轉錄錯誤，請重試', 'error');
          }
        } finally {
          setIsTranscribing(false);
          resolve();
        }
      };

      console.log('Stopping MediaRecorder...');
      mediaRecorder.stop();
    });
  };


  // 切換錄音狀態
  const toggleRecording = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden relative">
      {/* Message list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {!selectedNode ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-500 text-center px-4">
              在學習樹中點選一個節點以查看細節，<br />
              並與 AI 導師進行費曼學習對話。
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-500 text-center px-4">
              選擇一個節點後，AI 導師會請你用自己的話解釋這個概念。
            </p>
          </div>
        ) : null}

        {messages.length > 0 && (
          <div className="flex flex-col gap-4">
            <AnimatePresence>
              {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`flex items-start gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className="flex-shrink-0 mt-1">
                        <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center">
                          <Bot className="h-4 w-4 text-slate-600" />
                        </div>
                      </div>
                    )}
                    <div className="relative">
                      <div
                        className={`relative max-w-[75%] px-4 py-3 text-sm shadow-sm ${
                          isUser
                            ? 'bg-indigo-600 text-white rounded-2xl'
                            : 'bg-slate-100 text-slate-900 rounded-2xl'
                        }`}
                      >
                        {/* 如果有音頻，先顯示音頻播放器 */}
                        {msg.audioUrl && (
                          <div className="mb-2">
                            <audio 
                              controls 
                              className="w-full max-w-xs"
                              style={{ 
                                filter: isUser ? 'invert(1) brightness(2)' : 'none',
                                height: '32px'
                              }}
                            >
                              <source src={msg.audioUrl} type="audio/webm" />
                              <source src={msg.audioUrl} type="audio/mp4" />
                              您的瀏覽器不支援音頻播放。
                            </audio>
                          </div>
                        )}
                        <div className="whitespace-pre-wrap break-words leading-relaxed">
                          {msg.content}
                        </div>
                      </div>
                      {/* 小尾巴 */}
                      <div
                        className={`absolute top-3 w-0 h-0 ${
                          isUser
                            ? 'right-0 translate-x-1/2 border-l-[6px] border-l-indigo-600 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent'
                            : 'left-0 -translate-x-1/2 border-r-[6px] border-r-slate-100 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent'
                        }`}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 justify-start"
              >
                <div className="flex-shrink-0 mt-1">
                  <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-slate-600" />
                  </div>
                </div>
                <div className="relative">
                  <div className="max-w-[75%] rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <motion.div
                          className="h-2 w-2 rounded-full bg-slate-400"
                          animate={{ y: [0, -8, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                        />
                        <motion.div
                          className="h-2 w-2 rounded-full bg-slate-400"
                          animate={{ y: [0, -8, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                        />
                        <motion.div
                          className="h-2 w-2 rounded-full bg-slate-400"
                          animate={{ y: [0, -8, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                        />
                      </div>
                    </div>
                  </div>
                  {/* 小尾巴 */}
                  <div className="absolute top-3 left-0 -translate-x-1/2 w-0 h-0 border-r-[6px] border-r-slate-100 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent" />
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input + voice + send */}
      {selectedNode && (
        <div className="flex-shrink-0 border-t border-slate-200/20 bg-white/80 backdrop-blur-md p-4">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={`用你的話解釋一下「${selectedNode.label}」吧...`}
              disabled={isLoading || isRecording || isTranscribing}
              className="flex-1 min-w-0 rounded-full border border-slate-300 bg-white/90 px-4 py-2.5 text-sm shadow-sm outline-none ring-offset-background placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            />
            

            {/* 語音輸入按鈕 */}
            <motion.button
              type="button"
              onClick={toggleRecording}
              disabled={isLoading || isTranscribing}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`flex-shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-full shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                isRecording 
                  ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse' 
                  : isTranscribing
                  ? 'bg-yellow-600 text-white'
                  : 'bg-slate-600 text-white hover:bg-slate-700'
              }`}
              title={
                isRecording 
                  ? '點擊停止錄音' 
                  : isTranscribing 
                  ? '轉錄中...' 
                  : '點擊開始語音輸入'
              }
            >
              {isTranscribing ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="h-4 w-4 border-2 border-white border-t-transparent rounded-full"
                />
              ) : isRecording ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </motion.button>

            {/* 發送按鈕 */}
            <motion.button
              type="submit"
              disabled={isLoading || !input.trim() || isRecording || isTranscribing}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex-shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-full bg-indigo-600 text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-indigo-600"
            >
              <Send className="h-4 w-4" />
            </motion.button>
          </form>
          
          {/* 錄音狀態提示 */}
          {(isRecording || isTranscribing) && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 text-center"
            >
              <span className={`text-xs ${isRecording ? 'text-red-600' : 'text-yellow-600'}`}>
                {isRecording ? '🎙️ 正在錄音...點擊停止' : '⏳ 正在轉錄語音...'}
              </span>
            </motion.div>
          )}
        </div>
      )}

      {/* Toast 通知 */}
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









