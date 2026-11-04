import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildForbiddenRules,
  cruiseOptions,
  discoverLayout,
  mergeLayouts,
} from '../rules.mjs';

/**
 * fixtures 專用設定：規則與正式設定同源（同一個 buildForbiddenRules），
 * 只有「掃哪個根目錄」不同。violations 與 clean 兩組合併讀結構，
 * 因為同一組規則要同時管兩邊。
 */
const here = dirname(fileURLToPath(import.meta.url));
const layout = mergeLayouts(
  discoverLayout(resolve(here, 'violations')),
  discoverLayout(resolve(here, 'clean')),
);

export default {
  forbidden: buildForbiddenRules(layout),
  options: cruiseOptions(),
};
