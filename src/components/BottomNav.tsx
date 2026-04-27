import type { TabKey } from '../types';
import { NAV_ITEMS } from '../navItems';
import type { CSSProperties } from 'react';

interface BottomNavProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}

export function BottomNav({ activeTab, onChange }: BottomNavProps) {
  const activeIndex = Math.max(0, NAV_ITEMS.findIndex((item) => item.key === activeTab));
  const navStyle = {
    '--nav-active-index': activeIndex,
    '--nav-active-offset': `${activeIndex * 100}%`,
    '--nav-count': NAV_ITEMS.length,
  } as CSSProperties;

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner" style={navStyle}>
        <span className="nav-active-pill" aria-hidden="true" />
        {NAV_ITEMS.map((item) => {
          const active = item.key === activeTab;
          return (
            <button
              key={item.key}
              type="button"
              className={`tap nav-item ripple-btn ${active ? 'active' : ''}`}
              onClick={() => onChange(item.key)}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              title={item.label}
            >
              <span className="nav-icon-wrap">
                <span className="nav-icon">{item.icon}</span>
              </span>
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
