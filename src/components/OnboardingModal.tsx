import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { AppSettings } from '../types';

interface OnboardingModalProps {
  settings: AppSettings;
  onComplete: (next: Partial<AppSettings>) => void;
}

export function OnboardingModal({ settings, onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(1);
  const [llmApiKey, setLlmApiKey] = useState(settings.llm.apiKey);
  const [ocrApiKey, setOcrApiKey] = useState(settings.ocr.apiKey ?? '');

  return createPortal(
    <div className="onboarding-modal">
      {step === 1 ? (
          <section className="onboarding-step">
            <h2>欢迎使用 LinguaFlash</h2>
            <p>OCR + AI 点读卡片与智能复习系统。先完成必要配置。</p>
            <button type="button" className="tap primary-btn" onClick={() => setStep(2)}>
              开始配置
            </button>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="onboarding-step">
            <h2>填写 LLM API Key</h2>
            <input
              value={llmApiKey}
              onChange={(event) => setLlmApiKey(event.target.value)}
              placeholder="sk-..."
              className="setting-input"
            />
            <a href="https://platform.deepseek.com" target="_blank" rel="noreferrer">
              获取 API Key
            </a>
            <button
              type="button"
              className="tap primary-btn"
              disabled={!llmApiKey.trim()}
              onClick={() => setStep(3)}
            >
              下一步
            </button>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="onboarding-step">
            <h2>填写 OCR API Key（可选）</h2>
            <input
              value={ocrApiKey}
              onChange={(event) => setOcrApiKey(event.target.value)}
              placeholder="可留空，稍后在设置中填写"
              className="setting-input"
            />
            <div className="row-buttons">
              <button type="button" className="tap ghost-btn" onClick={() => setStep(4)}>
                跳过
              </button>
              <button type="button" className="tap primary-btn" onClick={() => setStep(4)}>
                下一步
              </button>
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="onboarding-step">
            <h2>隐私说明</h2>
            <p>所有数据仅存于你的浏览器，API Key 不上传到 LinguaFlash 服务器。</p>
            <button
              type="button"
              className="tap primary-btn"
              onClick={() =>
                onComplete({
                  llm: { ...settings.llm, apiKey: llmApiKey.trim() },
                  ocr: { ...settings.ocr, apiKey: ocrApiKey.trim() },
                })
              }
            >
              开始使用
            </button>
          </section>
        ) : null}
    </div>,
    document.body
  );
}
