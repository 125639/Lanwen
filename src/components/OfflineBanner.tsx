interface OfflineBannerProps {
  status: 'offline' | 'online' | null;
}

export function OfflineBanner({ status }: OfflineBannerProps) {
  if (!status) {
    return null;
  }

  const online = status === 'online';
  return (
    <div className={`offline-banner ${online ? 'online' : 'offline'}`} role="status" aria-live="polite">
      {online
        ? '✅ 网络已恢复'
        : '📶 已离线 · 可正常复习已有单词，上传功能暂不可用'}
    </div>
  );
}
