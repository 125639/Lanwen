import type { TabKey } from '../types';
import { NAV_ITEMS } from '../navItems';

interface BottomNavProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}

export function BottomNav({ activeTab, onChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {NAV_ITEMS.map((item) => {
          const active = item.key === activeTab;
          return (
            <button
              key={item.key}
              type="button"
              className={`tap nav-item ${active ? 'active' : ''}`}
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
