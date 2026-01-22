'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';

interface Flashcard {
  id: string;
  front: string;
  back: string;
  next_review_at: string | null;
  interval: number;
  user_id: string;
}

interface FlashcardReviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
}

export default function FlashcardReview({
  open,
  onOpenChange,
  user,
}: FlashcardReviewProps) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [exitingCardId, setExitingCardId] = useState<string | null>(null);

  // 获取需要复习的卡片
  const fetchCards = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('flashcards')
        .select('*')
        .eq('user_id', user.id)
        .or(`next_review_at.is.null,next_review_at.lte.${now}`)
        .order('next_review_at', { ascending: true, nullsFirst: true });

      if (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch flashcards', error);
        return;
      }

      setCards((data as Flashcard[]) ?? []);
      setCurrentIndex(0);
      setIsFlipped(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error fetching flashcards', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open && user) {
      void fetchCards();
    }
  }, [open, user]);

  const handleFlip = () => {
    if (!isFlipped) {
      setIsFlipped(true);
    }
  };

  const handleCardAction = async (action: 'again' | 'good') => {
    if (currentIndex >= cards.length || isUpdating) return;

    const currentCard = cards[currentIndex];
    setExitingCardId(currentCard.id);
    setIsUpdating(true);

    try {
      if (action === 'again') {
        // interval 重置为 0，next_review_at 设为 1 分钟后
        const nextReview = new Date();
        nextReview.setMinutes(nextReview.getMinutes() + 1);

        const { error } = await supabase
          .from('flashcards')
          .update({
            interval: 0,
            next_review_at: nextReview.toISOString(),
          })
          .eq('id', currentCard.id);

        if (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to update flashcard', error);
        }
      } else {
        // interval 变为原来的 2 倍 + 1
        const newInterval = currentCard.interval * 2 + 1;
        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + newInterval);

        const { error } = await supabase
          .from('flashcards')
          .update({
            interval: newInterval,
            next_review_at: nextReview.toISOString(),
          })
          .eq('id', currentCard.id);

        if (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to update flashcard', error);
        }
      }

      // 等待退出动画完成
      await new Promise((resolve) => setTimeout(resolve, 400));

      // 移动到下一张卡片
      if (currentIndex < cards.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setIsFlipped(false);
        setExitingCardId(null);
      } else {
        // 没有更多卡片了，重新获取
        await fetchCards();
        setExitingCardId(null);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error updating flashcard', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAgain = () => {
    void handleCardAction('again');
  };

  const handleGood = () => {
    void handleCardAction('good');
  };

  const currentCard = cards[currentIndex];
  const hasMoreCards = currentIndex < cards.length;
  const progress = cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0;

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      {/* 关闭按钮 */}
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="absolute top-6 right-6 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        aria-label="关闭"
      >
        <X className="w-6 h-6" />
      </button>

      {/* 进度条 */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
        <motion.div
          className="h-full bg-gradient-to-r from-blue-500 to-green-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* 主要内容区域 */}
      <div className="flex-1 flex items-center justify-center p-6">
        {isLoading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-white"
          >
            <div className="text-4xl mb-4 animate-pulse">📚</div>
            <p className="text-xl">正在載入卡片...</p>
          </motion.div>
        ) : !hasMoreCards ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center text-white"
          >
            <div className="text-8xl mb-6">🎉</div>
            <h2 className="text-4xl font-bold mb-4">今日任務完成！</h2>
            <p className="text-xl text-white/80 mb-8">
              你已經複習完所有需要複習的卡片。
            </p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-8 py-3 bg-white/20 hover:bg-white/30 text-white rounded-lg font-medium transition-colors"
            >
              關閉
            </button>
          </motion.div>
        ) : currentCard ? (
          <div className="w-full max-w-md">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentCard.id}
                initial={{ opacity: 0, x: 300, scale: 0.8 }}
                animate={{
                  opacity: exitingCardId === currentCard.id ? 0 : 1,
                  x: exitingCardId === currentCard.id ? -300 : 0,
                  scale: exitingCardId === currentCard.id ? 0.8 : 1,
                }}
                exit={{ opacity: 0, x: -300, scale: 0.8 }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
                className="w-full"
              >
                {/* 卡片容器 - 3D 翻转效果 */}
                <div
                  className="relative w-full mx-auto"
                  style={{
                    width: '400px',
                    height: '600px',
                    perspective: '1200px',
                  }}
                >
                  <motion.div
                    className="relative w-full h-full"
                    style={{ transformStyle: 'preserve-3d' }}
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                    transition={{ duration: 0.6, ease: 'easeInOut' }}
                    onClick={handleFlip}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleFlip();
                      }
                    }}
                  >
                    {/* 正面 */}
                    <div
                      className="absolute inset-0 w-full h-full rounded-2xl shadow-2xl cursor-pointer"
                      style={{
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        transform: 'rotateY(0deg)',
                      }}
                    >
                      <div className="w-full h-full bg-white rounded-2xl flex items-center justify-center p-12 border-4 border-gray-100">
                        <div className="text-center">
                          <p className="text-sm font-medium mb-4 text-gray-500 uppercase tracking-wide">
                            問題
                          </p>
                          <p className="text-4xl font-bold leading-relaxed text-gray-900">
                            {currentCard.front}
                          </p>
                          <p className="text-sm mt-8 text-gray-400">
                            點擊卡片查看答案
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 背面 */}
                    <div
                      className="absolute inset-0 w-full h-full rounded-2xl shadow-2xl cursor-pointer"
                      style={{
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                      }}
                    >
                      <div className="w-full h-full bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl flex items-center justify-center p-12 border-4 border-amber-200">
                        <div className="text-center">
                          <p className="text-sm font-medium mb-4 text-amber-700 uppercase tracking-wide">
                            答案
                          </p>
                          <p className="text-4xl font-bold leading-relaxed text-amber-900">
                            {currentCard.back}
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* 评分按钮 - 只在翻转到背面后显示 */}
                {isFlipped && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mt-12 flex justify-center gap-6"
                  >
                    <button
                      type="button"
                      onClick={handleAgain}
                      disabled={isUpdating}
                      className="flex items-center gap-3 px-8 py-4 bg-transparent border-3 border-red-500 hover:border-red-600 text-red-500 hover:text-red-600 rounded-xl font-bold text-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed min-w-[160px] justify-center"
                      style={{ borderWidth: '3px' }}
                    >
                      <span className="text-2xl">❌</span>
                      <span>忘記了</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleGood}
                      disabled={isUpdating}
                      className="flex items-center gap-3 px-8 py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-lg shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[160px] justify-center"
                    >
                      <span className="text-2xl">✅</span>
                      <span>記住了</span>
                    </button>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* 进度文本 */}
            <div className="mt-8 text-center text-white/60 text-sm">
              {currentIndex + 1} / {cards.length}
            </div>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

