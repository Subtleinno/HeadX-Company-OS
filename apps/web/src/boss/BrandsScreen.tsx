import { t } from '@company-os/i18n';
import type { BrandsState } from '../frame/useDirectory';
import { BrandCreateForm } from './BrandCreateForm';

/**
 * Boss Portal › 品牌 › 全部品牌。
 *
 * 這一頁是品牌的唯一入口（2026-11-17 老闆：新增品牌不放在 Design）。
 * 兩個狀態要老實講：
 *   - 讀唔到清單：講明讀唔到，不畫一個空清單扮「一個品牌都冇」；
 *   - 真的一個都冇：講清楚「開第一個」之後哪些地方會有內容。
 *
 * 每一行是一條 hash 連結（`#/boss/brand/<id>`），可以直接開新分頁分享。
 */

type BrandsScreenProps = {
  state: BrandsState;
  canCreate: boolean;
  /** 表單是否打開；由 `BossPortal` 的頁頭按鈕控制（按鈕在 header）。 */
  creating: boolean;
  onCreated: () => void;
  onCancel: () => void;
};

export function BrandsScreen({ state, canCreate, creating, onCreated, onCancel }: BrandsScreenProps) {
  if (state.kind === 'loading') {
    return (
      <p className="boss-note" data-brands-loading>
        {t('brandBuild.loading')}
      </p>
    );
  }

  if (state.kind === 'failed') {
    return (
      <p className="boss-note boss-note--error" role="alert" data-brands-failed>
        {t('boss.overview.readFailed')}
      </p>
    );
  }

  const { items } = state;

  return (
    <div className="boss-brands" data-boss-brands>
      {creating && canCreate && <BrandCreateForm onCreated={onCreated} onCancel={onCancel} />}

      {items.length === 0 ? (
        <p className="boss-note" data-brands-empty>
          {canCreate ? t('boss.brand.empty') : t('boss.brand.ownerOnly')}
        </p>
      ) : (
        <ul className="boss-brandlist">
          {items.map((brand) => (
            <li key={brand.id}>
              <a className="boss-brandlist__row" href={`#/boss/brand/${brand.id}`} data-brand-row={brand.id}>
                <span className="boss-brandlist__name">{brand.name}</span>
                <span className="boss-brandlist__code">{brand.code}</span>
                <span className="boss-brandlist__go" aria-hidden="true">
                  {t('boss.brand.open')}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
