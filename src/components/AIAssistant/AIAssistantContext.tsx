import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  AIAssistantContextSource,
  AIAssistantWordContext,
  WordCard,
} from '../../types';
import { AIAssistantContext, type AIAssistantContextValue } from './aiAssistantContextStore';

function toWordContext(
  word: WordCard,
  source: AIAssistantContextSource,
  bookId?: string | null,
): AIAssistantWordContext {
  return {
    word: word.word,
    meaningBrief: word.meaning_brief,
    pos: word.pos,
    phoneticUk: word.phonetic_uk,
    phoneticUs: word.phonetic_us,
    wordId: word.id,
    bookId: bookId ?? word.bookId,
    source,
  };
}

export function AIAssistantProvider({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentWordContext, setCurrentWordContext] = useState<AIAssistantWordContext | null>(null);

  const toggleDrawer = useCallback(() => {
    setDrawerOpen((prev) => !prev);
  }, []);

  const setCurrentWordFromCard = useCallback(
    (word: WordCard | null, source: AIAssistantContextSource, bookId?: string | null) => {
      if (!word) {
        setCurrentWordContext(null);
        return;
      }

      setCurrentWordContext(toWordContext(word, source, bookId));
    },
    [],
  );

  const value = useMemo<AIAssistantContextValue>(
    () => ({
      drawerOpen,
      setDrawerOpen,
      toggleDrawer,
      currentWordContext,
      setCurrentWordContext,
      setCurrentWordFromCard,
    }),
    [currentWordContext, drawerOpen, setCurrentWordFromCard, toggleDrawer],
  );

  return <AIAssistantContext.Provider value={value}>{children}</AIAssistantContext.Provider>;
}
