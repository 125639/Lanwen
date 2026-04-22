// src/components/learn/WordDetail.tsx
import { useState } from 'react';
import type { ReviewWrongReason, WordCard, WordStatus } from '../../types';
import { updateWordFavorite, updateWordNote } from '../../db';
import { NoteSheet } from './NoteSheet';

function playWordAudio(word: string, accent?: 'uk' | 'us'): void {
  void import('../../tts').then(({ playWordAudio: play }) => play(word, accent));
}

interface Props {
  word: WordCard & { state: WordStatus['state'] };
  showMarkWrong: boolean;
  onMarkWrong: (reason: ReviewWrongReason) => void;
  onNext: () => void;
  onToggleFavorite: (favorited: boolean) => void;
}

const WRONG_REASON_OPTIONS: Array<{ reason: ReviewWrongReason; label: string; desc: string }> = [
  { reason: 'meaning', label: '词义不会', desc: '看见单词想不起中文意思' },
  { reason: 'confusion', label: '近义混淆', desc: '和相似单词或意思记混了' },
  { reason: 'spelling', label: '拼写不会', desc: '意思知道，但英文拼不出来' },
  { reason: 'usage', label: '用法不会', desc: '例句、搭配或场景不会用' },
];

export function WordDetail({ word, showMarkWrong, onMarkWrong, onNext, onToggleFavorite }: Props) {
  const [showNoteSheet, setShowNoteSheet] = useState(false);
  const [localNote, setLocalNote] = useState(word.note || '');
  const [isFavorited, setIsFavorited] = useState(word.favorited || false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showWrongReasonPicker, setShowWrongReasonPicker] = useState(false);

  const handleSaveNote = async (note: string) => {
    if (word.id) {
      await updateWordNote(word.id, note);
      setLocalNote(note);
    }
    setShowNoteSheet(false);
  };

  const handleToggleFavorite = async () => {
    const newState = !isFavorited;
    setIsFavorited(newState);
    if (word.id) {
      await updateWordFavorite(word.id, newState);
    }
    onToggleFavorite(newState);
  };

  const isSpelling = word.memoryType === 'spelling';

  return (
    <div className="word-detail">
      {/* 完整单词卡片 */}
      <div className="word-detail-card">
        {/* 单词标题行 */}
        <div className="word-detail-header">
          <h2 className="word-detail-word">{word.word}</h2>
          {word.memoryType && (
            <span className={`memory-type-tag ${isSpelling ? 'spelling' : 'recognition'}`}>
              {isSpelling ? '✎ 拼写' : '👁 识记'}
            </span>
          )}
        </div>

        {/* 音标 */}
        <div className="word-detail-phonetic">
          <span className="phonetic-group">
            <span className="phonetic-label">英</span>
            <span className="phonetic-text">{word.phonetic_uk}</span>
            <button
              className="audio-btn-mini"
              onClick={() => playWordAudio(word.word, 'uk')}
            >
              🔊
            </button>
          </span>
          <span className="phonetic-group">
            <span className="phonetic-label">美</span>
            <span className="phonetic-text">{word.phonetic_us}</span>
            <button
              className="audio-btn-mini"
              onClick={() => playWordAudio(word.word, 'us')}
            >
              🔊
            </button>
          </span>
        </div>

        {/* 词性释义 */}
        <div className="word-detail-meaning">
          <span className="pos-chip">{word.pos}</span>
          <span className="meaning-text">{word.meaning_brief}</span>
        </div>

        {/* 柯林斯释义 */}
        {word.meaning_collins && (
          <div className="word-detail-collins">
            <div className="collins-header">Collins</div>
            <p className="collins-text">{word.meaning_collins}</p>
          </div>
        )}

        {/* 例句 */}
        {(word.origin_sentence || word.ai_example_en) && (
          <div className="word-detail-examples">
            <div className="section-title">例句</div>
            {word.origin_sentence && (
              <div className="example-item">
                <p className="example-en">{word.origin_sentence}</p>
                <p className="example-zh">{word.origin_translation}</p>
                {word.origin_sentence && (
                  <span className="example-tag origin">原文</span>
                )}
              </div>
            )}
            {word.ai_example_en && (
              <div className="example-item">
                <p className="example-en">{word.ai_example_en}</p>
                <p className="example-zh">{word.ai_example_zh}</p>
                <span className="example-tag ai">AI</span>
              </div>
            )}
          </div>
        )}

        {/* 真题例句 */}
        {word.examSentence && (
          <div className="word-detail-exam">
            <div className="exam-header">真题例句 · Exam</div>
            <div className="exam-content">
              <p className="exam-en">{word.examSentence}</p>
              <p className="exam-zh">{word.examSentenceZh}</p>
              <span className="exam-tag">真题</span>
            </div>
          </div>
        )}

        {/* 常考短语 */}
        {word.commonPhrases && word.commonPhrases.length > 0 && (
          <div className="word-detail-phrases">
            <div className="section-title">常考短语</div>
            <div className="phrases-list">
              {word.commonPhrases.map((phrase, i) => (
                <div key={i} className="phrase-item" title={phrase.meaning}>
                  <span className="phrase-text">{phrase.phrase}</span>
                  <span className="phrase-sep">·</span>
                  <span className="phrase-meaning">{phrase.meaning}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 派生词 */}
        {word.derivatives && word.derivatives.length > 0 && (
          <div className="word-detail-derivatives">
            <div className="section-title">派生词</div>
            <div className="derivatives-list">
              {word.derivatives.map((der, i) => (
                <div key={i} className="derivative-item">
                  <span className="derivative-word">{der.word}</span>
                  <span className="derivative-pos">{der.pos}</span>
                  <span className="derivative-meaning">{der.meaning}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 记忆妙招 */}
        {word.mnemonic && (
          <div className="word-detail-mnemonic">
            <div className="mnemonic-header">🧩 记忆妙招</div>
            <p className="mnemonic-text">{word.mnemonic}</p>
          </div>
        )}

        {/* 笔记区 */}
        <div className="word-detail-note" onClick={() => setShowNoteSheet(true)}>
          <div className="note-header">
            <span>我的笔记 ✏</span>
            {localNote && <span className="note-exists">已添加</span>}
          </div>
          {localNote ? (
            <p className="note-content">{localNote}</p>
          ) : (
            <p className="note-placeholder">点击添加笔记...</p>
          )}
        </div>

        {/* 展开更多 */}
        {!isExpanded && word.meaning_advanced && word.meaning_advanced.length > 0 && (
          <button className="expand-btn" onClick={() => setIsExpanded(true)}>
            查看更多释义 ▼
          </button>
        )}

        {isExpanded && word.meaning_advanced && (
          <div className="word-detail-advanced">
            {word.meaning_advanced.map((item, i) => (
              <div key={i} className="advanced-item">
                <p className="advanced-def">{item.def}</p>
                <p className="advanced-example">{item.example}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="word-detail-footer">
        <div className="footer-left">
          {showMarkWrong && (
            <div className="mark-wrong-wrap">
              <button
                className="mark-wrong-btn"
                onClick={() => setShowWrongReasonPicker((prev) => !prev)}
              >
                ↩ 记错了
              </button>

              {showWrongReasonPicker ? (
                <div className="wrong-reason-picker">
                  <strong>这次卡在哪里？</strong>
                  <div className="wrong-reason-list">
                    {WRONG_REASON_OPTIONS.map((option) => (
                      <button
                        key={option.reason}
                        type="button"
                        className="wrong-reason-btn"
                        onClick={() => {
                          setShowWrongReasonPicker(false);
                          onMarkWrong(option.reason);
                        }}
                      >
                        <span>{option.label}</span>
                        <small>{option.desc}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
        <div className="footer-right">
          <button
            className={`favorite-btn ${isFavorited ? 'active' : ''}`}
            onClick={handleToggleFavorite}
          >
            {isFavorited ? '⭐' : '☆'}
          </button>
          <button className="next-btn" onClick={onNext}>
            继续下一个 →
          </button>
        </div>
      </div>

      {/* 笔记编辑 Sheet */}
      {showNoteSheet && (
        <NoteSheet
          word={word.word}
          initialNote={localNote}
          onSave={handleSaveNote}
          onClose={() => setShowNoteSheet(false)}
        />
      )}
    </div>
  );
}
