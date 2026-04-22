import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { chatWithAI } from '../../api';
import { addChatMessage, clearChatMessages, getChatMessages } from '../../db';
import type { AppSettings, ChatMessage } from '../../types';
import { useAIAssistant } from './aiAssistantContextStore';

interface ChatDrawerProps {
  settings: AppSettings;
}

export function ChatDrawer({ settings }: ChatDrawerProps) {
  const { drawerOpen, setDrawerOpen, currentWordContext } = useAIAssistant();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getChatMessages(200)
      .then((rows) => {
        if (!cancelled) {
          setMessages(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('读取聊天记录失败');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    const node = listRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [drawerOpen, messages]);

  const contextHint = useMemo(() => {
    if (!currentWordContext) {
      return '当前未绑定具体单词，你可以直接提问语法、例句或记忆方法。';
    }

    const meaning = currentWordContext.meaningBrief ? ` · ${currentWordContext.meaningBrief}` : '';
    return `当前上下文：${currentWordContext.word}${meaning}`;
  }, [currentWordContext]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) {
      return;
    }

    setError(null);
    setInput('');
    setLoading(true);

    const userMessage: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: Date.now(),
      word: currentWordContext?.word,
      wordId: currentWordContext?.wordId,
      bookId: currentWordContext?.bookId,
      source: currentWordContext?.source,
    };

    setMessages((prev) => [...prev, userMessage]);
    await addChatMessage(userMessage).catch(() => undefined);

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: Date.now() + 1,
      word: currentWordContext?.word,
      wordId: currentWordContext?.wordId,
      bookId: currentWordContext?.bookId,
      source: currentWordContext?.source,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    let streamedContent = '';

    try {
      await chatWithAI(
        {
          settings,
          messages: [...messages, userMessage],
          contextWord: currentWordContext,
        },
        (chunk) => {
          if (!chunk) {
            return;
          }
          streamedContent += chunk;
          setMessages((prev) => {
            return prev.map((item) =>
              item.role === 'assistant' && item.timestamp === assistantMessage.timestamp
                ? { ...item, content: streamedContent }
                : item,
            );
          });
        },
      );

      if (!streamedContent.trim()) {
        streamedContent = '我暂时没有生成内容，请稍后重试。';
        setMessages((prev) =>
          prev.map((item) =>
            item.role === 'assistant' && item.timestamp === assistantMessage.timestamp
              ? { ...item, content: streamedContent }
              : item,
          ),
        );
      }

      await addChatMessage({
        ...assistantMessage,
        content: streamedContent,
      }).catch(() => undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : '发送失败';
      setError(message);
      const failText = `请求失败：${message}`;
      setMessages((prev) =>
        prev.map((item) =>
          item.role === 'assistant' && item.timestamp === assistantMessage.timestamp
            ? { ...item, content: failText }
            : item,
        ),
      );
      await addChatMessage({
        ...assistantMessage,
        content: failText,
      }).catch(() => undefined);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm('确认清空所有聊天记录？')) {
      return;
    }
    try {
      await clearChatMessages();
      setMessages([]);
      setError(null);
    } catch {
      setError('清空聊天记录失败');
    }
  };

  return (
    <>
      <div className={`ai-chat-overlay ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)} />
      <aside className={`ai-chat-drawer ${drawerOpen ? 'open' : ''}`} aria-hidden={!drawerOpen}>
        <header className="ai-chat-header">
          <div>
            <strong>AI 学习助手</strong>
            <p>{contextHint}</p>
          </div>
          <button type="button" className="tap top-nav-icon-btn" onClick={() => setDrawerOpen(false)}>
            ×
          </button>
        </header>

        <div className="ai-chat-messages" ref={listRef}>
          {messages.length === 0 ? (
            <div className="ai-chat-empty">
              <p>试试这样提问：</p>
              <p>1) 这个词的常见搭配是什么？</p>
              <p>2) 帮我写 3 个不同难度例句</p>
              <p>3) 怎么区分相近词？</p>
            </div>
          ) : null}
          {messages.map((message, index) => (
            <div key={`${message.timestamp}-${index}`} className={`ai-chat-bubble ${message.role}`}>
              {message.role === 'assistant' ? (
                <ReactMarkdown>{message.content || '...'}</ReactMarkdown>
              ) : (
                <p>{message.content}</p>
              )}
            </div>
          ))}
        </div>

        {error ? <div className="ai-chat-error">{error}</div> : null}

        <footer className="ai-chat-input-area">
          <button type="button" className="tap ghost-btn" onClick={() => void handleClear()} disabled={loading}>
            清空
          </button>
          <textarea
            className="ai-chat-input"
            value={input}
            placeholder="输入你的问题..."
            rows={2}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
          />
          <button type="button" className="tap primary-btn" onClick={() => void sendMessage()} disabled={loading || !input.trim()}>
            {loading ? '发送中...' : '发送'}
          </button>
        </footer>
      </aside>
    </>
  );
}
