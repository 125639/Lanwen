import type { TabKey } from '../types';
import { NAV_ITEMS } from '../navItems';

interface DesktopSidebarProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function DesktopSidebar({ activeTab, onChange, collapsed, onToggleCollapsed }: DesktopSidebarProps) {
  return (
    <aside className={`desktop-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="desktop-sidebar-head">
        <div className="desktop-sidebar-brand" aria-hidden={collapsed}>
          <strong>Lanwen</strong>
          <small>English Trainer</small>
        </div>
        <button
          type="button"
          className="tap desktop-sidebar-toggle ripple-btn"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>

      <nav className="desktop-nav-list" aria-label="主导航">
        {NAV_ITEMS.map((item) => {
          const active = item.key === activeTab;
          return (
            <button
              key={item.key}
              type="button"
              className={`tap desktop-nav-item ripple-btn ${active ? 'active' : ''}`}
              onClick={() => onChange(item.key)}
              title={collapsed ? item.label : undefined}
            >
              <span className="desktop-nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="desktop-nav-label" aria-hidden={collapsed}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
