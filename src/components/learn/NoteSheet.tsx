// src/components/learn/NoteSheet.tsx
import { useState } from 'react';

interface Props {
  word: string;
  initialNote: string;
  onSave: (note: string) => void;
  onClose: () => void;
}

const MAX_LENGTH = 500;

export function NoteSheet({ word, initialNote, onSave, onClose }: Props) {
  const [note, setNote] = useState(initialNote);

  const handleSave = () => {
    onSave(note.trim());
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h3>为 "{word}" 添加笔记</h3>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>

        <div className="sheet-body">
          <textarea
            className="note-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_LENGTH))}
            placeholder="记录这个单词的记忆技巧、易错点、关联词..."
            autoFocus
          />
          <div className="note-char-count">
            {note.length} / {MAX_LENGTH}
          </div>
        </div>

        <div className="sheet-footer">
          <button className="sheet-btn ghost" onClick={onClose}>
            取消
          </button>
          <button className="sheet-btn primary" onClick={handleSave}>
            保存笔记
          </button>
        </div>
      </div>
    </div>
  );
}
