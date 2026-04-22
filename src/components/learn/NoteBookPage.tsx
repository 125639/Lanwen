// src/components/learn/NoteBookPage.tsx
import { useEffect, useState, useMemo } from 'react';
import type { WordCard } from '../../types';
import { getWordsWithNotes } from '../../db';

interface Props {
  onClose: () => void;
  onJumpToWord: (wordId: number) => void;
}

export function NoteBookPage({ onClose, onJumpToWord }: Props) {
  const [notes, setNotes] = useState<WordCard[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    setLoading(true);
    const words = await getWordsWithNotes();
    setNotes(words);
    setLoading(false);
  };

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;
    const query = searchQuery.toLowerCase();
    return notes.filter(
      (w) =>
        w.word.toLowerCase().includes(query) ||
        (w.note && w.note.toLowerCase().includes(query)),
    );
  }, [notes, searchQuery]);

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div className="notebook-page">
      {/* 头部 */}
      <div className="notebook-header">
        <h2>我的笔记本</h2>
        <button className="notebook-close" onClick={onClose}>✕</button>
      </div>

      {/* 搜索框 */}
      <div className="notebook-search">
        <input
          type="text"
          placeholder="搜索单词或笔记内容..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="notebook-search-input"
        />
      </div>

      {/* 笔记列表 */}
      <div className="notebook-content">
        {loading ? (
          <div className="notebook-loading">
            <div className="skeleton" style={{ height: 80, borderRadius: 16, marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 80, borderRadius: 16, marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 80, borderRadius: 16 }} />
          </div>
        ) : filteredNotes.length > 0 ? (
          filteredNotes.map((word) => (
            <div
              key={word.id}
              className="notebook-item"
              onClick={() => word.id && onJumpToWord(word.id)}
            >
              <div className="notebook-item-header">
                <div className="notebook-item-word">
                  <span className="notebook-word">{word.word}</span>
                  <span className="pos-chip-small">{word.pos}</span>
                </div>
                <span className="notebook-date">{formatDate(word.updatedAt)}</span>
              </div>
              <p className="notebook-item-content">{word.note}</p>
            </div>
          ))
        ) : (
          <div className="notebook-empty">
            <div className="empty-icon">📓</div>
            <h3>还没有笔记</h3>
            <p>在背词时点击「笔记」可以随时记录</p>
          </div>
        )}
      </div>
    </div>
  );
}
