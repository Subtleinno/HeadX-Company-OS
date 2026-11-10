import { t } from '@company-os/i18n';
import { navigate } from '../router';

/**
 * 權限不足（決策 C66，設計稿 frame-08）。
 *
 * 刻意**唔**套外殼：冇 app selector、冇模組第二行、冇左側欄、冇頁尾據點入口。
 * 原因唔係美觀 —— 留低個殼等於把整個選單結構送給一個冇權限的人：
 * 佢會睇到公司裝了幾個 app、每個 app 有哪幾頁。呢啲都係唔應該外流的資訊。
 *
 * 亦都唔會用一個「空畫面」假裝已載入：空畫面同「真係冇資料」分唔到。
 */

type PermissionGateProps = {
  role: string;
};

export function PermissionGate({ role }: PermissionGateProps) {
  const roleLabel = role === 'owner' ? t('gate.role.owner') : t('gate.role.staff');

  return (
    <main className="gate">
      <div className="gate__panel">
        <h1 className="gate__title">{t('gate.title')}</h1>
        <p className="gate__body">{t('gate.body', { role: roleLabel })}</p>
        <button
          type="button"
          className="gate__back"
          onClick={() => {
            navigate('/');
          }}
        >
          {t('gate.back')}
        </button>
      </div>
    </main>
  );
}
