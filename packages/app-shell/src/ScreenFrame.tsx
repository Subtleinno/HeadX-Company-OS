import type { ReactNode } from 'react';

/**
 * 卡片式畫面框架：`main.screen` ＋ `section.card` ＋ 標題（＋ 說明）。
 *
 * 登入、首次開機、錯誤畫面本來都是這一個結構，只是各自寫了一次。
 * 這裡只把結構抽出來，標題與說明的文字仍由呼叫端決定（文字來自 i18n）。
 */

type ScreenFrameProps = {
  titleId: string;
  title: string;
  description?: string;
  children: ReactNode;
};

export function ScreenFrame({ titleId, title, description, children }: ScreenFrameProps) {
  return (
    <main className="screen">
      <section className="card" aria-labelledby={titleId}>
        <h1 className="card__title" id={titleId}>
          {title}
        </h1>
        {description !== undefined && <p className="card__description">{description}</p>}
        {children}
      </section>
    </main>
  );
}

/** 只有一句狀態的畫面（載入中）。 */
export function StatusScreen({ busy, status }: { busy: boolean; status: string }) {
  return (
    <main className="screen" aria-busy={busy}>
      <p className="screen__status">{status}</p>
    </main>
  );
}

/** 空狀態：一句話，不放卡片、不放數字、不放圖表。 */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="home__empty">{children}</p>;
}
