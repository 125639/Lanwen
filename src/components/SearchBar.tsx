import type { WordCard } from '../types';

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  results: WordCard[];
  onSelectResult: (word: WordCard) => void;
}

export function SearchBar({ query, onQueryChange, results, onSelectResult }: SearchBarProps) {
  const hasQuery = query.trim().length > 0;

  return (
    <div className="search-bar">
      <div className="search-input-wrap">
        <span className="search-icon">🔍</span>
        <input
          className="search-input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && results[0]) {
              onSelectResult(results[0]);
            }
          }}
          placeholder="搜索单词..."
          aria-label="搜索单词"
          aria-expanded={hasQuery}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
        />
        {hasQuery ? (
          <button
            type="button"
            className="tap search-clear"
            onClick={() => onQueryChange('')}
            aria-label="清空搜索"
            title="清空搜索"
          >
            ×
          </button>
        ) : null}
      </div>

      {hasQuery ? (
        <div className="search-results">
          {results.length > 0 ? (
            results.map((item) => (
              <button key={item.id} type="button" className="tap search-result-item" onClick={() => onSelectResult(item)} title={item.word}>
                <span className="search-result-word">{item.word}</span>
                <small className="search-result-meaning">{item.meaning_brief}</small>
              </button>
            ))
          ) : (
            <div className="search-results-empty">没有找到匹配的单词</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
