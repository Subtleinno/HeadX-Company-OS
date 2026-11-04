import { t } from '@company-os/i18n';
import { ScreenFrame, StatusScreen } from './ScreenFrame.js';

/** 載入中：只有一句話，不閃任何骨架。 */
export function LoadingScreen() {
  return <StatusScreen busy status={t('status.loading')} />;
}

/** 連不到伺服器：不顯示空白頁，也不顯示任何假資料。 */
export function ConnectionErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <ScreenFrame
      titleId="connection-error-title"
      title={t('error.unreachable.title')}
      description={t('error.unreachable.body')}
    >
      <button type="button" className="button button--primary" onClick={onRetry}>
        {t('common.retry')}
      </button>
    </ScreenFrame>
  );
}
