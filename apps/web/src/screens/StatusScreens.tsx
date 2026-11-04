export function LoadingScreen() {
  return (
    <main className="screen" aria-busy="true">
      <p className="screen__status">載入中…</p>
    </main>
  );
}

type ConnectionErrorProps = {
  onRetry: () => void;
};

/** 連不到伺服器：不顯示空白頁，也不顯示任何假資料。 */
export function ConnectionErrorScreen({ onRetry }: ConnectionErrorProps) {
  return (
    <main className="screen">
      <section className="card">
        <h1 className="card__title">無法連線到伺服器</h1>
        <p className="card__description">請確認 Company OS 正在運行，然後重試。</p>
        <button type="button" className="button button--primary" onClick={onRetry}>
          重試
        </button>
      </section>
    </main>
  );
}
