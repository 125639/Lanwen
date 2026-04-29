import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  extractOCRText,
  extractWordsFallback,
  lookupWord,
  streamExtractWords,
  streamExtractWordsPipeline,
  type ExtractPipelineEvent,
} from '../api';
import {
  deleteBook,
  deleteWord,
  moveWordToBook,
  renameBook,
  saveBookWithWords,
  updateWord,
} from '../db';
import type { AppSettings, Book, ExtractedWordDraft, PreparedFile, VocabExtractMode, WordCard } from '../types';
import {
  clamp,
  compressImage,
  fileToDataUrl,
  formatBytes,
  normalizeExtractedWord,
} from '../utils';
import { DeleteConfirmSheet } from './DeleteConfirmSheet';
import { WordCard as WordCardPreview } from './WordCard';

interface LibraryPageProps {
  books: Book[];
  activeBookId: string | null;
  words: WordCard[];
  settings: AppSettings;
  onSelectBook: (bookId: string) => void;
  onJumpToWord: (wordId: number) => void;
  onRefresh: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
  onQuickAddWord: (
    word: Omit<WordCard, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>,
    targetBookId?: string,
  ) => Promise<void>;
  openUploaderSignal: number;
}

type UploadStep = 1 | 2 | 3 | 4 | 5;
type DuplicateMode = 'skip' | 'overwrite';
type ExtractProgress = {
  status: string;
  structuredCount: number;
  completed: number;
  total: number;
  failed: number;
  batchIndex: number;
  totalBatches: number;
};

interface CandidateWord {
  id: string;
  selected: boolean;
  data: Omit<WordCard, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>;
}

type SpeedDialAction = 'upload' | 'manual';

const EXTRACT_MODE_OPTIONS: Array<{
  value: VocabExtractMode;
  label: string;
  description: string;
}> = [
  {
    value: 'large_structure_small_enrich',
    label: '大模型整理 + 小模型加工',
    description: '默认：先还原教材结构，再逐词补全词卡，避免小模型上下文过载。',
  },
  {
    value: 'large_only',
    label: '大模型全包揽',
    description: '直接从 OCR 文本生成完整词卡。',
  },
  {
    value: 'small_only',
    label: '小模型全流程',
    description: '低成本模式，小模型先整理再逐词补全；对 OCR 噪声过滤和教材原貌还原可能较弱。',
  },
];

const INITIAL_EXTRACT_PROGRESS: ExtractProgress = {
  status: '正在整理 OCR 文本',
  structuredCount: 0,
  completed: 0,
  total: 0,
  failed: 0,
  batchIndex: 0,
  totalBatches: 0,
};

function toPreparedFile(name: string, type: string, size: number, base64: string): PreparedFile {
  return { name, type, size, base64 };
}

async function checkClipboard(): Promise<string | null> {
  try {
    const text = await navigator.clipboard.readText();
    if (text.length > 50 && /[a-zA-Z]/.test(text) && !text.startsWith('http')) {
      return text;
    }
  } catch {
    return null;
  }
  return null;
}

export function LibraryPage({
  books,
  activeBookId,
  words,
  settings,
  onSelectBook,
  onJumpToWord,
  onRefresh,
  onNotify,
  onQuickAddWord,
  openUploaderSignal,
}: LibraryPageProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<UploadStep>(1);
  const [bookName, setBookName] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [ocrText, setOcrText] = useState('');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('等待开始');
  const [extractingCount, setExtractingCount] = useState(0);
  const [uploadExtractMode, setUploadExtractMode] = useState<VocabExtractMode>(settings.vocabExtractMode);
  const [extractProgress, setExtractProgress] = useState<ExtractProgress>(INITIAL_EXTRACT_PROGRESS);
  const [extractFailures, setExtractFailures] = useState<Array<{ word?: string; message: string }>>([]);
  const [candidateWords, setCandidateWords] = useState<CandidateWord[]>([]);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('skip');
  const [processing, setProcessing] = useState(false);
  const [longPressWordId, setLongPressWordId] = useState<number | null>(null);
  const [editingWord, setEditingWord] = useState<WordCard | null>(null);
  const [movingWordId, setMovingWordId] = useState<number | null>(null);
  const [showBookManager, setShowBookManager] = useState(false);
  const [renamingBookId, setRenamingBookId] = useState<string | null>(null);
  const [newBookName, setNewBookName] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'favorites'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [speedDialOpen, setSpeedDialOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualStep, setManualStep] = useState<1 | 2 | 3>(1);
  const [manualWord, setManualWord] = useState('');
  const [manualTargetBookId, setManualTargetBookId] = useState<string | null>(activeBookId);
  const [manualPreview, setManualPreview] = useState<Omit<WordCard, 'id' | 'bookId' | 'createdAt' | 'updatedAt'> | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedWordIds, setSelectedWordIds] = useState<number[]>([]);
  const [showBatchMoveSheet, setShowBatchMoveSheet] = useState(false);
  const [batchMoveTargetId, setBatchMoveTargetId] = useState<string | null>(null);
  const [batchMoving, setBatchMoving] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [clipboardText, setClipboardText] = useState<string | null>(null);
  const [clipboardDismissed, setClipboardDismissed] = useState(false);
  const [manualWordExists, setManualWordExists] = useState(false);
  const extractAbortRef = useRef<AbortController | null>(null);

  const listParentRef = useRef<HTMLDivElement | null>(null);

  const displayWords = useMemo(() => {
    let filtered = words;
    if (activeFilter === 'favorites') {
      filtered = words.filter((w) => w.favorited);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        (w) =>
          w.word.toLowerCase().includes(query) ||
          w.meaning_brief.toLowerCase().includes(query) ||
          w.phonetic_uk?.toLowerCase().includes(query) ||
          w.phonetic_us?.toLowerCase().includes(query) ||
          w.pos?.toLowerCase().includes(query),
      );
    }
    return filtered;
  }, [words, activeFilter, searchQuery]);

  const batchMoveOptions = useMemo(
    () => books.filter((book) => book.id !== activeBookId),
    [activeBookId, books],
  );

  const rowVirtualizer = useVirtualizer({
    count: displayWords.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 72,
    overscan: 8,
  });

  useEffect(() => {
    setManualTargetBookId(activeBookId);
  }, [activeBookId]);

  useEffect(() => {
    if (openUploaderSignal > 0) {
      setModalOpen(true);
      setStep(1);
      setUploadExtractMode(settings.vocabExtractMode);
    }
  }, [openUploaderSignal, settings.vocabExtractMode]);

  useEffect(() => {
    if (!modalOpen) {
      setUploadExtractMode(settings.vocabExtractMode);
    }
  }, [modalOpen, settings.vocabExtractMode]);

  useEffect(() => {
    if (!manualWord.trim()) {
      setManualWordExists(false);
      return;
    }
    const lower = manualWord.trim().toLowerCase();
    const exists = words.some((w) => w.word.toLowerCase() === lower);
    setManualWordExists(exists);
  }, [manualWord, words]);

  useEffect(() => {
    if (clipboardDismissed) {
      return;
    }
    void checkClipboard().then((text) => {
      setClipboardText(text);
    });
  }, [clipboardDismissed, activeFilter]);

  useEffect(() => {
    if (!showBatchMoveSheet) {
      return;
    }
    if (!batchMoveOptions.length) {
      setShowBatchMoveSheet(false);
      setBatchMoveTargetId(null);
      return;
    }
    if (!batchMoveTargetId || !batchMoveOptions.some((book) => book.id === batchMoveTargetId)) {
      setBatchMoveTargetId(batchMoveOptions[0].id);
    }
  }, [batchMoveOptions, batchMoveTargetId, showBatchMoveSheet]);

  const resetUpload = () => {
    setStep(1);
    setBookName('');
    setSelectedFiles([]);
    setOcrText('');
    setOcrProgress(0);
    setOcrStatus('等待开始');
    setExtractingCount(0);
    setUploadExtractMode(settings.vocabExtractMode);
    setExtractProgress(INITIAL_EXTRACT_PROGRESS);
    setExtractFailures([]);
    setCandidateWords([]);
    setDuplicateMode('skip');
    setProcessing(false);
  };

  const openUploader = () => {
    setModalOpen(true);
    setStep(1);
    setUploadExtractMode(settings.vocabExtractMode);
  };

  const closeUploader = () => {
    setModalOpen(false);
    resetUpload();
  };

  const openSpeedAction = (action: SpeedDialAction) => {
    setSpeedDialOpen(false);
    if (action === 'upload') {
      openUploader();
    } else {
      setManualOpen(true);
      setManualStep(1);
      setManualWord('');
      setManualPreview(null);
    }
  };

  const handleFilesPicked = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }
    const files = Array.from(fileList);
    const supported = ['image/jpeg', 'image/png', 'image/webp'];
    const invalid = files.find((file) => !supported.includes(file.type));
    if (invalid) {
      const message =
        invalid.type === 'application/pdf'
          ? '当前 OCR 上传暂不支持 PDF，请先将 PDF 页面导出为图片'
          : `不支持的文件格式：${invalid.name}`;
      onNotify('error', message);
      return;
    }
    setSelectedFiles(files);
  };

  const startOCR = async () => {
    if (!bookName.trim()) {
      onNotify('warning', '请先填写教程名称');
      return;
    }
    if (!selectedFiles.length) {
      onNotify('warning', '请先选择文件');
      return;
    }
    if (!settings.ocr.apiKey) {
      onNotify('error', 'OCR API Key 未配置，请先在设置中填写');
      return;
    }

    setStep(2);
    setProcessing(true);

    try {
      const prepared: PreparedFile[] = [];
      setOcrStatus('正在压缩图片...');

      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        const compressed = await compressImage(file);
        const base64 = await fileToDataUrl(compressed);
        prepared.push(toPreparedFile(compressed.name, compressed.type, compressed.size, base64));
        setOcrProgress(clamp(((index + 1) / selectedFiles.length) * 40, 5, 40));
      }

      setOcrStatus(`正在识别文字... (第1/${prepared.length}张)`);

      const result = await extractOCRText(prepared, settings);
      setOcrText(result.text || '');
      setOcrProgress(100);
      setOcrStatus('识别完成！');

      window.setTimeout(() => {
        setStep(3);
      }, 500);
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'OCR 识别失败');
      setStep(1);
    } finally {
      setProcessing(false);
    }
  };

  const handleExtractWords = async () => {
    const selectedMode = uploadExtractMode;
    const needsLargeModel = selectedMode !== 'small_only';
    const needsSmallModel = selectedMode !== 'large_only';

    if (needsLargeModel && !settings.llm.apiKey.trim()) {
      onNotify('error', 'LLM API Key 未配置，请先在设置中填写');
      return;
    }
    if (needsSmallModel && !settings.smallLlm.apiKey.trim()) {
      onNotify('error', '小模型 API Key 未配置，请先在设置中填写');
      return;
    }
    if (!ocrText.trim()) {
      onNotify('warning', 'OCR 文本为空，无法提取');
      return;
    }

    const aborted = () => extractAbortRef.current?.signal.aborted ?? false;
    extractAbortRef.current = new AbortController();

    setStep(4);
    setProcessing(true);
    setCandidateWords([]);
    setExtractingCount(0);
    setExtractFailures([]);
    setExtractProgress({
      ...INITIAL_EXTRACT_PROGRESS,
      status: selectedMode === 'large_only' ? '正在生成完整词卡' : '正在整理 OCR 文本',
    });

    const drafts: ExtractedWordDraft[] = [];

    const appendDraft = (chunk: ExtractedWordDraft) => {
      if (aborted()) return;
      drafts.push(chunk);
      const normalized = normalizeExtractedWord(chunk as Partial<WordCard> & { word?: string });
      if (!normalized) {
        return;
      }
      setExtractingCount((prev) => prev + 1);
      setCandidateWords((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${prev.length}`,
          selected: true,
          data: normalized,
        },
      ]);
    };

    const applyPipelineEvent = (event: ExtractPipelineEvent) => {
      if (aborted()) return;
      if (event.type === 'status') {
        setExtractProgress((prev) => ({
          ...prev,
          status: event.message || prev.status,
        }));
        return;
      }

      if (event.type === 'structured') {
        setExtractProgress((prev) => ({
          ...prev,
          structuredCount: event.count,
          total: event.total ?? prev.total,
          status: `已整理 ${event.count} 个词条`,
        }));
        return;
      }

      if (event.type === 'batch') {
        setExtractProgress((prev) => ({
          ...prev,
          batchIndex: event.batchIndex,
          totalBatches: event.totalBatches,
          completed: event.completed ?? prev.completed,
          total: event.total ?? prev.total,
          failed: event.failed ?? prev.failed,
          status: `正在补全第 ${event.batchIndex}/${event.totalBatches} 批`,
        }));
        return;
      }

      if (event.type === 'word') {
        setExtractProgress((prev) => ({
          ...prev,
          completed: event.completed,
          total: event.total,
          failed: event.failed,
          status: `已完成 ${event.completed} / ${event.total || event.completed}，失败 ${event.failed}`,
        }));
        return;
      }

      if (event.type === 'failure') {
        setExtractProgress((prev) => ({
          ...prev,
          failed: event.failed,
          status: `已完成 ${prev.completed} / ${prev.total || prev.completed}，失败 ${event.failed}`,
        }));
        setExtractFailures((prev) => [
          ...prev,
          ...(event.items?.length
            ? event.items.map((item) => ({ word: item.word, message: event.message }))
            : [{ message: event.message }]),
        ]);
        return;
      }

      if (event.type === 'complete') {
        setExtractProgress((prev) => ({
          ...prev,
          completed: event.completed,
          total: event.total,
          failed: event.failed,
          status: `已完成 ${event.completed} / ${event.total || event.completed}，失败 ${event.failed}`,
        }));
        setExtractFailures(event.failures ?? []);
      }
    };

    const runLegacyLargeExtract = async (streamErrorMsg: string) => {
      drafts.length = 0;
      setCandidateWords([]);
      setExtractingCount(0);
      setExtractProgress({
        ...INITIAL_EXTRACT_PROGRESS,
        status: '正在使用兼容提取路径',
      });

      try {
        await streamExtractWords(
          {
            ocrText,
            levelTag: settings.defaultLevel,
            settings,
          },
          appendDraft,
        );

        if (!drafts.length) {
          throw new Error('未提取到任何单词，请检查 OCR 文本或 API 配置');
        }

        setStep(5);
      } catch (legacyStreamError) {
        const legacyStreamMsg = legacyStreamError instanceof Error ? legacyStreamError.message : '流式提取失败';
        const noRetry =
          legacyStreamError instanceof Error && (legacyStreamError as Error & { noRetry?: boolean }).noRetry;

        if (noRetry) {
          onNotify('error', legacyStreamMsg);
          setStep(3);
          return;
        }

        try {
          const fallback = await extractWordsFallback({
            ocrText,
            levelTag: settings.defaultLevel,
            settings,
          });

          if (!Array.isArray(fallback) || fallback.length === 0) {
            throw new Error('LLM 返回空结果');
          }

          const mapped = fallback
            .map((item, index) => {
              const normalized = normalizeExtractedWord(item as Partial<WordCard> & { word?: string });
              if (!normalized) return null;
              return {
                id: `${Date.now()}-${index}`,
                selected: true,
                data: normalized,
              };
            })
            .filter(Boolean) as CandidateWord[];

          if (!mapped.length) {
            throw new Error('未能解析有效单词');
          }

          setCandidateWords(mapped);
          setExtractingCount(mapped.length);
          setExtractProgress((prev) => ({
            ...prev,
            completed: mapped.length,
            total: mapped.length,
            status: `已完成 ${mapped.length} / ${mapped.length}，失败 0`,
          }));
          setStep(5);
        } catch (fallbackError) {
          const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : '未知错误';
          onNotify('error', `提取失败: ${fallbackMsg} (Pipeline: ${streamErrorMsg}; 兼容流式: ${legacyStreamMsg})`);
          setStep(3);
        }
      }
    };

    try {
      const result = await streamExtractWordsPipeline(
        {
          ocrText,
          levelTag: settings.defaultLevel,
          settings,
          mode: selectedMode,
          batchSize: 5,
        },
        appendDraft,
        applyPipelineEvent,
      );

      if (!drafts.length) {
        throw new Error('未提取到任何单词，请检查 OCR 文本或 API 配置');
      }

      if (result.failed > 0) {
        onNotify('warning', '部分词处理失败，可稍后重试');
      }

      if (!aborted()) {
        setStep(5);
      }
    } catch (streamError) {
      if (aborted()) {
        return;
      }

      const streamErrorMsg = streamError instanceof Error ? streamError.message : '流式提取失败';

      if (selectedMode === 'large_only') {
        await runLegacyLargeExtract(streamErrorMsg);
        return;
      }

      onNotify('error', `提取失败: ${streamErrorMsg}`);
      setStep(3);
    } finally {
      setProcessing(false);
      extractAbortRef.current = null;
    }
  };

  const dedupePreview = useMemo(() => {
    const existing = new Set(words.map((item) => item.word.toLowerCase()));
    let duplicates = 0;
    for (const item of candidateWords) {
      if (existing.has(item.data.word.toLowerCase())) {
        duplicates += 1;
      }
    }
    return duplicates;
  }, [candidateWords, words]);

  const selectedCount = candidateWords.filter((item) => item.selected).length;
  const selectedExtractModeOption =
    EXTRACT_MODE_OPTIONS.find((option) => option.value === uploadExtractMode) ?? EXTRACT_MODE_OPTIONS[0];

  const handleSaveSelected = async () => {
    if (!selectedCount) {
      onNotify('warning', '请至少选择一个单词');
      return;
    }

    try {
      setProcessing(true);
      const payload = candidateWords.filter((item) => item.selected).map((item) => item.data);
      const result = await saveBookWithWords(bookName.trim(), payload, duplicateMode);
      await onRefresh();
      onSelectBook(result.bookId);
      closeUploader();
      if (duplicateMode === 'overwrite' && result.overwrittenCount > 0) {
        onNotify(
          'success',
          `保存成功：新增 ${result.savedCount - result.overwrittenCount}，覆盖 ${result.overwrittenCount}`,
        );
      } else {
        onNotify('success', `保存成功：${result.savedCount} 个单词`);
      }
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : '保存失败');
    } finally {
      setProcessing(false);
    }
  };

  const toggleSelectAll = () => {
    const allSelected = candidateWords.every((item) => item.selected);
    setCandidateWords((prev) => prev.map((item) => ({ ...item, selected: !allSelected })));
  };

  const handleManualLookup = async () => {
    if (!manualWord.trim()) {
      onNotify('warning', '请输入单词');
      return;
    }
    if (!settings.llm.apiKey.trim()) {
      onNotify('error', '请先配置 LLM API Key');
      return;
    }

    setManualStep(2);
    try {
      const draft = await lookupWord(manualWord.trim(), settings);
      const normalized = normalizeExtractedWord(draft as Partial<WordCard> & { word?: string });
      if (!normalized) {
        throw new Error('AI 返回的单词格式无效');
      }
      if (!normalized.origin_sentence) {
        normalized.origin_sentence = normalized.ai_example_en;
      }
      if (!normalized.origin_translation) {
        normalized.origin_translation = normalized.ai_example_zh;
      }
      setManualPreview(normalized);
      setManualStep(3);
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : '查询失败');
      setManualStep(1);
    }
  };

  const handleSaveManual = async () => {
    if (!manualPreview) {
      return;
    }
    try {
      await onQuickAddWord(manualPreview, manualTargetBookId ?? undefined);
      setManualOpen(false);
      setManualStep(1);
      setManualPreview(null);
      setManualWord('');
    } catch {
      onNotify('error', '保存失败');
    }
  };

  const startBatchMode = (wordId: number) => {
    setBatchMode(true);
    setSelectedWordIds([wordId]);
    setShowBatchMoveSheet(false);
    setBatchMoveTargetId(null);
    setLongPressWordId(null);
  };

  const toggleBatchWord = (wordId: number) => {
    setSelectedWordIds((prev) =>
      prev.includes(wordId) ? prev.filter((id) => id !== wordId) : [...prev, wordId],
    );
  };

  const handleBatchDelete = async () => {
    if (!selectedWordIds.length) {
      return;
    }
    setBatchDeleting(true);
    try {
      await Promise.all(selectedWordIds.map((id) => deleteWord(id)));
      await onRefresh();
      onNotify('success', `已删除 ${selectedWordIds.length} 个单词`);
      setBatchMode(false);
      setSelectedWordIds([]);
      setShowBatchMoveSheet(false);
      setBatchMoveTargetId(null);
      setShowDeleteSheet(false);
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : '批量删除失败');
    } finally {
      setBatchDeleting(false);
    }
  };

  const openBatchMoveSheet = () => {
    if (!selectedWordIds.length) {
      return;
    }
    if (!batchMoveOptions.length) {
      onNotify('warning', '没有可移动的目标分组');
      return;
    }

    if (!batchMoveTargetId || !batchMoveOptions.some((book) => book.id === batchMoveTargetId)) {
      setBatchMoveTargetId(batchMoveOptions[0].id);
    }
    setShowBatchMoveSheet(true);
  };

  const handleBatchMove = async () => {
    if (!selectedWordIds.length) {
      return;
    }
    if (!batchMoveTargetId) {
      onNotify('warning', '请选择目标分组');
      return;
    }

    const target = books.find((book) => book.id === batchMoveTargetId);
    if (!target) {
      onNotify('warning', '目标分组不存在');
      return;
    }

    setBatchMoving(true);
    try {
      await Promise.all(selectedWordIds.map((id) => moveWordToBook(id, target.id)));
      await onRefresh();
      onSelectBook(target.id);
      onNotify('success', `已移动 ${selectedWordIds.length} 个单词到 ${target.name}`);
      setBatchMode(false);
      setSelectedWordIds([]);
      setShowBatchMoveSheet(false);
      setBatchMoveTargetId(null);
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : '批量移动失败');
    } finally {
      setBatchMoving(false);
    }
  };

  const activeBook = books.find((book) => book.id === activeBookId) ?? null;
  const allSelectedInBatch =
    displayWords.length > 0 &&
    displayWords.every((item) => (item.id ? selectedWordIds.includes(item.id) : false));

  return (
    <section className="library-page">
      {batchMode ? (
        <div className="batch-top-bar">
          <button
            type="button"
            className="tap ghost-btn"
            onClick={() => {
              setBatchMode(false);
              setSelectedWordIds([]);
              setShowDeleteSheet(false);
              setShowBatchMoveSheet(false);
              setBatchMoveTargetId(null);
            }}
          >
            取消
          </button>
          <strong>已选 {selectedWordIds.length} 个</strong>
          <button
            type="button"
            className="tap ghost-btn"
            onClick={() => {
              if (allSelectedInBatch) {
                setSelectedWordIds([]);
              } else {
                setSelectedWordIds(
                  displayWords.map((item) => item.id).filter((id): id is number => typeof id === 'number'),
                );
              }
            }}
          >
            {allSelectedInBatch ? '取消全选' : '全选'}
          </button>
        </div>
      ) : (
        <div className="library-header-row">
          <div className="library-book-select-wrap">
            <SelectBookDropdown books={books} activeBookId={activeBookId} onSelectBook={onSelectBook} />
          </div>
          <div className="library-header-actions">
            <span className="library-count">
              {activeFilter === 'favorites'
                ? `${displayWords.length} 个收藏`
                : `${activeBook?.wordCount ?? words.length} 个单词`}
            </span>
            <button
              type="button"
              className="tap library-manage-btn"
              onClick={() => setShowBookManager(true)}
              title="管理分组"
            >
              ⚙
            </button>
          </div>
        </div>
      )}

      {clipboardText && !clipboardDismissed ? (
        <div className="clipboard-banner">
          <div className="clipboard-icon">📋</div>
          <div className="clipboard-text">
            <strong>检测到剪贴板中的英文文本</strong>
            <small>{clipboardText.slice(0, 40)}...</small>
          </div>
          <div className="clipboard-actions">
            <button
              type="button"
              className="tap primary-mini-btn"
              onClick={() => {
                setModalOpen(true);
                setStep(3);
                setBookName(activeBook?.name ?? '从剪贴板提取');
                setOcrText(clipboardText);
                setUploadExtractMode(settings.vocabExtractMode);
                setClipboardDismissed(true);
              }}
            >
              提取单词
            </button>
            <button type="button" className="tap close-mini-btn" onClick={() => setClipboardDismissed(true)}>
              ✕
            </button>
          </div>
        </div>
      ) : null}

      <div className="library-filter-tabs">
        <button
          type="button"
          className={`tap filter-tab ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          全部
        </button>
        <button
          type="button"
          className={`tap filter-tab ${activeFilter === 'favorites' ? 'active' : ''}`}
          onClick={() => setActiveFilter('favorites')}
        >
          ⭐ 收藏
        </button>
      </div>

      <div className="library-search-wrap">
        <div className="library-search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="library-search-input"
            placeholder="搜索单词、释义、音标..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button type="button" className="search-clear-btn" onClick={() => setSearchQuery('')}>
              ✕
            </button>
          )}
        </div>
        {searchQuery && displayWords.length !== words.length && (
          <span className="search-result-count">找到 {displayWords.length} 个结果</span>
        )}
      </div>

      <div className="library-list" ref={listParentRef}>
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = displayWords[virtualRow.index];
            if (!item) {
              return null;
            }
            const masteryTag =
              item.masteryLevel === 3
                ? { text: '✓ 已掌握', className: 'mastery-tag mastered' }
                : item.masteryLevel === 2
                  ? { text: '↻ 学习中', className: 'mastery-tag learning' }
                  : item.masteryLevel === 1
                    ? { text: '↻ 学习中', className: 'mastery-tag learning' }
                    : { text: '· 未学', className: 'mastery-tag fresh' };

            const selected = item.id ? selectedWordIds.includes(item.id) : false;

            return (
              <button
                type="button"
                key={item.id ?? virtualRow.key}
                className={`tap library-row ${batchMode ? 'batch' : ''}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => {
                  if (batchMode && item.id) {
                    toggleBatchWord(item.id);
                    return;
                  }
                  if (item.id) {
                    onJumpToWord(item.id);
                  }
                }}
                onPointerDown={() => {
                  const wordId = item.id;
                  if (typeof wordId !== 'number' || batchMode) {
                    return;
                  }
                  const timer = window.setTimeout(() => {
                    startBatchMode(wordId);
                  }, 500);
                  const clear = () => {
                    window.clearTimeout(timer);
                    window.removeEventListener('pointerup', clear);
                    window.removeEventListener('pointercancel', clear);
                  };
                  window.addEventListener('pointerup', clear);
                  window.addEventListener('pointercancel', clear);
                }}
              >
                {batchMode ? (
                  <span className="batch-checkbox-wrap">
                    <input type="checkbox" checked={selected} readOnly />
                  </span>
                ) : null}
                <div className="library-left">
                  <strong>{item.word}</strong>
                  <span className="mini-pos">{item.pos}</span>
                </div>
                <div className="library-right">{item.meaning_brief}</div>
                <span className={masteryTag.className}>{masteryTag.text}</span>
                {!batchMode ? (
                  <span
                    className="row-menu-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.id) {
                        setLongPressWordId(item.id);
                      }
                    }}
                    title="更多操作"
                  >
                    ⋮
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {activeFilter === 'favorites' && displayWords.length === 0 ? (
        <div className="library-empty-state">
          <div className="empty-icon">☆</div>
          <div className="empty-title">还没有收藏任何单词</div>
          <div className="empty-hint">在卡片页点击 ☆ 即可收藏</div>
        </div>
      ) : null}

      {!batchMode ? (
        <>
          <button type="button" className="tap library-fab" onClick={() => setSpeedDialOpen((prev) => !prev)}>
            +
          </button>

          {speedDialOpen ? (
            <div className="speed-dial-overlay" onClick={() => setSpeedDialOpen(false)}>
              <div className="speed-dial-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="tap speed-dial-item upload" onClick={() => openSpeedAction('upload')}>
                  <span>📸</span>
                  <span>上传图片/PDF</span>
                </button>
                <button type="button" className="tap speed-dial-item manual" onClick={() => openSpeedAction('manual')}>
                  <span>✏️</span>
                  <span>手动添加单词</span>
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="batch-bottom-bar">
          <button type="button" className="tap batch-action-btn move" onClick={openBatchMoveSheet}>
            📁 移动到
          </button>
          <button type="button" className="tap batch-action-btn delete" onClick={() => setShowDeleteSheet(true)}>
            🗑 删除
          </button>
        </div>
      )}

      {showBatchMoveSheet ? (
        <BatchMoveSheet
          open={showBatchMoveSheet}
          count={selectedWordIds.length}
          books={batchMoveOptions}
          selectedTargetId={batchMoveTargetId}
          moving={batchMoving}
          onSelectTarget={setBatchMoveTargetId}
          onCancel={() => {
            if (!batchMoving) {
              setShowBatchMoveSheet(false);
            }
          }}
          onConfirm={() => void handleBatchMove()}
        />
      ) : null}

      {showDeleteSheet ? (
        <DeleteConfirmSheet
          open={showDeleteSheet}
          count={selectedWordIds.length}
          loading={batchDeleting}
          onCancel={() => setShowDeleteSheet(false)}
          onConfirm={() => void handleBatchDelete()}
        />
      ) : null}

      {longPressWordId ? (
        <div className="modal-backdrop" onClick={() => setLongPressWordId(null)}>
          <div className="mini-action-sheet" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="tap"
              onClick={() => {
                const row = words.find((item) => item.id === longPressWordId) ?? null;
                setEditingWord(row);
                setLongPressWordId(null);
              }}
            >
              编辑
            </button>
            <button
              type="button"
              className="tap"
              onClick={() => {
                setMovingWordId(longPressWordId);
                setLongPressWordId(null);
              }}
            >
              移动到分组
            </button>
            <button
              type="button"
              className="tap danger-text"
              onClick={() => {
                if (!longPressWordId) return;
                void deleteWord(longPressWordId)
                  .then(() => onRefresh())
                  .then(() => onNotify('success', '删除成功'))
                  .catch((error) =>
                    onNotify('error', error instanceof Error ? error.message : '删除失败'),
                  );
                setLongPressWordId(null);
              }}
            >
              删除
            </button>
            <button
              type="button"
              className="tap"
              onClick={() => {
                if (longPressWordId) {
                  startBatchMode(longPressWordId);
                }
              }}
            >
              批量选择
            </button>
          </div>
        </div>
      ) : null}

      {editingWord ? (
        <EditWordModal
          word={editingWord}
          onClose={() => setEditingWord(null)}
          onSave={async (next) => {
            if (!editingWord.id) return;
            await updateWord(editingWord.id, next);
            await onRefresh();
            onNotify('success', '已保存修改');
            setEditingWord(null);
          }}
        />
      ) : null}

      {movingWordId ? (
        <MoveWordModal
          word={words.find((w) => w.id === movingWordId) ?? null}
          books={books}
          currentBookId={activeBookId}
          onClose={() => setMovingWordId(null)}
          onMove={async (targetBookId) => {
            if (!movingWordId) return;
            try {
              await moveWordToBook(movingWordId, targetBookId);
              await onRefresh();
              onSelectBook(targetBookId);
              onNotify('success', '单词已移动到目标分组');
              setMovingWordId(null);
            } catch (error) {
              onNotify('error', error instanceof Error ? error.message : '移动失败');
            }
          }}
        />
      ) : null}

      {showBookManager ? (
        <BookManagerModal
          books={books}
          activeBookId={activeBookId}
          onClose={() => {
            setShowBookManager(false);
            setRenamingBookId(null);
            setNewBookName('');
          }}
          onSelect={onSelectBook}
          onRename={async (bookId, name) => {
            try {
              await renameBook(bookId, name);
              await onRefresh();
              onNotify('success', '分组已重命名');
              setRenamingBookId(null);
              setNewBookName('');
            } catch (error) {
              onNotify('error', error instanceof Error ? error.message : '重命名失败');
            }
          }}
          onDelete={async (bookId) => {
            try {
              await deleteBook(bookId);
              await onRefresh();
              if (activeBookId === bookId && books.length > 1) {
                const remaining = books.filter((b) => b.id !== bookId);
                if (remaining.length > 0) {
                  onSelectBook(remaining[0].id);
                }
              }
              onNotify('success', '分组已删除');
            } catch (error) {
              onNotify('error', error instanceof Error ? error.message : '删除失败');
            }
          }}
          renamingBookId={renamingBookId}
          newBookName={newBookName}
          setRenamingBookId={setRenamingBookId}
          setNewBookName={setNewBookName}
        />
      ) : null}

      {manualOpen ? (
        <div className="modal-backdrop" onClick={() => setManualOpen(false)}>
          <div className="upload-modal" onClick={(event) => event.stopPropagation()}>
            <header className="upload-modal-header">
              <h3>添加单词</h3>
              <button type="button" className="tap top-nav-icon-btn" onClick={() => setManualOpen(false)}>
                ×
              </button>
            </header>

            {manualStep === 1 ? (
              <section className="upload-step manual-add-step">
                <label className="manual-word-input-wrap">
                  <span>🔍</span>
                  <input
                    value={manualWord}
                    onChange={(e) => setManualWord(e.target.value)}
                    placeholder="输入英文单词，如 ephemeral"
                  />
                </label>
                {manualWordExists ? <p className="manual-exists-tip">该单词已存在于当前词库</p> : null}

                <label className="field-label">
                  选择分组
                  <SelectBookDropdown
                    books={books}
                    activeBookId={manualTargetBookId}
                    onSelectBook={setManualTargetBookId}
                  />
                </label>

                <button
                  type="button"
                  className="tap primary-btn manual-query-btn"
                  onClick={() => void handleManualLookup()}
                >
                  ✨ AI 查询并添加
                </button>
              </section>
            ) : null}

            {manualStep === 2 ? (
              <section className="upload-step manual-loading-step">
                <div className="spinner" />
                <h4>AI 正在查询 {manualWord}...</h4>
                <p className="subtext">生成音标、释义、例句、词根助记</p>
              </section>
            ) : null}

            {manualStep === 3 && manualPreview ? (
              <section className="upload-step manual-preview-step">
                <WordCardPreview word={manualPreview as WordCard} hideFavorite />
                <div className="row-buttons">
                  <button type="button" className="tap ghost-btn" onClick={() => void handleManualLookup()}>
                    重新生成
                  </button>
                  <button type="button" className="tap primary-btn" onClick={() => void handleSaveManual()}>
                    保存到词库
                  </button>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="modal-backdrop" onClick={closeUploader}>
          <div className="upload-modal" onClick={(event) => event.stopPropagation()}>
            <header className="upload-modal-header">
              <h3>{bookName === '从剪贴板提取' ? '从剪贴板提取' : '上传新教程'}</h3>
              <button type="button" className="tap top-nav-icon-btn" onClick={closeUploader}>
                ×
              </button>
            </header>

            {step === 1 ? (
              <section className="upload-step">
                <label className="upload-dropzone">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(event) => handleFilesPicked(event.target.files)}
                  />
                  <p className="upload-icon">📁</p>
                  <p>点击或拖拽上传</p>
                  <small>支持 JPG, PNG, WEBP</small>
                </label>

                {selectedFiles.length ? (
                  <div className="file-preview-list">
                    {selectedFiles.map((file) => (
                      <p key={file.name}>
                        {file.name} · {formatBytes(file.size)}
                      </p>
                    ))}
                  </div>
                ) : null}

                <label className="field-label">
                  教程名称
                  <input
                    value={bookName}
                    onChange={(event) => setBookName(event.target.value)}
                    placeholder="例：Unit 3 词汇"
                    className="setting-input"
                  />
                </label>

                <button type="button" className="tap primary-btn full" onClick={() => void startOCR()}>
                  下一步：OCR 识别
                </button>
              </section>
            ) : null}

            {step === 2 ? (
              <section className="upload-step processing-step">
                <CircleProgress value={ocrProgress} />
                <p className="processing-status">{ocrStatus}</p>
                <div className="processing-bar">
                  <div style={{ width: `${ocrProgress}%` }} />
                </div>
                <button type="button" className="tap text-danger-btn" onClick={() => setStep(1)}>
                  取消
                </button>
              </section>
            ) : null}

            {step === 3 ? (
              <section className="upload-step">
                <h4>确认识别文本</h4>
                <p className="subtext">你可以在提取单词前编辑以下文本</p>
                <textarea value={ocrText} onChange={(event) => setOcrText(event.target.value)} />
                <p className="text-count">{ocrText.length} 字符</p>
                <div className="upload-mode-panel">
                  <div className="upload-mode-header">
                    <strong>词汇提取模式</strong>
                    <span>本次上传</span>
                  </div>
                  <div className="upload-mode-options">
                    {EXTRACT_MODE_OPTIONS.map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        className={`tap upload-mode-option ${uploadExtractMode === option.value ? 'active' : ''}`}
                        onClick={() => setUploadExtractMode(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="upload-mode-description">{selectedExtractModeOption.description}</p>
                  {/* 小模型未配置警告 */}
                  {(uploadExtractMode === 'large_structure_small_enrich' || uploadExtractMode === 'small_only') &&
                    !settings.smallLlm?.apiKey?.trim() && (
                    <p style={{
                      marginTop: '8px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--color-warning-bg, #fef3c7)',
                      color: 'var(--color-warning-text, #92400e)',
                      fontSize: '0.78rem',
                      lineHeight: 1.5,
                    }}>
                      ⚠ 当前模式需要配置小模型 API Key，请先前往设置 → 小模型配置填写后再提取
                    </p>
                  )}
                  {uploadExtractMode === 'large_only' && !settings.llm?.apiKey?.trim() && (
                    <p style={{
                      marginTop: '8px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--color-warning-bg, #fef3c7)',
                      color: 'var(--color-warning-text, #92400e)',
                      fontSize: '0.78rem',
                    }}>
                      ⚠ 当前模式需要配置大模型 API Key，请先前往设置填写
                    </p>
                  )}
                </div>
                <div className="row-buttons">
                  <button type="button" className="tap ghost-btn" onClick={() => void startOCR()}>
                    重新识别
                  </button>
                  <button type="button" className="tap primary-btn" onClick={() => void handleExtractWords()}>
                    提取单词 →
                  </button>
                </div>
              </section>
            ) : null}

            {step === 4 ? (
              <section className="upload-step">
                <div className="spinner" />
                <h4>AI 正在处理词汇...</h4>

                {/* 当前阶段状态 */}
                <p className="processing-status">{extractProgress.status}</p>

                {/* 模式标签 */}
                <p className="subtext" style={{ marginBottom: '8px', opacity: 0.6, fontSize: '0.75rem' }}>
                  {uploadExtractMode === 'large_only' && '大模型全包揽'}
                  {uploadExtractMode === 'large_structure_small_enrich' && '大模型整理 + 小模型补全'}
                  {uploadExtractMode === 'small_only' && '小模型全流程'}
                </p>

                {/* 数据统计格 */}
                <div className="extract-progress-grid">
                  {extractProgress.structuredCount > 0 && (
                    <div>
                      <span>已整理</span>
                      <strong>{extractProgress.structuredCount}</strong>
                    </div>
                  )}
                  <div>
                    <span>已完成</span>
                    <strong>
                      {extractProgress.completed}
                      {extractProgress.total > 0 ? ` / ${extractProgress.total}` : ''}
                    </strong>
                  </div>
                  {extractProgress.failed > 0 && (
                    <div>
                      <span>失败</span>
                      <strong style={{ color: 'var(--color-warning, #f59e0b)' }}>
                        {extractProgress.failed}
                      </strong>
                    </div>
                  )}
                </div>

                {/* 批次进度 */}
                {extractProgress.totalBatches > 0 ? (
                  <div style={{ width: '100%' }}>
                    <p className="subtext" style={{ marginBottom: '4px' }}>
                      第 {extractProgress.batchIndex} / {extractProgress.totalBatches} 批
                    </p>
                    <div style={{
                      height: '4px',
                      borderRadius: '2px',
                      background: 'var(--color-border, #e5e7eb)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        borderRadius: '2px',
                        background: 'var(--color-primary, #6366f1)',
                        width: `${Math.round((extractProgress.batchIndex / extractProgress.totalBatches) * 100)}%`,
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                ) : (
                  <p className="subtext">已生成 {extractingCount} 张词卡</p>
                )}

                {/* 最近词卡预览 */}
                <div className="stream-preview">
                  {candidateWords.slice(-6).map((item) => (
                    <div className="stream-word-card" key={item.id}>
                      <strong>{item.data.word}</strong>
                      <span>{item.data.pos}</span>
                      <small>{item.data.meaning_brief}</small>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="tap text-danger-btn"
                  onClick={() => {
                    extractAbortRef.current?.abort();
                    setProcessing(false);
                    setStep(3);
                  }}
                >
                  取消提取
                </button>
              </section>
            ) : null}

            {step === 5 ? (
              <section className="upload-step">
                <h4>确认保存 ({candidateWords.length} 个单词)</h4>
                <p className="subtext">
                  {extractFailures.length ? '部分词处理失败，可稍后重试' : '你可以取消选择不需要的单词'}
                </p>
                {extractFailures.length ? (
                  <div className="extract-failure-banner">
                    <strong>失败 {extractFailures.length} 项</strong>
                    <span>
                      {extractFailures
                        .slice(0, 3)
                        .map((item) => item.word || item.message)
                        .join('、')}
                      {extractFailures.length > 3 ? ' 等' : ''}
                    </span>
                  </div>
                ) : null}
                <button type="button" className="tap ghost-btn" onClick={toggleSelectAll}>
                  {candidateWords.every((item) => item.selected) ? '取消全选' : '全选'}
                </button>

                {dedupePreview > 0 ? (
                  <div className="duplicate-banner">
                    <p>发现 {dedupePreview} 个已存在的单词，将根据策略处理</p>
                    <div className="row-buttons">
                      <button
                        type="button"
                        className={`tap ghost-btn ${duplicateMode === 'skip' ? 'active' : ''}`}
                        onClick={() => setDuplicateMode('skip')}
                      >
                        跳过重复
                      </button>
                      <button
                        type="button"
                        className={`tap ghost-btn ${duplicateMode === 'overwrite' ? 'active' : ''}`}
                        onClick={() => setDuplicateMode('overwrite')}
                      >
                        覆盖重复
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="candidate-list">
                  {candidateWords.map((item) => (
                    <label key={item.id} className="candidate-row">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setCandidateWords((prev) =>
                            prev.map((row) => (row.id === item.id ? { ...row, selected: checked } : row)),
                          );
                        }}
                      />
                      <div>
                        <strong>{item.data.word}</strong>
                        <small>{item.data.pos}</small>
                        <p>{item.data.meaning_brief}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <button
                  type="button"
                  className="tap primary-btn full"
                  disabled={processing}
                  onClick={() => void handleSaveSelected()}
                >
                  保存选中 ({selectedCount} 个)
                </button>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SelectBookDropdown({
  books,
  activeBookId,
  onSelectBook,
}: {
  books: Book[];
  activeBookId: string | null;
  onSelectBook: (bookId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = books.find((book) => book.id === activeBookId) ?? books[0] ?? null;

  return (
    <div className="book-dropdown">
      <button type="button" className="tap select-trigger" onClick={() => setOpen((prev) => !prev)}>
        <span>{active?.name ?? '暂无教程'}</span>
        <span>⌄</span>
      </button>

      {open ? (
        <div className="select-dropdown">
          {books.map((book) => (
            <button
              type="button"
              key={book.id}
              className={`tap select-option ${book.id === activeBookId ? 'active' : ''}`}
              onClick={() => {
                onSelectBook(book.id);
                setOpen(false);
              }}
            >
              {book.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CircleProgress({ value }: { value: number }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamp(value, 0, 100) / 100) * circumference;

  return (
    <div className="circle-progress-wrap">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle className="circle-bg" cx="40" cy="40" r={radius} strokeWidth="6" fill="none" />
        <circle
          className="circle-fg"
          cx="40"
          cy="40"
          r={radius}
          strokeWidth="6"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span>{Math.round(value)}%</span>
    </div>
  );
}

function BatchMoveSheet({
  open,
  count,
  books,
  selectedTargetId,
  moving,
  onSelectTarget,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  count: number;
  books: Book[];
  selectedTargetId: string | null;
  moving: boolean;
  onSelectTarget: (bookId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop delete-sheet-backdrop" onClick={onCancel}>
      <div className="batch-move-sheet" onClick={(event) => event.stopPropagation()}>
        <h3>移动 {count} 个单词</h3>
        <p>选择目标分组后确认移动</p>

        {books.length === 0 ? (
          <div className="batch-move-empty">没有可移动的目标分组</div>
        ) : (
          <div className="batch-move-list">
            {books.map((book) => (
              <button
                key={book.id}
                type="button"
                className={`tap batch-move-target ${selectedTargetId === book.id ? 'active' : ''}`}
                onClick={() => onSelectTarget(book.id)}
                disabled={moving}
              >
                <div className="batch-move-target-name">{book.name}</div>
                <div className="batch-move-target-count">{book.wordCount} 个单词</div>
              </button>
            ))}
          </div>
        )}

        <div className="row-buttons">
          <button type="button" className="tap ghost-btn" onClick={onCancel} disabled={moving}>
            取消
          </button>
          <button
            type="button"
            className="tap primary-btn"
            onClick={onConfirm}
            disabled={moving || !selectedTargetId || books.length === 0}
          >
            {moving ? '移动中...' : '确认移动'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditWordModal({
  word,
  onClose,
  onSave,
}: {
  word: WordCard;
  onClose: () => void;
  onSave: (patch: Partial<WordCard>) => Promise<void>;
}) {
  const [meaning, setMeaning] = useState(word.meaning_brief);
  const [pos, setPos] = useState(word.pos);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="edit-modal" onClick={(event) => event.stopPropagation()}>
        <h3>编辑单词</h3>
        <label>
          单词
          <input className="setting-input" value={word.word} disabled />
        </label>
        <label>
          词性
          <input className="setting-input" value={pos} onChange={(event) => setPos(event.target.value)} />
        </label>
        <label>
          释义
          <textarea value={meaning} onChange={(event) => setMeaning(event.target.value)} />
        </label>
        <div className="row-buttons">
          <button type="button" className="tap ghost-btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="tap primary-btn"
            onClick={() => void onSave({ pos, meaning_brief: meaning })}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function MoveWordModal({
  word,
  books,
  currentBookId,
  onClose,
  onMove,
}: {
  word: WordCard | null;
  books: Book[];
  currentBookId: string | null;
  onClose: () => void;
  onMove: (targetBookId: string) => void;
}) {
  if (!word) return null;

  const availableBooks = books.filter((b) => b.id !== currentBookId);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
        <h3>移动单词</h3>
        <p style={{ marginBottom: '1rem', color: '#666' }}>
          将 <strong>{word.word}</strong> 移动到：
        </p>

        {availableBooks.length === 0 ? (
          <p style={{ color: '#999', textAlign: 'center', padding: '1rem' }}>没有其他分组可供选择</p>
        ) : (
          <div className="book-list" style={{ maxHeight: '200px', overflow: 'auto', marginBottom: '1rem' }}>
            {availableBooks.map((book) => (
              <button
                key={book.id}
                type="button"
                className="tap book-list-item"
                onClick={() => onMove(book.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.75rem',
                  textAlign: 'left',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  marginBottom: '0.5rem',
                  background: '#fff',
                }}
              >
                <div style={{ fontWeight: 500 }}>{book.name}</div>
                <div style={{ fontSize: '0.85rem', color: '#999' }}>{book.wordCount} 个单词</div>
              </button>
            ))}
          </div>
        )}

        <div className="row-buttons">
          <button type="button" className="tap ghost-btn" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

function BookManagerModal({
  books,
  activeBookId,
  onClose,
  onSelect,
  onRename,
  onDelete,
  renamingBookId,
  newBookName,
  setRenamingBookId,
  setNewBookName,
}: {
  books: Book[];
  activeBookId: string | null;
  onClose: () => void;
  onSelect: (bookId: string) => void;
  onRename: (bookId: string, name: string) => void;
  onDelete: (bookId: string) => void;
  renamingBookId: string | null;
  newBookName: string;
  setRenamingBookId: (id: string | null) => void;
  setNewBookName: (name: string) => void;
}) {
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="edit-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="upload-modal-header" style={{ marginBottom: '1rem' }}>
          <h3>管理分组</h3>
          <button type="button" className="tap top-nav-icon-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="book-list" style={{ maxHeight: '300px', overflow: 'auto' }}>
          {books.map((book) => (
            <div
              key={book.id}
              className="book-list-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.75rem',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                marginBottom: '0.5rem',
                background: activeBookId === book.id ? '#f0f7ff' : '#fff',
              }}
            >
              {renamingBookId === book.id ? (
                <div style={{ flex: 1, display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className="setting-input"
                    value={newBookName}
                    onChange={(e) => setNewBookName(e.target.value)}
                    autoFocus
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="tap primary-btn"
                    onClick={() => onRename(book.id, newBookName)}
                    disabled={!newBookName.trim()}
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    className="tap ghost-btn"
                    onClick={() => {
                      setRenamingBookId(null);
                      setNewBookName('');
                    }}
                  >
                    取消
                  </button>
                </div>
              ) : (
                <>
                  <div
                    style={{ flex: 1, cursor: 'pointer' }}
                    onClick={() => {
                      onSelect(book.id);
                      onClose();
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>{book.name}</div>
                    <div style={{ fontSize: '0.85rem', color: '#999' }}>
                      {book.wordCount} 个单词
                      {activeBookId === book.id && ' · 当前选中'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="tap ghost-btn"
                      onClick={() => {
                        setRenamingBookId(book.id);
                        setNewBookName(book.name);
                      }}
                      title="重命名"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="tap danger-btn"
                      onClick={() => setDeletingBookId(book.id)}
                      title="删除"
                      disabled={books.length <= 1}
                      style={{ opacity: books.length <= 1 ? 0.3 : 1 }}
                    >
                      🗑
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {books.length <= 1 ? (
          <p style={{ color: '#999', fontSize: '0.85rem', marginTop: '1rem', textAlign: 'center' }}>
            至少保留一个分组
          </p>
        ) : null}
      </div>

      {deletingBookId ? (
        <DeleteConfirmSheet
          open={Boolean(deletingBookId)}
          count={books.find((b) => b.id === deletingBookId)?.wordCount ?? 0}
          label={`删除分组「${books.find((b) => b.id === deletingBookId)?.name ?? ''}」及其 ${books.find((b) => b.id === deletingBookId)?.wordCount ?? 0} 个单词`}
          onCancel={() => setDeletingBookId(null)}
          onConfirm={() => {
            onDelete(deletingBookId);
            setDeletingBookId(null);
          }}
        />
      ) : null}
    </div>
  );
}
