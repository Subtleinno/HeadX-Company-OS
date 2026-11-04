'use strict';

/**
 * 測試用的假 app。它不引用任何真實程式碼，只示範 app-host 的載入約定：
 *   - 匯出 registerApi(app, ctx)
 *   - needsDatabase: true 代表要 app-host 給它一條專用連線
 *
 * 這個檔案是「已建置」的樣子，等同真實 app 的 dist/index.js，所以刻意寫成 CJS。
 */
module.exports = {
  needsDatabase: true,

  async registerApi(app, ctx) {
    app.get('/summary', async () => ({
      app: ctx.appId,
      db: ctx.db === null ? 'null' : 'connected',
    }));

    // 用 app 自己的連線回答，證明 ctx.db 真的接到那個帳號。
    app.get('/whoami', async () => {
      if (ctx.db === null) {
        throw new Error('sales 需要資料庫，但 ctx.db 是 null');
      }
      const result = await ctx.db.query(
        'select current_user as current_user, current_setting($1) as search_path',
        ['search_path'],
      );
      return result.rows[0];
    });
  },
};
