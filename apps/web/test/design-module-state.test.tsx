// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { DesignModuleState } from '../src/design/DesignModuleState';

const PAGES = [
  { moduleKey: 'create', pageKey: 'projects', emptyTitle: 'All projects 未提供' },
  { moduleKey: 'create', pageKey: 'outputs', emptyTitle: 'Outputs 未提供' },
  { moduleKey: 'material', pageKey: 'library', emptyTitle: '素材庫 未提供' },
  { moduleKey: 'knowledge', pageKey: 'list', emptyTitle: '內容清單 未提供' },
  { moduleKey: 'templates', pageKey: 'library', emptyTitle: 'Templates 未提供' },
] as const;

afterEach(cleanup);

describe('未接後端的 Marketing Design 頁仍有完整狀態', () => {
  it.each(PAGES)('$moduleKey/$pageKey 的 empty 說明真實情況', ({ moduleKey, pageKey, emptyTitle }) => {
    render(<DesignModuleState moduleKey={moduleKey} pageKey={pageKey} status="empty" />);

    expect(screen.getByText(emptyTitle)).toBeTruthy();
    expect(document.querySelector('[data-design-module-state="empty"]')).not.toBeNull();
  });

  for (const status of ['loading', 'error', 'permission'] as const) {
    it.each(PAGES)(`$moduleKey/$pageKey 有 ${status} 狀態`, ({ moduleKey, pageKey }) => {
      render(<DesignModuleState moduleKey={moduleKey} pageKey={pageKey} status={status} />);

      const node = document.querySelector(`[data-design-module-state="${status}"]`);
      expect(node).not.toBeNull();
      expect(node?.textContent?.trim().length).toBeGreaterThan(0);
      if (status === 'loading') {
        expect(node?.getAttribute('role')).toBe('status');
      } else {
        expect(node?.getAttribute('role')).toBe('alert');
      }
    });
  }
});
