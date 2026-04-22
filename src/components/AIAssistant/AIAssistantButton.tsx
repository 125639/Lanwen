import type { AIAssistantSettings } from '../../types';
import { useAIAssistant } from './aiAssistantContextStore';

interface AIAssistantButtonProps {
  settings: AIAssistantSettings;
}

export function AIAssistantButton({ settings }: AIAssistantButtonProps) {
  const { drawerOpen, toggleDrawer } = useAIAssistant();

  if (!settings.enabled) {
    return null;
  }

  return (
    <button
      type="button"
      className={`tap ai-assistant-fab ${settings.displayMode === 'hidden' ? 'hidden-mode' : ''} ${drawerOpen ? 'open' : ''}`}
      aria-label={drawerOpen ? '关闭 AI 助手' : '打开 AI 助手'}
      title={drawerOpen ? '关闭 AI 助手' : 'AI 学习助手'}
      onClick={toggleDrawer}
    >
      <span className="ai-assistant-fab-icon">AI</span>
      {settings.displayMode === 'visible' ? <span className="ai-assistant-fab-label">AI 助手</span> : null}
    </button>
  );
}
