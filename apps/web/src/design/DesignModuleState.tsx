import { t, type MessageKey } from '@company-os/i18n';
import { DESIGN_NAV, navLabel } from '../frame/appNav';

export type DesignModuleStatus = 'loading' | 'empty' | 'error' | 'permission';

type DesignModuleStateProps = {
  moduleKey: 'create' | 'material' | 'knowledge' | 'templates';
  pageKey: string;
  status: DesignModuleStatus;
};

const TITLE_KEY: Record<DesignModuleStatus, MessageKey> = {
  loading: 'frame.state.loading',
  empty: 'frame.state.notProvided',
  error: 'frame.state.readFailed',
  permission: 'frame.state.permissionDenied',
};

/**
 * 新模組未接 API 之前的固定落點。
 *
 * 頁名來自同一份 DESIGN_NAV，狀態文字來自現有字串表；不在 TSX 另寫一套
 * 中文文案。empty 是目前真實狀態，loading／error／permission 由日後資料
 * hook 明確傳入，三者不會被當成空庫，也不提供按了才失敗的假動作。
 */
export function DesignModuleState({ moduleKey, pageKey, status }: DesignModuleStateProps) {
  const page = DESIGN_NAV.modules
    .find((item) => item.key === moduleKey)
    ?.groups.flatMap((group) => group.pages)
    .find((item) => item.key === pageKey);
  const subject = page === undefined ? pageKey : navLabel(page);
  const role = status === 'loading' ? 'status' : status === 'empty' ? undefined : 'alert';

  return (
    <section
      className="design-stub"
      data-design-module-state={status}
      data-design-module={moduleKey}
      data-design-page={pageKey}
      role={role}
      aria-live={status === 'loading' ? 'polite' : undefined}
    >
      <h2 className="design-stub__title">{subject} {t(TITLE_KEY[status])}</h2>
      {status === 'empty' && <p className="design-stub__body">{t('design.stub.body')}</p>}
    </section>
  );
}
