/**
 * 測試用的語氣表（issue #65）。
 *
 * 一份齊全的語氣表要三個特質、五個禁用詞、五個情境、五句像五句不像、最難的
 * 一句 —— 逐個字寫會令每個測試都多六十行雜訊，所以集中在這裡。
 *
 * 這一支不是 `.test.ts`，所以不會被當成一個測試檔跑。
 */

import { emptyToneDoc, type ToneDoc, type ToneTrait } from '../../src/design/brandTone';

/** 一個齊全的特質：名、會這樣講、不會這樣講、一句示範。 */
export function fullTrait(name: string): ToneTrait {
  return {
    name,
    do: `${name}：講清楚要對方做甚麼`,
    dont: `${name}：不講「請盡快」這種講了等於無講的話`,
    sentence: `${name}的例子：星期四下午三點前把樣板寄回，唔該。`,
  };
}

/** 有名而沒有示範句 —— 「只有形容詞」。 */
export function adjectiveTrait(name: string): ToneTrait {
  return { name, do: '', dont: '', sentence: '' };
}

/**
 * 一份齊全的語氣表。
 *
 * `like` 與 `unlike` 各五句：少過五句就算未夠，所以「不缺」的底要五句。
 */
export function fullToneDoc(): ToneDoc {
  return {
    ...emptyToneDoc(),
    stance: '我們賣的是可以講清楚的療程，不是神秘感。',
    traits: [fullTrait('直接'), fullTrait('有溫度'), fullTrait('不裝')],
    banned: [
      { term: '賦能', reason: '意思空，讀者不知道得到甚麼' },
      { term: '閉環', reason: '行業術語，客人不會用' },
      { term: '極致', reason: '最高級語，講了等於沒有講' },
    ],
    language_policy: '對外一律繁體中文；療程名保留英文原名，第一次出現時附中文。',
    contexts: {
      explain: '呢個療程分三次做，每次隔兩星期。',
      invite: '下星期三下午有位，你想上午定下午？',
      decline: '呢個做法我們做唔到，但我可以幫你轉介。',
      apologize: '上一次等得太久，是我們排期出錯。',
      incident: '系統今早出問題，你今日的預約我已經改到星期五。',
    },
    samples: {
      like: [
        '三次之後你會見到分別，見不到我們會講清楚為咩。',
        '這個價錢包括覆診，不包括藥費。',
        '你可以先做一次，覺得不合适再算。',
        '星期四三點前寄回就可以趕得上。',
        '我們不保證效果，但保證講清楚每一步。',
      ],
      unlike: [
        '尊貴的客戶，我們致力為您提供極致體驗。',
        '立即預約，名額有限，先到先得！',
        '本診所擁有多年豐富經驗，口碑載道。',
        '百分百有效，無效退款。',
        '專業團隊竭誠為您服務。',
      ],
    },
    hardest_line: {
      wrong: '呢個我們做唔到，你不如去搵第二間。',
      right: '呢個做法我們做唔到，但我可以幫你轉介去處理得更好的地方。',
    },
  };
}

/** 改一條特質，其餘不動。 */
export function withTrait(doc: ToneDoc, index: number, patch: Partial<ToneTrait>): ToneDoc {
  return { ...doc, traits: doc.traits.map((trait, at) => (at === index ? { ...trait, ...patch } : trait)) };
}
