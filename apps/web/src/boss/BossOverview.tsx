import { t } from '@company-os/i18n';
import { useSharedNeeds } from '../frame/FrameApps';
import { useBrands } from '../frame/useDirectory';
import type { SitesState } from './useSites';

/**
 * Boss Portal 總覽。
 *
 * 只讀已經存在的事實：有幾台機已登記、幾台等批准、幾個品牌、幾件未關閉的
 * Needs。刻意**唔**做一個「公司健康分」—— 一個由四條數砌出來的分數，
 * 睇落好科學，但冇人講得出 73 分同 68 分分別代表咩。
 *
 * 讀唔到嘅數字顯示破折號，唔顯示 0：0 係一個結論（真係冇），破折號係
 * 「我唔知」。呢兩件事唔可以混。
 */

type BossOverviewProps = {
  sites: SitesState;
};

function Metric(props: { label: string; value: string }) {
  return (
    <div className="boss-metric">
      <span className="boss-metric__value">{props.value}</span>
      <span className="boss-metric__label">{props.label}</span>
    </div>
  );
}

const UNKNOWN = '—';

export function BossOverview({ sites }: BossOverviewProps) {
  const needs = useSharedNeeds();
  const brands = useBrands(true);

  const sitesReady = sites.kind === 'ready';
  const registered = sitesReady ? sites.items.filter((item) => item.status === 'registered').length : null;
  const pending = sitesReady ? sites.items.filter((item) => item.status === 'pending').length : null;
  const brandCount = brands.state.kind === 'ready' ? brands.state.items.length : null;
  const needsCount =
    needs.counts === null ? null : needs.counts.total - needs.counts.closed;

  const anyUnknown =
    registered === null || pending === null || brandCount === null || needsCount === null;

  return (
    <>
      <div className="boss-metrics">
        <Metric
          label={t('boss.overview.sites')}
          value={registered === null ? UNKNOWN : String(registered)}
        />
        <Metric label={t('boss.overview.pending')} value={pending === null ? UNKNOWN : String(pending)} />
        <Metric
          label={t('boss.overview.brands')}
          value={brandCount === null ? UNKNOWN : String(brandCount)}
        />
        <Metric
          label={t('boss.overview.needs')}
          value={needsCount === null ? UNKNOWN : String(needsCount)}
        />
      </div>

      {anyUnknown && <p className="boss-note">{t('boss.overview.readFailed')}</p>}
    </>
  );
}
