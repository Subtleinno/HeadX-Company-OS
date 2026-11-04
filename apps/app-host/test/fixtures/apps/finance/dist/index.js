'use strict';

/** 不需要資料庫的假 app：用來證明 needsDatabase 不寫就完全不會建立連線。 */
module.exports = {
  async registerApi(app, ctx) {
    app.get('/summary', async () => ({
      app: ctx.appId,
      db: ctx.db === null ? 'null' : 'connected',
    }));
  },
};
