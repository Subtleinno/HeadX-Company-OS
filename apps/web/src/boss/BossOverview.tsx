import { t } from '@company-os/i18n';
import { BrandBusinessSummary } from '../design/BrandScreen';
import { useBrands } from '../frame/useDirectory';

/**
 * Boss Portal 首頁：全公司業務。
 *
 * 2026-11-17 老闆定：原本四個 KPI 數（幾台機、幾多待批准、幾個品牌、幾件 Needs）
 * 唔係他要在這裡睇的東西 —— 那四個數字冇講到「公司怎麼運作」。首頁改成業務
 * 本身：每個品牌一節，由它自己的 00 業務基礎自動生成業務畫布、單位經濟、
 * 起步清單。
 *
 * 這裡**只讀**。要改就打開左欄該品牌的頁；兩邊讀同一份資料，沒有第二份
 * 「首頁版」的答案。跨品牌匯總（例如全公司收入來源合併）等老闆之後再定，
 * 現在唔自己砌一個聽起來好科學的總數。
 */
export function BossOverview() {
  const brands = useBrands(true);
  const items = brands.state.kind === 'ready' ? brands.state.items : [];

  return (
    <div className="boss-business" data-boss-overview>
      <header className="boss-business__head">
        <h2 className="boss-business__title">{t('boss.overview.business')}</h2>
        <p className="boss-business__lead">{t('boss.overview.businessLead')}</p>
      </header>

      {brands.state.kind === 'loading' && <p className="boss-note">{t('brandBuild.loading')}</p>}
      {brands.state.kind === 'failed' && <p className="boss-note">{t('boss.overview.readFailed')}</p>}
      {brands.state.kind === 'ready' && items.length === 0 && (
        <p className="boss-note">{t('boss.overview.noBrand')}</p>
      )}

      {items.map((brand) => (
        <section key={brand.id} className="boss-business__brand" data-boss-brand={brand.id}>
          <h3 className="boss-business__brandName">{brand.name}</h3>
          <BrandBusinessSummary brandId={brand.id} />
        </section>
      ))}
    </div>
  );
}
