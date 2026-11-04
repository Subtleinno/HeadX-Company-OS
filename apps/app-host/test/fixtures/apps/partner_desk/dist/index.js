'use strict';

/** exposure 是 partner 的假 app：與 internal 的 app 放在同一個 app-host 應該被拒。 */
module.exports = {
  async registerApi(app, ctx) {
    app.get('/ping', async () => ({ app: ctx.appId }));
  },
};
