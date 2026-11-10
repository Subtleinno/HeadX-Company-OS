import { useState } from 'react';
import { t } from '@company-os/i18n';
import { approveSite, type SiteItem } from '../api';
import { formatDate, type SitesState } from './useSites';

/**
 * 據點目錄（設計稿 frame-06）。
 *
 * 三條刻意嘅取捨：
 * 1. **冇「在線」燈**。設計稿自己講明「目錄唔顯示即時在線狀態」。存一個
 *    online 欄就要有人維護它，而佢一定會有一日過時 —— 到時畫面講「在線」
 *    但實際上連唔到，比唔講更差。所以只顯示「最後憑證交換」這個事實。
 * 2. **入口唔係個個都有**。只有已登記而且填了網址嘅據點才有「開新分頁」；
 *    其餘顯示破折號。冇網址都畫一個掣，撳完只會去一個連唔到的地方。
 * 3. **待批准嘅據點，入口欄放嘅係「批准」**。設計稿寫「檢視憑證」，但呢個
 *    版本嘅憑證只喺建立嗰一刻顯示過一次（只存 hash），再「檢視」係做唔到的；
 *    放一個攞唔返憑證嘅掣就係假功能。所以放真正做得到嘅動作。
 */

type SitesScreenProps = {
  state: SitesState;
  onApproved: () => void;
  onAdd: () => void;
};

function statusLabel(site: SiteItem): string {
  const base =
    site.status === 'registered'
      ? t('boss.sites.status.registered')
      : site.status === 'pending'
        ? t('boss.sites.status.pending')
        : t('boss.sites.status.revoked');

  // 設計稿（frame-06）：「已登記・本機」。本機身份講一次就夠，但狀態格
  // 係人最先望嘅地方，喺呢度講清楚邊一部係自己，比只喺細字行講好。
  return site.isLocal ? `${base}・${t('boss.sites.localTag')}` : base;
}

export function SitesScreen({ state, onApproved, onAdd }: SitesScreenProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleApprove(site: SiteItem): Promise<void> {
    if (busyId !== null) {
      return;
    }

    setNotice(null);
    setBusyId(site.id);

    const result = await approveSite(site.id);

    setBusyId(null);

    if (result.ok) {
      onApproved();
      return;
    }

    setNotice(t('boss.sites.approveFailed'));
  }

  if (state.kind === 'loading') {
    return (
      <p className="boss-note" role="status">
        {t('boss.sites.loading')}
      </p>
    );
  }

  if (state.kind === 'failed') {
    return (
      <p className="boss-note boss-note--error" role="alert">
        {t('boss.sites.readFailed')}
      </p>
    );
  }

  return (
    <>
      <p className="boss-note">{t('boss.sites.notice')}</p>

      {state.items.length === 0 ? (
        <p className="boss-empty">
          {t('boss.sites.empty')}{' '}
          <button type="button" className="boss-link" onClick={onAdd}>
            {t('boss.sites.add')}
          </button>
        </p>
      ) : (
        <div className="boss-sites-card">
          <table className="boss-sites">
          <thead>
            <tr>
              <th scope="col">{t('boss.sites.col.site')}</th>
              <th scope="col">{t('boss.sites.col.status')}</th>
              <th scope="col">{t('boss.sites.col.fingerprint')}</th>
              <th scope="col">{t('boss.sites.col.entry')}</th>
            </tr>
          </thead>
          <tbody>
            {state.items.map((site) => {
              const lastSeen = formatDate(site.lastCredentialAt);
              const seenLabel =
                lastSeen === null
                  ? t('boss.sites.noExchange')
                  : t('boss.sites.lastExchange', { date: lastSeen });

              return (
                <tr key={site.id} data-site-row data-site-status={site.status}>
                  <td>
                    <span className="boss-sites__name">
                      {site.name}
                      {site.companyLabel === null ? null : `・${site.companyLabel}`}
                    </span>
                    {/* 設計稿：代碼・本機・最後交換，三段都用「・」分隔。 */}
                    <span className="boss-sites__meta">
                      {site.isLocal
                        ? `${site.code}・${t('boss.sites.localTag')}・${seenLabel}`
                        : `${site.code}・${seenLabel}`}
                    </span>
                  </td>
                  <td data-label={t('boss.sites.col.status')}>
                    <span className="boss-sites__status" data-site-status-label>
                      {statusLabel(site)}
                    </span>
                  </td>
                  <td className="boss-sites__fp" data-label={t('boss.sites.col.fingerprint')}>
                    {site.fingerprint ?? t('boss.sites.missing')}
                  </td>
                  <td data-label={t('boss.sites.col.entry')}>
                    {site.status === 'pending' ? (
                      <button
                        type="button"
                        className="boss-link"
                        disabled={busyId !== null}
                        onClick={() => void handleApprove(site)}
                      >
                        {t('boss.sites.approve')}
                      </button>
                    ) : site.entryUrl === null ? (
                      <span className="boss-sites__dim">{t('boss.sites.missing')}</span>
                    ) : (
                      <a
                        className="boss-link"
                        href={site.entryUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {t('boss.sites.entryOpen')}
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
          {/* 設計稿把「唔顯示在線狀態」呢句放喺卡內底部，因為佢講嘅係
              呢張表本身嘅限制，唔係頁面備註。 */}
          <p className="boss-sites-card__note">{t('boss.sites.footnote')}</p>
        </div>
      )}

      {notice !== null && (
        <p className="boss-note boss-note--error" role="alert">
          {notice}
        </p>
      )}

      <p className="boss-sites__footnote">{t('boss.sites.entryNote')}</p>
    </>
  );
}
