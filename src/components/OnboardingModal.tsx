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
  const [smallLlmApiKey, setSmallLlmApiKey] = useState(settings.smallLlm.apiKey || settings.llm.apiKey);
  const [ocrApiKey, setOcrApiKey] = useState(settings.ocr.apiKey ?? '');

  return createPortal(
    <div className="onboarding-modal">
      {step === 1 ? (
          <section className="onboarding-step">
            <div className="onboarding-emoji">👋</div>
            <h2 className="onboarding-title">欢迎使用 Lanwen</h2>
            <p className="onboarding-desc">OCR + AI 点读卡片与智能复习系统。先完成必要配置。</p>
            <div className="onboarding-actions">
              <button type="button" className="tap primary-btn onboarding-btn" onClick={() => setStep(2)}>
                开始配置
              </button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="onboarding-step">
            <div className="onboarding-emoji">🤖</div>
            <h2 className="onboarding-title">填写大模型 / 小模型 Key</h2>
            <p className="onboarding-desc">默认模式会同时用到大模型和小模型，推荐使用 SiliconFlow API。</p>
            <div className="onboarding-input-group">
              <input
                value={llmApiKey}
                onChange={(event) => setLlmApiKey(event.target.value)}
                placeholder="大模型 Key（DeepSeek-V4-Flash）"
                className="onboarding-input"
              />
              <input
                value={smallLlmApiKey}
                onChange={(event) => setSmallLlmApiKey(event.target.value)}
                placeholder="小模型 Key（Qwen3.5-9B，可与上面相同）"
                className="onboarding-input"
              />
              <div className="onboarding-hint">
                <a href="https://cloud.siliconflow.cn" target="_blank" rel="noreferrer">
                  获取 API Key
                </a>
              </div>
            </div>
            <div className="onboarding-actions">
              <button
                type="button"
                className="tap primary-btn onboarding-btn"
                disabled={!llmApiKey.trim()}
                onClick={() => setStep(3)}
              >
                下一步
              </button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="onboarding-step">
            <div className="onboarding-emoji">📷</div>
            <h2 className="onboarding-title">填写 OCR API Key（可选）</h2>
            <p className="onboarding-desc">用于从图片提取文本。不填则无法使用拍照录入功能。</p>
            <div className="onboarding-input-group">
              <input
                value={ocrApiKey}
                onChange={(event) => setOcrApiKey(event.target.value)}
                placeholder="可留空，稍后在设置中填写"
                className="onboarding-input"
              />
            </div>
            <div className="onboarding-actions">
              <button type="button" className="tap ghost-btn onboarding-btn" onClick={() => setStep(4)}>
                跳过
              </button>
              <button type="button" className="tap primary-btn onboarding-btn" onClick={() => setStep(4)}>
                下一步
              </button>
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="onboarding-step">
            <div className="onboarding-emoji">🔒</div>
            <h2 className="onboarding-title">隐私说明</h2>
            <p className="onboarding-desc">所有数据仅存于你的浏览器，API Key 不上传到 Lanwen 服务器。</p>
            <div className="onboarding-actions">
              <button
                type="button"
                className="tap primary-btn onboarding-btn"
                onClick={() =>
                  onComplete({
                    llm: { ...settings.llm, apiKey: llmApiKey.trim() },
                    smallLlm: {
                      ...settings.smallLlm,
                      apiKey: (smallLlmApiKey || llmApiKey).trim(),
                    },
                    ocr: { ...settings.ocr, apiKey: ocrApiKey.trim() },
                  })
                }
              >
                开始使用
              </button>
            </div>
          </section>
        ) : null}
    </div>,
    document.body
  );
}
