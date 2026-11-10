import { useCallback, useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import {
  claimNeed,
  fetchNeeds,
  type NeedCounts,
  type NeedFilter,
  type NeedItem,
  type PublicUser,
} from '../api';
import { FrameApps, useSharedNeeds } from '../frame/FrameApps';
import { MAIN_NAV_ROUTE, mainNavItems, type MainNavKey } from '../frame/nav';
import { useFrameChrome } from '../frame/useFrameChrome';
import { navigate } from '../router';
import { NeedsTable } from './NeedsTable';

/**
 * Needs 頁（issue 184）。
 *
 * 三層篩選，各做各的，唔重複：
 *   第二層頁籤  —— 範圍：收件箱（未關閉）／已關閉
 *   內容上方 chips —— 狀態，連同數目
 *   左側欄      —— 來源（app）
 *
 * 為咩唔把「我負責」放上來：後端未有按人篩選的契約，做一個按落去結果一樣的
 * 頁籤就係講大話。等真的做得到才加。
 *
 * 為咩分兩層（`NeedsScreen` 殼 ＋ `NeedsBody` 內容）：數字只有一份，由
 * `FrameApps` 持有，內容經 `useSharedNeeds()` 讀。認領完撳同一個 `reload()`
 * 就同時更新頂欄、右側欄同清單 —— 唔會出現「清單話做完了，頂欄仍然 5」。
 */

type Tab = 'inbox' | 'closed';

// `as const` 令 label 保留字面量型別，t() 才檢查得出打錯的鍵。
const STATUS_CHIPS = [
  { key: 'all', label: 'need.filter.all' },
  { key: 'open', label: 'need.filter.open' },
  { key: 'claimed', label: 'need.filter.claimed' },
  { key: 'uploaded', label: 'need.filter.uploaded' },
  { key: 'absorbed', label: 'need.filter.absorbed' },
] as const satisfies readonly { key: NeedFilter; label: string }[];

/**
 * chip 上的數字。「全部」＝未關閉總數（total 減 closed），唔係 state = open 的數 ——
 * 兩者混淆的話，「全部 3」會少過「待認領 3 ＋ 進行中 2」，一眼就看得出錯。
 */
function chipCount(counts: NeedCounts | null, key: NeedFilter): number {
  if (counts === null) {
    return 0;
  }

  if (key === 'all') {
    return counts.total - counts.closed;
  }

  return counts[key as Exclude<NeedFilter, 'all' | 'overdue'>];
}

type NeedsScreenProps = {
  user: PublicUser;
  onSignedOut: () => void;
};

export function NeedsScreen({ user, onSignedOut }: NeedsScreenProps) {
  const chrome = useFrameChrome();
  const [tab, setTab] = useState<Tab>('inbox');

  return (
    // 呢一頁唔開右側欄：右側欄列出嘅就係下面張表，同一份清單畫兩次只會令人分心。
    <FrameApps
      needsActive
      moduleTabs={mainNavItems(user.role === 'owner')}
      currentModuleTabKey=""
      onSelectModuleTab={(key) => {
        const route = MAIN_NAV_ROUTE[key as MainNavKey];

        if (route !== undefined) {
          navigate(route);
        }
      }}
      theme={chrome.theme}
      onToggleTheme={chrome.onToggleTheme}
      account={{ displayName: user.displayName, signingOut: false }}
      onSignOut={onSignedOut}
      sidebarOpen={chrome.sidebarOpen}
      onToggleSidebar={chrome.onToggleSidebar}
      modulePages={[
        { key: 'inbox', label: t('need.tab.inbox') },
        { key: 'closed', label: t('need.tab.closed') },
      ]}
      currentPageKey={tab}
      onSelectPage={(key) => {
        setTab(key === 'closed' ? 'closed' : 'inbox');
      }}
      breadcrumbs={[t('need.title'), tab === 'closed' ? t('need.tab.closed') : t('need.tab.inbox')]}
      pageTitle={t('need.title')}
      pageSubtitle={t('need.subtitle')}
    >
      <NeedsBody tab={tab} onSelectTab={setTab} />
    </FrameApps>
  );
}

function NeedsBody({ tab, onSelectTab }: { tab: Tab; onSelectTab: (tab: Tab) => void }) {
  const shell = useSharedNeeds();
  const [status, setStatus] = useState<NeedFilter>('all');
  const [items, setItems] = useState<readonly NeedItem[]>([]);
  const [load, setLoad] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const { reload: reloadShell } = shell;

  const reload = useCallback(() => {
    setTick((value) => value + 1);
    reloadShell();
  }, [reloadShell]);

  useEffect(() => {
    let live = true;

    void (async () => {
      const result = await fetchNeeds({ status: tab === 'closed' ? 'closed' : status });

      if (!live) {
        return;
      }

      if (result.ok) {
        setItems(result.data.items);
        setLoad('ready');
      } else {
        setItems([]);
        setLoad('failed');
      }
    })();

    return () => {
      live = false;
    };
  }, [tab, status, tick]);

  async function handleClaim(item: NeedItem): Promise<void> {
    if (claiming !== null) {
      return;
    }

    setClaiming(item.id);
    setNotice(null);

    const result = await claimNeed(item.id);

    setClaiming(null);

    if (result.ok) {
      setNotice(null);
      reload();
      return;
    }

    // 409 有兩種：有人先認領，或者已關閉。兩種都要說得清楚，唔可以合成一句。
    if (result.failure.kind === 'http' && result.failure.status === 409) {
      setNotice(result.failure.error === 'need_closed' ? t('need.claimClosed') : t('need.claimConflict'));
      reload();
      return;
    }

    setNotice(t('need.claimFailed'));
  }

  return (
    <>
      <div className="needs-chips" role="group" aria-label={t('need.title')}>
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            className="needs-chip"
            aria-pressed={status === chip.key && tab === 'inbox'}
            disabled={tab === 'closed' && chip.key !== 'all'}
            onClick={() => {
              onSelectTab('inbox');
              setStatus(chip.key);
            }}
          >
            <span>{t(chip.label)}</span>
            <span className="needs-chip__count">{chipCount(shell.counts, chip.key)}</span>
          </button>
        ))}

        {shell.counts !== null && shell.counts.overdue > 0 && (
          <button
            type="button"
            className="needs-chip needs-chip--quiet"
            aria-pressed={status === 'overdue'}
            onClick={() => {
              onSelectTab('inbox');
              setStatus('overdue');
            }}
          >
            {t('need.filter.overdue', { count: shell.counts.overdue })}
          </button>
        )}
      </div>

      {notice !== null && (
        <p className="needs-notice" role="status">
          {notice}
        </p>
      )}

      <NeedsTable
        state={load}
        items={items}
        emptyLabel={tab === 'closed' ? t('need.emptyClosed') : t('need.empty')}
        expandedId={expanded}
        claiming={claiming}
        onToggle={(id) => {
          setExpanded((current) => (current === id ? null : id));
        }}
        onClaim={(item) => void handleClaim(item)}
      />

      <p className="needs-footnote">{t('need.footnote')}</p>
    </>
  );
}
