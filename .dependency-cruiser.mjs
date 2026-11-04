import { buildForbiddenRules, cruiseOptions, discoverLayout } from './tools/boundaries/rules.mjs';

/**
 * 邊界檢查的正式設定（issue #71）。
 *
 * 規則內容與「有哪些 app／package／模組」都在 tools/boundaries/rules.mjs，
 * 這裡只負責把 repo 現況讀進來。跑法：npm run lint:boundaries。
 */
const layout = discoverLayout(process.cwd());

export default {
  forbidden: buildForbiddenRules(layout),
  options: cruiseOptions(),
};
