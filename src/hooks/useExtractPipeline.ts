import { useState, useCallback, useRef } from 'react';
import {
  streamExtractWordsPipeline,
  type ExtractPipelineEvent,
  type ExtractPipelineResult,
} from '../api';
import type { AppSettings, ExtractedWordDraft, VocabExtractMode } from '../types';

export interface PipelineProgress {
  statusMessage: string;
  structuredCount: number;
  completedCards: number;
  totalCards: number;
  failedCount: number;
  batchIndex: number;
  totalBatches: number;
  done: boolean;
  recentCards: ExtractedWordDraft[];
  failedWords: string[];
}

export interface UseExtractPipelineOptions {
  onWord?: (word: ExtractedWordDraft) => void;
  onDone?: (result: ExtractPipelineResult) => void;
}

const INITIAL_PROGRESS: PipelineProgress = {
  statusMessage: '',
  structuredCount: 0,
  completedCards: 0,
  totalCards: 0,
  failedCount: 0,
  batchIndex: 0,
  totalBatches: 0,
  done: false,
  recentCards: [],
  failedWords: [],
};

export function useExtractPipeline(options?: UseExtractPipelineOptions) {
  const [progress, setProgress] = useState<PipelineProgress>(INITIAL_PROGRESS);
  const abortRef = useRef<AbortController | null>(null);

  const handleEvent = useCallback((event: ExtractPipelineEvent) => {
    setProgress((prev) => {
      switch (event.type) {
        case 'status':
          return {
            ...prev,
            statusMessage: event.message || prev.statusMessage,
          };

        case 'structured':
          return {
            ...prev,
            structuredCount: event.count,
            totalCards: event.total ?? prev.totalCards,
            statusMessage: `已整理 ${event.count} 个词条`,
          };

        case 'batch':
          return {
            ...prev,
            batchIndex: event.batchIndex,
            totalBatches: event.totalBatches,
            completedCards: event.completed ?? prev.completedCards,
            totalCards: event.total ?? prev.totalCards,
            failedCount: event.failed ?? prev.failedCount,
            statusMessage: `正在补全第 ${event.batchIndex}/${event.totalBatches} 批`,
          };

        case 'word':
          return {
            ...prev,
            completedCards: event.completed,
            totalCards: event.total,
            failedCount: event.failed,
            statusMessage: `已完成 ${event.completed} / ${event.total || event.completed}，失败 ${event.failed}`,
            recentCards: [...prev.recentCards.slice(-7), event.word], // keep last 8
          };

        case 'failure':
          return {
            ...prev,
            failedCount: event.failed,
            statusMessage: `已完成 ${prev.completedCards} / ${prev.totalCards || prev.completedCards}，失败 ${event.failed}`,
            failedWords: [
              ...prev.failedWords,
              ...(event.items?.length
                ? event.items
                    .map((item) => item.word)
                    .filter((w): w is string => typeof w === 'string' && w.length > 0)
                : []),
            ],
          };

        case 'complete':
          return {
            ...prev,
            completedCards: event.completed,
            totalCards: event.total,
            failedCount: event.failed,
            statusMessage: event.failed > 0
              ? `部分词处理失败，可稍后重试`
              : `全部完成，共 ${event.completed} 个词条`,
            done: true,
          };

        default:
          return prev;
      }
    });
  }, []);

  const run = useCallback(
    async (params: {
      ocrText: string;
      levelTag: string;
      settings: AppSettings;
      mode: VocabExtractMode;
      batchSize?: number;
    }): Promise<ExtractPipelineResult | null> => {
      setProgress({
        ...INITIAL_PROGRESS,
        statusMessage: '正在连接…',
      });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await streamExtractWordsPipeline(
          {
            ocrText: params.ocrText,
            levelTag: params.levelTag,
            settings: params.settings,
            mode: params.mode,
            batchSize: params.batchSize ?? 5,
            signal: controller.signal,
          },
          (word) => {
            if (controller.signal.aborted) return;
            options?.onWord?.(word);
          },
          (event) => {
            if (controller.signal.aborted) return;
            handleEvent(event);
            if (event.type === 'complete') {
              options?.onDone?.({
                words: [],
                completed: event.completed,
                total: event.total,
                failed: event.failed,
                failures: event.failures ?? [],
              });
            }
          },
        );

        if (!controller.signal.aborted) {
          setProgress((prev) => ({ ...prev, done: true }));
        }

        return result;
      } catch (error) {
        if (controller.signal.aborted) {
          return null;
        }
        throw error;
      } finally {
        abortRef.current = null;
      }
    },
    [handleEvent, options],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { progress, run, abort };
}
