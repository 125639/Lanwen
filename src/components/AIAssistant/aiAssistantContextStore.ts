import { createContext, useContext } from 'react';
import type {
  AIAssistantContextSource,
  AIAssistantWordContext,
  WordCard,
} from '../../types';

export interface AIAssistantContextValue {
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  currentWordContext: AIAssistantWordContext | null;
  setCurrentWordContext: (context: AIAssistantWordContext | null) => void;
  setCurrentWordFromCard: (
    word: WordCard | null,
    source: AIAssistantContextSource,
    bookId?: string | null,
  ) => void;
}

export const AIAssistantContext = createContext<AIAssistantContextValue | null>(null);

export function useAIAssistant(): AIAssistantContextValue {
  const context = useContext(AIAssistantContext);
  if (!context) {
    throw new Error('useAIAssistant must be used within AIAssistantProvider');
  }
  return context;
}
