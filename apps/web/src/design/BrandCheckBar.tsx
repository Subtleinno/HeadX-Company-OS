import { useState } from 'react';
import { t } from '@company-os/i18n';
import type { BrandCheckItem } from '../api';
import type { BrandCheckResult } from './useBrandCheck';

/**
 * 檢查摘要條（issue #59）。
 *
 * 三個數字一起出（通過、不通過、無法判斷），因為單看「不通過 0」會令人以為
 * 全部合格 —— 有可能是「有一半規則連量都量不到」。這一條就是為了擋住那種誤讀。
 *
 * 明細逐條列：規則 id、結果、位置、怎樣改。無法判斷的一條連到缺口（缺口才是
 * 「交回誰去補」的地方），不通過的一條只講怎樣改 —— 不通過不是缺資料，是
 * 做錯了，開一張工單不會令它變對。
 *
 * 診斷不到的報告（後端未跑通）講「檢查未跑到；這不代表合格」，不畫一個
 * 綠色的 0。
 */

export type BrandCheckBarProps = {
  check: BrandCheckResult;
  onOpenGaps: () => void;
};

function stateLabel(state: BrandCheckItem['state']): string {
  if (state === 'pass') {
    return t('brand.check.state.pass');
  }

  return state === 'fail' ? t('brand.check.state.fail') : t('brand.check.state.undetermined');
}

export function BrandCheckBar({ check, onOpenGaps }: BrandCheckBarProps) {
  const [open, setOpen] = useState(false);

  if (check.state === 'loading' || check.state === 'idle') {
    return (
      <p className="brand-check brand-check--waiting" data-brand-check="loading">
        {t('brand.check.loading')}
      </p>
    );
  }

  if (check.state === 'failed') {
    return (
      <div className="brand-check brand-check--failed" data-brand-check="failed" role="status">
        <p className="brand-check__failed">{t('brand.check.failed')}</p>
        <button type="button" className="brand-check__toggle" onClick={check.reload}>
          {t('brand.check.retry')}
        </button>
      </div>
    );
  }

  // 自定義頁沒有專屬規則：不畫一條「通過 0 不通過 0」的空條，因為那看起來
  // 與「檢查過而全部合格」一樣。講清楚「沒有可以機械檢查的規則」。
  if (check.items.length === 0) {
    return (
      <p className="brand-check brand-check--none" data-brand-check="none">
        {t('brand.check.customNone')}
      </p>
    );
  }

  const { summary, headline } = check;

  return (
    <section className="brand-check" data-brand-check="ready" aria-label={t('brand.check.title')}>
      <div className="brand-check__bar">
        <span className="brand-check__count" data-check-count="pass">
          {t('brand.check.pass', { count: summary.pass })}
        </span>
        <span
          className="brand-check__count brand-check__count--fail"
          data-check-count="fail"
          data-nonzero={summary.fail > 0 ? 'true' : 'false'}
        >
          {t('brand.check.fail', { count: summary.fail })}
        </span>
        <span
          className="brand-check__count brand-check__count--undetermined"
          data-check-count="undetermined"
        >
          {t('brand.check.undetermined', { count: summary.undetermined })}
        </span>

        {headline !== null && (
          <p className="brand-check__headline" data-check-headline={headline.ruleId}>
            {headline.detail}
          </p>
        )}

        <button
          type="button"
          className="brand-check__toggle"
          data-check-details
          aria-expanded={open}
          onClick={() => {
            setOpen((value) => !value);
          }}
        >
          {open ? t('brand.check.hideDetails') : t('brand.check.details')}
        </button>
      </div>

      {open && (
        <ul className="brand-check__list" data-check-list>
          {check.items.map((item) => (
            <li
              className="brand-check__row"
              key={item.ruleId}
              data-check-row={item.ruleId}
              data-check-state={item.state}
            >
              <code className="brand-check__rule">{item.ruleId}</code>
              <span className={`brand-check__state brand-check__state--${item.state}`}>
                {stateLabel(item.state)}
              </span>
              <span className="brand-check__where">{item.location}</span>
              <span className="brand-check__detail">{item.detail}</span>

              {item.fix !== '' && (
                <span className="brand-check__fix">
                  {t('brand.check.fix')}：{item.fix}
                </span>
              )}

              {item.state === 'undetermined' && (
                <button
                  type="button"
                  className="brand-check__gapLink"
                  data-check-to-gap={item.ruleId}
                  onClick={onOpenGaps}
                >
                  {t('brand.check.toGap')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="brand-check__reason">{t('brand.check.reason')}</p>
    </section>
  );
}

/**
 * 不通過的橫幅：放在內容上方，講清規則 id、位置與怎樣改。
 *
 * 只畫第一條不通過的 —— 其餘在明細裡。一次過列出五條只會令人不知由哪一條
 * 開始；而「有不通過」這件事本身，橫幅已經講得夠清楚。
 *
 * 橫幅不帶「建立 Need」：不通過不是缺資料，是做錯了 —— 開一張工單不會令它
 * 變對。它的出口是上面那張明細，明細帶「怎樣改」。
 */
export function BrandCheckBanner({ check }: { check: BrandCheckResult }) {
  const first = check.items.find((item) => item.state === 'fail');

  if (check.state !== 'ready' || first === undefined) {
    return null;
  }

  return (
    <div className="brand-banner" data-brand-banner={first.ruleId} role="alert">
      <span className="brand-banner__tag">{t('brand.check.bannerTag')}</span>
      <div className="brand-banner__body">
        <p className="brand-banner__line">
          <code className="brand-check__rule">{first.ruleId}</code>
          {' · '}
          {first.location}
          {' — '}
          {first.detail}
        </p>
        {first.fix !== '' && (
          <p className="brand-banner__fix">
            {t('brand.check.fix')}：{first.fix}
          </p>
        )}
      </div>
    </div>
  );
}
