import type { TabKey } from './types';

export interface NavItem {
  key: TabKey;
  icon: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'cards', icon: '📇', label: '卡片' },
  { key: 'learn', icon: '🔥', label: '背词' },
  { key: 'en2zh', icon: '📝', label: 'EN→ZH' },
  { key: 'zh2en', icon: '🔄', label: 'ZH→EN' },
  { key: 'reading', icon: '📰', label: '阅读' },
  { key: 'library', icon: '📚', label: '词库' },
];
