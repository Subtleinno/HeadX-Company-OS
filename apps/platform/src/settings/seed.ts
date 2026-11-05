import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_EDITION, isEditionCode, type EditionCode } from '@company-os/edition-profile';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { parseRuleInput, type RuleInput } from './policy.js';
import {
  SETTING_KEYS,
  isSettingKey,
  validateSettingValue,
  type SettingKey,
} from './schema.js';

/**
 * 第一次啟動時填入預設值（issue #80）。
 *
 * 規則只有一條：**絕不覆蓋已存在的值**。
 *
 *   1. 每個設定 key 用 `insert … on conflict do nothing`。老闆改過的值重啟之後仍然是
 *      他改的值 —— 種子檔不是每次啟動都重設一遍的東西。
 *   2. policy_rule 只在整張表（**含已刪除的列**）完全沒有列時才填。用「有沒有列」
 *      而不是「有沒有 key」，因為一組空規則是有意義的狀態（全部需批准），
 *      而「刪光了」也是一個決定，不應該因為重啟又長回來。
 *   3. 只有真的寫入了東西才寫 settings.seed 審計 —— 每次重啟都寫一筆就不是紀錄，
 *      是噪音。
 *
 * 種子檔壞掉（缺 key、值不合法、JSON 壞）一律大聲失敗並拒絕啟動：帶著一份不完整的
 * 設定開機，等於讓之後的每一個判斷都用一個沒人決定了的值。
 *
 * edition 與 install_code 屬「安裝時決定」，來自環境變數而不是 profile 檔：
 * 同一個 profile 可以裝成兩個版本，版本是那一台機器的屬性。
 */

export const DEFAULT_PROFILE_DIR = '/app/profiles/default';

const EDITION_ENV = 'EDITION';
const INSTALL_CODE_ENV = 'INSTALL_CODE';

/**
 * 由安裝環境算出來的 key，不由 profile 檔提供：
 * edition 來自 EDITION、install_code 來自 INSTALL_CODE、company_locale 由 edition 決定。
 * 同一個 profile 裝成兩個版本時，這三個值不同是應該的 —— 它們是那一台機器的屬性。
 */
const INSTALL_KEYS: readonly SettingKey[] = ['edition', 'install_code', 'company_locale'];

/** profile 檔要提供的設定 key：安裝時決定的三個之外的全部。 */
const PROFILE_KEYS: readonly SettingKey[] = SETTING_KEYS.filter((key) => !INSTALL_KEYS.includes(key));

export type SeedLogger = (message: string) => void;

export type SeedInput = {
  pool: Pool;
  /** 種子檔所在資料夾；映像內預設 /app/profiles/default。 */
  profileDir: string;
  /** 讀環境變數（EDITION、INSTALL_CODE）。測試直接傳物件。 */
  env: Record<string, string | undefined>;
  log?: SeedLogger;
};

export type SeedResult = {
  /** 這次真的寫入的設定 key（已存在的會跳過，不會出現在這裡）。 */
  seededKeys: SettingKey[];
  /** 這次真的寫入的政策規則數量。 */
  seededRules: number;
};

export type SettingSeed = {
  key: SettingKey;
  value: unknown;
};

type ProfileSetting = { key: SettingKey; value: unknown };

type ProfileRule = RuleInput;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readEnvString(env: Record<string, string | undefined>, name: string): string | undefined {
  const raw = env[name];

  if (raw === undefined || raw === '') {
    return undefined;
  }

  return raw;
}

function readEdition(env: Record<string, string | undefined>): EditionCode {
  const raw = readEnvString(env, EDITION_ENV);

  if (raw === undefined) {
    return DEFAULT_EDITION;
  }

  if (!isEditionCode(raw)) {
    // 靜靜當成 intl 會讓一台「本來要裝大陸版」的機器用國際版設定跑起來。
    throw new Error(
      `環境變數 ${EDITION_ENV} 的值不合法：${JSON.stringify(raw)}（只可以是 intl 或 cn）`,
    );
  }

  return raw;
}

function readInstallCode(env: Record<string, string | undefined>): string | null {
  const raw = readEnvString(env, INSTALL_CODE_ENV);

  if (raw === undefined) {
    return null;
  }

  const result = validateSettingValue('install_code', raw);

  if (!result.ok) {
    throw new Error(`環境變數 ${INSTALL_CODE_ENV} 的值不合法：${result.reason}`);
  }

  return raw;
}

/** 安裝時決定的三個值：edition、install_code（可能沒有）、company_locale。 */
export function installDefaults(env: Record<string, string | undefined>): SettingSeed[] {
  const edition = readEdition(env);
  const installCode = readInstallCode(env);

  const seeds: SettingSeed[] = [
    { key: 'edition', value: edition },
    { key: 'company_locale', value: edition === 'cn' ? 'zh-CN' : 'zh-HK' },
  ];

  if (installCode !== null) {
    seeds.push({ key: 'install_code', value: installCode });
  }

  return seeds;
}

/**
 * 把 profile 檔的內容驗成「可以寫進資料庫的一組值」。
 * 與 API 寫入用同一個驗證器，所以不會出現「種子填得進去、API 卻拒絕」的兩套標準。
 */
export function profileSettings(raw: unknown, edition: EditionCode): ProfileSetting[] {
  if (!isRecord(raw)) {
    throw new Error('settings.json 必須是一個物件（key 對值）');
  }

  const parsed: ProfileSetting[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (!isSettingKey(key)) {
      throw new Error(`settings.json 有未知的設定 key：${key}`);
    }

    if (INSTALL_KEYS.includes(key)) {
      const source =
        key === 'edition'
          ? `環境變數 ${EDITION_ENV}`
          : key === 'install_code'
            ? `環境變數 ${INSTALL_CODE_ENV}`
            : `edition 的預設語系（${EDITION_ENV}）`;

      throw new Error(`settings.json 不可以設定 ${key}：它由 ${source} 決定，不是 profile 的預設值`);
    }

    const result = validateSettingValue(key, value, { edition });

    if (!result.ok) {
      throw new Error(`settings.json 的 ${key} 不合法：${result.reason}`);
    }

    parsed.push({ key, value: result.value });
  }

  const missing = PROFILE_KEYS.filter((key) => !parsed.some((item) => item.key === key));

  if (missing.length > 0) {
    throw new Error(`settings.json 缺少這些設定：${missing.join('、')}`);
  }

  return parsed;
}

/**
 * 政策規則的種子：用與 API 完全同一支解析器，所以種子填得進去的東西，API 也一定收。
 * 兩邊各寫一份驗證就一定會有一天不一致。
 */
export function profileRules(raw: unknown): ProfileRule[] {
  if (!Array.isArray(raw)) {
    throw new Error('policy-rules.json 必須是一個陣列');
  }

  return raw.map((item, index) => {
    const parsed = parseRuleInput(item);

    if (parsed.errors.length > 0) {
      throw new Error(`policy-rules.json[${index}] 不合法：${parsed.errors.join('；')}`);
    }

    return parsed.value as RuleInput;
  });
}

async function readJson(file: string): Promise<unknown> {
  const text = await readFile(file, 'utf8');

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${file} 不是有效的 JSON`);
  }
}

/**
 * 讀種子檔並驗證。回傳的值可以直接寫進資料庫。
 * 檔案不存在、JSON 壞掉、key 不對、值不合法，全部拋錯。
 */
export async function loadProfile(
  profileDir: string,
  env: Record<string, string | undefined>,
): Promise<{ settings: SettingSeed[]; rules: ProfileRule[] }> {
  const edition = readEdition(env);
  const settingsFile = join(profileDir, 'settings.json');
  const rulesFile = join(profileDir, 'policy-rules.json');

  const settings = profileSettings(await readJson(settingsFile), edition);
  const rules = profileRules(await readJson(rulesFile));

  return { settings: [...installDefaults(env), ...settings], rules };
}

/**
 * 填入預設值。整個過程在一個交易之內：任何一筆失敗都全部回滾，
 * 不會留下「填了一半」的設定。
 */
export async function seedSettings(input: SeedInput): Promise<SeedResult> {
  const log = input.log ?? ((): void => undefined);
  const profile = await loadProfile(input.profileDir, input.env);

  const client = await input.pool.connect();

  try {
    await client.query('begin');

    const seededKeys: SettingKey[] = [];

    for (const seed of profile.settings) {
      // on conflict do nothing：已存在的值一個字都不動。
      const inserted = await client.query<{ key: string }>(
        `insert into company_setting (key, value) values ($1, $2::jsonb)
         on conflict (key) do nothing
         returning key`,
        [seed.key, JSON.stringify(seed.value)],
      );

      if (inserted.rows.length > 0) {
        seededKeys.push(seed.key);
      }
    }

    // 「有沒有列」要看整張表，**包括已刪除的列**：刪光也是一個決定，重啟不應該讓它長回來。
    const existing = await client.query<{ count: string }>('select count(*)::text as count from policy_rule');
    const ruleCount = Number(existing.rows[0]?.count ?? '0');
    let seededRules = 0;

    if (ruleCount === 0) {
      for (const rule of profile.rules) {
        await client.query(
          `insert into policy_rule (domain, condition, action, priority, enabled, note, created_by)
           values ($1, $2::jsonb, $3, $4, $5, $6, null)`,
          [
            rule.domain,
            JSON.stringify(rule.condition),
            rule.action,
            rule.priority,
            rule.enabled,
            rule.note,
          ],
        );
        seededRules += 1;
      }
    }

    if (seededKeys.length > 0 || seededRules > 0) {
      await writeAudit(client, {
        actorType: 'system',
        actorId: 'settings-seed',
        action: 'settings.seed',
        detail: { keys: seededKeys, policyRules: seededRules },
      });
    }

    await client.query('commit');

    if (seededKeys.length > 0 || seededRules > 0) {
      log(`已填入預設設定 ${seededKeys.length} 項、政策規則 ${seededRules} 條`);
    }

    return { seededKeys, seededRules };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
