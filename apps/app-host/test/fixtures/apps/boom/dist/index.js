'use strict';

/** registerApi 一呼叫就丟錯：app-host 要帶 app id 與原因以非 0 退出。 */
module.exports = {
  async registerApi() {
    throw new Error('假 app 故意失敗');
  },
};
