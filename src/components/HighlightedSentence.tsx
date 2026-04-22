interface HighlightedSentenceProps {
  sentence: string;
  word: string;
  className?: string;
}

export function HighlightedSentence({ sentence, word, className }: HighlightedSentenceProps) {
  if (!sentence || !word) {
    return <span className={className}>{sentence}</span>;
  }

  // 支持词形变化（匹配词根）
  // 移除常见的后缀来提取词根
  const wordRoot = word
    .replace(/(ing|ed|s|es|er|est|ly|tion|ness|ment|able|ible|al|ial|ic|ical|ous|ious|ful|less|ize|ise)$/, '')
    .replace(/^(un|in|im|il|ir|dis|mis|pre|re|over|under|out|up|down|de|anti|co|sub|inter|trans|mid|semi|non|multi|poly|mono|bi|tri)$/, '');

  // 构建正则表达式，匹配原词或词根开头的词
  const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedRoot = wordRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 优先匹配完整单词，然后匹配词根
  const regex = new RegExp(`\\b(${escapedWord}|${escapedRoot}\\w*)\\b`, 'gi');

  const parts = sentence.split(regex);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        // 检查是否是匹配的词（不区分大小写）
        const isMatch = regex.test(part);
        // 重置 lastIndex
        regex.lastIndex = 0;

        if (isMatch) {
          return (
            <mark key={i} className="word-highlight">
              {part}
            </mark>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
