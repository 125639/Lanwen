import { forwardRef, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { WordCard as WordCardType } from '../types';
import { formatReviewEta } from '../sm2';
import { getLevelTagClass, splitPosMeaning } from '../utils';
import { HighlightedSentence } from './HighlightedSentence';

interface WordCardProps {
  word: WordCardType;
  onToggleFavorite?: (word: WordCardType) => void;
  onSpeak?: (
    text: string,
    accent: 'uk' | 'us',
    onStateChange?: (state: 'loading' | 'playing' | 'error' | 'done') => void,
  ) => void;
  hideFavorite?: boolean;
  onJumpToRelated?: (word: string) => void;
  onRequestAddRelated?: (word: string) => void;
  className?: string;
  style?: CSSProperties;
  onTouchStart?: React.TouchEventHandler<HTMLDivElement>;
  onTouchMove?: React.TouchEventHandler<HTMLDivElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLDivElement>;
}

const FORM_LABELS: Array<{ key: keyof WordCardType['word_forms']; label: string }> = [
  { key: 'plural', label: '复数' },
  { key: 'third_singular', label: '第三人称单数' },
  { key: 'present_participle', label: '现在分词' },
  { key: 'past_tense', label: '过去式' },
  { key: 'past_participle', label: '过去分词' },
];

type AudioState = 'idle' | 'loading' | 'playing' | 'error';

function AudioButton({
  onClick,
  state,
}: {
  onClick: () => void;
  state: AudioState;
}) {
  const icon = state === 'loading'
    ? <span className="tts-spinner" />
    : state === 'playing'
      ? '⏸'
      : state === 'error'
        ? '⚠️'
        : '🔊';

  return (
    <button
      type="button"
      className={`tap audio-btn audio-state-${state}`}
      onClick={onClick}
      aria-label={state === 'playing' ? '暂停' : '发音'}
      disabled={state === 'loading'}
    >
      {icon}
    </button>
  );
}

export const WordCard = forwardRef<HTMLElement, WordCardProps>(function WordCard(
  {
    word,
    onToggleFavorite,
    onSpeak,
    hideFavorite,
    onJumpToRelated,
    onRequestAddRelated,
    className,
    style,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  },
  ref,
) {
  const [collinsExpanded, setCollinsExpanded] = useState(false);
  const [relatedExpanded, setRelatedExpanded] = useState(false);
  const [masteryHintOpen, setMasteryHintOpen] = useState(false);
  const [audioState, setAudioState] = useState<AudioState>('idle');

  // 自动重置错误状态
  useEffect(() => {
    if (audioState === 'error') {
      const timer = setTimeout(() => setAudioState('idle'), 1000);
      return () => clearTimeout(timer);
    }
  }, [audioState]);

  const meaningRows = useMemo(
    () => splitPosMeaning(word.pos, word.meaning_brief),
    [word.meaning_brief, word.pos],
  );

  const formRows = FORM_LABELS.filter((item) => Boolean(word.word_forms[item.key])).map((item) => ({
    label: item.label,
    value: word.word_forms[item.key] as string,
  }));

  const originSentence = word.origin_sentence?.trim() ?? '';
  const aiExampleEn = word.ai_example_en?.trim() ?? '';
  const hasOriginExample = Boolean(originSentence);
  const hasAiExample = Boolean(aiExampleEn);
  const hasAnyExample = hasOriginExample || hasAiExample;

  const masteryLevel = word.masteryLevel ?? 0;
  const nextReviewText = word.nextReviewAt ? formatReviewEta(word.nextReviewAt) : '待安排';

  const masteryLabel =
    masteryLevel === 3 ? '已掌握' : masteryLevel === 2 ? '熟悉' : masteryLevel === 1 ? '学习中' : '未学习';

  const masteryDots = Array.from({ length: 4 }).map((_, index) => {
    const filled =
      masteryLevel === 3
        ? true
        : masteryLevel === 2
          ? index < 2
          : masteryLevel === 1
            ? index < 1
            : false;
    return <span className={`mastery-dot-mini ${filled ? `lv-${masteryLevel}` : ''}`} key={index} />;
  });

  const synonyms = word.synonyms ?? [];
  const antonyms = word.antonyms ?? [];
  const hasRelated = synonyms.length > 0 || antonyms.length > 0;

  const handleRelatedClick = (target: string) => {
    if (onJumpToRelated) {
      onJumpToRelated(target);
      return;
    }
    onRequestAddRelated?.(target);
  };

  return (
    <article
      ref={ref}
      className={`word-card ${className ?? ''}`.trim()}
      style={style}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="word-row">
        <h2 className="text-word word-title">{word.word}</h2>
        <div className="word-row-actions">
          <button
            type="button"
            className="tap mastery-indicator"
            onClick={() => setMasteryHintOpen((prev) => !prev)}
            title="熟悉度"
          >
            {masteryDots}
          </button>
          {!hideFavorite && (
            <button
              type="button"
              className="tap favorite-btn"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite?.(word);
              }}
              aria-label={word.favorited ? '取消收藏' : '收藏单词'}
              title={word.favorited ? '取消收藏' : '收藏单词'}
            >
              {word.favorited ? '⭐' : '☆'}
            </button>
          )}
          {masteryHintOpen ? (
            <div className="mastery-popover">
              <p>{masteryLabel}</p>
              <small>下次复习：{nextReviewText}</small>
            </div>
          ) : null}
        </div>
      </div>

      <div className="phonetic-row">
        <span className="phonetic-group">
          <span className="phonetic-label">英</span>
          <span className="text-phonetic phonetic-text">{word.phonetic_uk || '/'}</span>
          <AudioButton
            state={audioState}
            onClick={() => {
              if (audioState === 'playing') {
                // 暂停功能 - 调用 TTS 模块停止
                void import('../tts').then(({ stopSpeaking }) => stopSpeaking());
                setAudioState('idle');
              } else {
                onSpeak?.(word.word, 'uk', (state) => {
                  if (state === 'loading') setAudioState('loading');
                  else if (state === 'playing') setAudioState('playing');
                  else if (state === 'done') setAudioState('idle');
                  else if (state === 'error') setAudioState('error');
                });
              }
            }}
          />
        </span>
        <span className="phonetic-group">
          <span className="phonetic-label">美</span>
          <span className="text-phonetic phonetic-text">{word.phonetic_us || '/'}</span>
          <AudioButton
            state={audioState}
            onClick={() => {
              if (audioState === 'playing') {
                void import('../tts').then(({ stopSpeaking }) => stopSpeaking());
                setAudioState('idle');
              } else {
                onSpeak?.(word.word, 'us', (state) => {
                  if (state === 'loading') setAudioState('loading');
                  else if (state === 'playing') setAudioState('playing');
                  else if (state === 'done') setAudioState('idle');
                  else if (state === 'error') setAudioState('error');
                });
              }
            }}
          />
        </span>
      </div>

      <div className="meaning-block">
        {meaningRows.map((item, index) => (
          <p className="meaning-row" key={`${item.pos}-${index}`}>
            <span className="pos-chip text-pos">{item.pos}</span>
            <span className="meaning-text">{item.meaning}</span>
          </p>
        ))}
      </div>

      <hr className="divider" />

      <section className="collins-section">
        <button
          type="button"
          className="tap collins-toggle"
          onClick={() => setCollinsExpanded((prev) => !prev)}
        >
          <span className="collins-title">COLLINS DEFINITION</span>
          <span className={`collins-arrow ${collinsExpanded ? 'expanded' : ''}`}>⌄</span>
        </button>
        <div className={`collins-body ${collinsExpanded ? 'expanded' : ''}`}>
          <p>{word.meaning_collins || '暂无柯林斯释义。'}</p>
        </div>
      </section>

      <section className="examples-section">
        <p className="section-subtitle">例句 · Examples</p>
        {hasOriginExample ? (
          <div className="example-item">
            <p className="text-example-en">
              <HighlightedSentence sentence={originSentence} word={word.word} />
            </p>
            <p className="text-example-zh">{word.origin_translation || '暂无原文翻译。'}</p>
            <span className="source-badge source-origin">原文</span>
          </div>
        ) : null}
        {hasAiExample ? (
          <div className="example-item">
            <p className="text-example-en">{aiExampleEn}</p>
            <p className="text-example-zh">{word.ai_example_zh || '暂无 AI 例句翻译。'}</p>
            <span className="source-badge source-ai">AI</span>
          </div>
        ) : null}
        {!hasAnyExample ? <p className="text-example-empty">暂无可展示的英文例句。</p> : null}
      </section>

      <section className="mnemonic-section">
        <div className="mnemonic-header">
          <span>🧩</span>
          <span>词根助记</span>
        </div>
        <p className="text-mnemonic">{word.mnemonic || '暂无词根助记。'}</p>
      </section>

      <section className="related-section">
        <button type="button" className="tap related-toggle" onClick={() => setRelatedExpanded((prev) => !prev)}>
          <span>关联词</span>
          <span className={`collins-arrow ${relatedExpanded ? 'expanded' : ''}`}>⌄</span>
        </button>
        {relatedExpanded ? (
          <div className="related-body">
            {synonyms.length ? (
              <div className="related-row">
                <strong>同义词</strong>
                <div className="related-tags">
                  {synonyms.map((item) => (
                    <button key={item} type="button" className="tap related-tag synonym" onClick={() => handleRelatedClick(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {antonyms.length ? (
              <div className="related-row">
                <strong>反义词</strong>
                <div className="related-tags">
                  {antonyms.map((item) => (
                    <button key={item} type="button" className="tap related-tag antonym" onClick={() => handleRelatedClick(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {!hasRelated ? <p className="text-example-empty">暂无关联词。</p> : null}
          </div>
        ) : null}
      </section>

      <div className="level-tags">
        {word.level_tag.length ? (
          word.level_tag.map((tag) => (
            <span className={getLevelTagClass(tag)} key={tag}>
              {tag}
            </span>
          ))
        ) : (
          <span className="level-tag">通用</span>
        )}
      </div>

      {formRows.length > 0 && (
        <section className="word-forms">
          {formRows.map((item) => (
            <p key={item.label}>
              <span className="form-label">{item.label}:</span>
              <span className="form-value">{item.value}</span>
            </p>
          ))}
        </section>
      )}
    </article>
  );
});
