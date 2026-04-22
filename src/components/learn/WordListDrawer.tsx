// src/components/learn/WordListDrawer.tsx
import { useEffect, useState } from 'react';
import type { WordCard, WordStatus } from '../../types';
import { getWordStatusesForBook } from '../../db';

type FilterTab = 'all' | 'known' | 'unknown' | 'wrong' | 'new' | 'deleted';

interface Props {
  bookId: string;
  words: WordCard[];
  onClose: () => void;
  onJumpToWord: (wordId: number) => void;
}

const TAB_LABELS: Record<FilterTab, string> = {
  all: '全部',
  known: '已认识',
  unknown: '不认识',
  wrong: '记错了',
  new: '未学习',
  deleted: '已删除',
};

const STATE_COLORS: Record<string, string> = {
  known: '#10B981',
  unknown: '#EF4444',
  wrong: '#F59E0B',
  new: '#94A3B8',
  deleted: '#E2E8F0',
};

export function WordListDrawer({ bookId, words, onClose, onJumpToWord }: Props) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [statusMap, setStatusMap] = useState<Map<number, WordStatus>>(new Map());

  useEffect(() => {
    getWordStatusesForBook(bookId).then(setStatusMap);
  }, [bookId]);

  const filteredWords = words.filter((word) => {
    if (!word.id) return false;

    const status = statusMap.get(word.id);
    const state = status?.state || 'new';

    if (activeTab === 'all') return !word.deleted;
    if (activeTab === 'deleted') return !!word.deleted;
    if (activeTab === 'new') return state === 'new' && !word.deleted;
    return state === activeTab && !word.deleted;
  });

  const getWordState = (word: WordCard): WordStatus['state'] => {
    if (!word.id) return 'new';
    if (word.deleted) return 'deleted';
    return statusMap.get(word.id)?.state || 'new';
  };

  return (
    <div className="wordlist-overlay" onClick={onClose}>
      <div className="wordlist-drawer" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="wordlist-header">
          <div>
            <h3>单词列表</h3>
            <span className="wordlist-subtitle">今日背词进度</span>
          </div>
          <button className="wordlist-close" onClick={onClose}>✕</button>
        </div>

        {/* 筛选 Tab */}
        <div className="wordlist-tabs">
          {(Object.keys(TAB_LABELS) as FilterTab[]).map((tab) => (
            <button
              key={tab}
              className={`wordlist-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* 单词列表 */}
        <div className="wordlist-content">
          {filteredWords.map((word) => {
            const state = getWordState(word);
            const isSpelling = word.memoryType === 'spelling';

            return (
              <div
                key={word.id}
                className={`wordlist-item ${word.deleted ? 'deleted' : ''}`}
                onClick={() => word.id && onJumpToWord(word.id)}
              >
                <div className="wordlist-left">
                  <span
                    className="wordlist-state-dot"
                    style={{ background: STATE_COLORS[state] || '#94A3B8' }}
                  />
                  <div className="wordlist-info">
                    <span className="wordlist-word">{word.word}</span>
                    <span className="pos-chip-small">{word.pos}</span>
                  </div>
                </div>
                <div className="wordlist-right">
                  {word.memoryType && (
                    <span className={`memory-type-badge ${isSpelling ? 'spelling' : 'recognition'}`}>
                      {isSpelling ? '拼' : '识'}
                    </span>
                  )}
                  <span className="wordlist-meaning">{word.meaning_brief}</span>
                </div>
              </div>
            );
          })}

          {filteredWords.length === 0 && (
            <div className="wordlist-empty">
              <p>暂无此类单词</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
