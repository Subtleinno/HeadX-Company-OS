#!/usr/bin/env node
/**
 * 選項圖生成器：把「看得見的選項」變成示意圖。
 *
 * 圖跟源碼走 —— 生成結果直接寫入
 * `apps/platform/assets/brand-options/<stage>/<dimension>/<optId>.webp`，跟其他源碼
 * 一齊 commit。
 *
 * 為什麼是 WebP：同一張圖 PNG 要 240KB、WebP q90 只要 40KB（細顆粒那幾張
 * 513KB → 104KB），而材質卡一開就是 42 張 —— 10MB 與 2MB 的分別。生成時就轉，
 * 不留 PNG 中間檔。需要 `cwebp`（brew install webp），這是生成時的工具，
 * 執行期只讀檔，不影響部署。不進 DB、不進 MinIO：選項庫是系統的一部分，圖也是；放物件儲存的話，
 * 新環境一裝就沒有圖，而「沒有圖」與「生成失敗」在畫面上長得一樣。
 *
 * 為什麼要分 dimension 一層：
 *   同一個 stage 內 `opt_id` 會跨維度重複（stage2 的 `ceramic` 同時是「材質」與
 *   「表面」），平放一層會靜靜蓋掉前一張，而畫面完全正常 —— 只是圖錯了。
 *
 * 為什麼是腳本而不是 app 裡按一下：
 *   一張圖要 10–20 秒、要走內網 ComfyUI。這種事不該綁在 HTTP 請求上。
 *   跑一次補一批，之後畫面只是讀檔。
 *
 * 用法：
 *   node scripts/gen-option-images.mjs --stage stage2 --dimension material
 *   node scripts/gen-option-images.mjs --stage stage2 --dimension tactile,surface,light
 *   node scripts/gen-option-images.mjs --stage stage2 --dimension material --limit 5 --force
 *   node scripts/gen-option-images.mjs --stage stage4b --dimension processes --dry-run
 *   node scripts/gen-option-images.mjs --stage stage2 --dimension atmosphere --opt deepnight --force --offset 1
 *
 * 不帶 --dimension 時，自動生成該 stage 所有「需要圖」的維度（見 TEMPLATE_OF）。
 * --opt 只重生一個選項；同一張 Prompt 不對時用 --offset 1 換一組 seed 再試。
 *
 * 已經有檔案的選項會跳過（--force 才重生），所以可以隨時中斷再跑。
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client as PgClient } from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'apps', 'platform', 'assets', 'brand-options');

/** WebP 品質。90 是這批圖的實測甜點：細顆粒仍然清楚，體積是 PNG 的 1/5。 */
const WEBP_QUALITY = '90';

/* ── .env ─────────────────────────────────────────────── */

async function loadEnv() {
  const text = await readFile(join(ROOT, '.env'), 'utf8');
  const env = {};

  for (const line of text.split('\n')) {
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const eq = trimmed.indexOf('=');

    if (eq === -1) {
      continue;
    }

    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }

  return env;
}

/* ── prompt 範本 ──────────────────────────────────────── */

/**
 * 「零文字」是硬規則：品牌卡是給人看味道的，圖上出現任何字母／數字／標誌，
 * 都會被讀成品牌訊息，而那個訊息不是老闆決定的。
 */
const NO_TEXT = '畫面不得出現任何文字、字母、數字、商標、標誌、水印或包裝標籤。';

/** 描述自帶句號時不要再補一個（「。。」會被讀成停頓兩次）。 */
const sentence = (text) => String(text ?? '').trim().replace(/[。.]+$/, '');

/**
 * 同一組圖要有同一個「主角」，否則每張各自精彩，放在一起看不成一套：
 * 鏡位、構圖、打光、情緒四組共用同一個靜物場景；3D 三組共用同一個物件。
 */
const STILL = '木桌上的一只素色陶瓷杯、一條亞麻布與一小枝乾枝';
const OBJECT =
  '一個圓角長方形的素色小物件（約 8 公分見方），單獨放置、畫面中不出現人手，' +
  '表面沒有任何螢幕內容、按鍵符號或標誌';

const TEMPLATES = {
  /**
   * 實物材質：一塊平整的方形樣本磚，置中、45 度俯視。
   *
   * 形狀寫死（方形薄片）而不是任由模型發揮：一組幾十張放在一起看的時候，
   * 「同一套樣本」比「每張都漂亮但形狀各異」有用得多。
   */
  tile: (o) =>
    `${o.zh}（${o.id.replace(/_/g, ' ')}）的實物材質樣本磚特寫。${sentence(o.desc)}。` +
    `一塊平整的方形樣本薄片、約 8 公分見方，單獨放置、畫面中不出現人手，` +
    `置於中性淺灰背景正中，45 度俯視，` +
    `攝影棚柔光均勻照明，表面質感、光澤與紋理清晰可辨，超寫實攝影，4:3 構圖。${NO_TEXT}`,

  /** 觸感：不看整塊磚，看表面那一層微觀起伏。 */
  tactile: (o) =>
    `${o.zh}觸感的極近距離特寫。${sentence(o.desc)}。` +
    `畫面被單一表面質感填滿，沒有物件輪廓，側光掠過令凹凸起伏清楚可見，` +
    `看得出摸上去會是怎樣，微距攝影、超寫實，4:3 構圖。${NO_TEXT}`,

  /** 紙材：一疊紙的側面加上最上面那張的表面。 */
  paper: (o) =>
    `${o.zh}的紙張樣本特寫。${sentence(o.desc)}。` +
    `一小疊同款紙張整齊疊放、微微錯開露出紙邊厚度，最上面一張平放展示表面紋理，` +
    `中性淺灰背景，攝影棚柔光，看得出紙的纖維、塗佈與厚度，超寫實攝影，4:3 構圖。${NO_TEXT}`,

  /** 印刷工藝：看的是「加了什麼」—— 反光、凹痕、厚度。 */
  print: (o) =>
    `${o.zh}的印刷工藝樣本特寫。${sentence(o.desc)}。` +
    `一張米白色厚卡紙斜放於中性淺灰背景，卡面只有一塊抽象的幾何圖形（圓形與長條）用來展示工藝效果，` +
    `以側光顯示工藝帶來的反光、凹痕或油墨厚度，微距攝影、超寫實，4:3 構圖。${NO_TEXT}`,

  /** 圖案連續：看的是單元之間的排列關係。 */
  pattern: (o) =>
    `${o.zh}的無縫圖案平鋪示意。${sentence(o.desc)}。` +
    `以同一個簡單抽象單元（細小的圓點與短弧線）重複排列成平面圖案，` +
    `正上方俯視、無透視、填滿畫面，看得出單元之間的間距與錯位關係，` +
    `圖案線條與底色要有明顯可見的對比，不能近乎空白，低對比淺色調、平面設計稿質感，4:3 構圖。${NO_TEXT}`,

  /** 層次與陰影：白色方塊浮在淺灰背景，唯一變數是陰影。 */
  shadow: (o) =>
    `${o.zh}的陰影層次示意。${sentence(o.desc)}。` +
    `一個純白色圓角方塊平放於均勻淺灰背景上，以${o.zh}的方式投影，` +
    `乾淨的產品攝影、正上方略偏 15 度俯視，重點在陰影的邊緣、深度與擴散，4:3 構圖。${NO_TEXT}`,

  /** 光線與氛圍：抽象的色光研究，不要具體物件。 */
  atmosphere: (o) =>
    `${o.zh}的光線與色彩氛圍研究。${sentence(o.desc)}。` +
    `以可見的場景、材質表面或光影呈現，柔和過渡、無人物，氛圍攝影或抽象光影圖，4:3 構圖。${NO_TEXT}`,

  /** 影像風格：同一個靜物，用不同攝影語言拍。 */
  photoStyle: (o) =>
    `${o.zh}的攝影風格示例。${sentence(o.desc)}。` +
    `靜物場景：${STILL}。以${o.zh}的方式拍攝這組靜物，` +
    `風格特徵要一眼看得出，4:3 構圖。${NO_TEXT}`,

  /** 鏡位／構圖：同一個靜物，不同取景。 */
  frame: (o) =>
    `${o.zh}的畫面取景示例。${sentence(o.desc)}。` +
    `靜物場景：${STILL}。以${o.zh}的方式安排主體位置、景別與視角，` +
    `電影感單幀劇照、淺景深、自然光，4:3 構圖。${NO_TEXT}`,

  /** 打光：同一個靜物，換光源。 */
  litSubject: (o) =>
    `${o.zh}的打光示例。${sentence(o.desc)}。` +
    `靜物場景：${STILL}。以${o.zh}的方式打光，光源方向、色溫與陰影濃淡要清楚可辨，` +
    `電影感單幀劇照，4:3 構圖。${NO_TEXT}`,

  /** 材質球：3D 材質的標準呈現方式。 */
  sphere: (o) =>
    `${o.zh}的 3D 材質球。${sentence(o.desc)}。` +
    `一顆正圓球體置於中性淺灰背景正中，柔和的攝影棚環境光，` +
    `ACES 色調映射、物理正確渲染，看得出材質的粗糙度、金屬度與高光形狀，4:3 構圖。${NO_TEXT}`,

  /** 3D 風格：同一個物件，不同渲染語言。 */
  renderStyle: (o) =>
    `${o.zh}的 3D 渲染風格。${sentence(o.desc)}。` +
    `主角：${OBJECT}，置於中性淺灰背景正中、三分之二側視角，` +
    `以${o.zh}的方式渲染這個物件，風格特徵要一眼看得出，4:3 構圖。${NO_TEXT}`,

  /** 產品外觀：形體語言。 */
  product: (o) =>
    `${o.zh}的產品外觀示例。${sentence(o.desc)}。` +
    `主角：${OBJECT}，置於中性淺灰背景正中、三分之二側視角，` +
    `以${o.zh}的形體語言設計這個物件，工業設計渲染、乾淨的攝影棚光，4:3 構圖。${NO_TEXT}`,

  /** 3D 場景：物件所處的空間。 */
  scene: (o) =>
    `${o.zh}的 3D 場景示例。${sentence(o.desc)}。` +
    `主角：${OBJECT}，置於以${o.zh}方式佈置的空間中，` +
    `構圖看得出環境與物件的比例關係，物理正確渲染，4:3 構圖。${NO_TEXT}`,

  /** 運鏡：靜止的一幀，用取景與動態暗示帶出鏡頭運動。 */
  camera: (o) =>
    `${o.zh}的運鏡取景示例。${sentence(o.desc)}。` +
    `主角：${OBJECT}，置於中性環境中，` +
    `以能暗示「${o.zh}」的視角與取景呈現（主體比例、背景壓縮與邊緣動態暗示），` +
    `電影感單幀、3D 渲染，4:3 構圖。${NO_TEXT}`,

  /** 介面元件：一張乾淨卡片，唯一變數是那个元件的外觀。 */
  uiCard: (o) =>
    `${o.zh}的介面元件示意。${sentence(o.desc)}。` +
    `純白背景上一個放大特寫的圓角卡片，卡片內有三條深灰圓角長條代表文字（不可讀）與一個深灰圓形圖示；` +
    `線條與填色用深灰與清楚的色彩，對比強烈，「${o.zh}」的差異要一眼看出，不是淡灰小圖，` +
    `平面設計稿、正上方俯視，4:3 構圖。${NO_TEXT}`,

  /** 版面／模板：灰階線框，只看結構，不看內容。 */
  layout: (o) =>
    `${o.zh}的版面結構示意。${sentence(o.desc)}。` +
    `一張白色畫布上用深灰實心長條、深灰色塊與清楚的線框排出「${o.zh}」的版面，` +
    `全部內容只能是沒有文字的灰色幾何佔位塊；不可以畫出任何真實平台畫面、品牌標誌或可讀文字。` +
    `對比強烈、不是淡灰小圖，正上方俯視、平面設計稿質感，4:3 構圖。${NO_TEXT}`,

  /** 色票／配色：精確色塊，不用實物照片（照片會偏色）。 */
  swatch: (o) =>
    `${o.zh}的配色示意。${sentence(o.desc)}。` +
    `四到五個大色塊並排組成乾淨的色票畫面，色塊比例與明度清楚表現「${o.zh}」，` +
    `純平面色塊、正上方俯視、邊緣銳利，4:3 構圖。${NO_TEXT}`,

  /** 標誌：只用幾何記號，不寫任何品牌名。 */
  mark: (o) =>
    `${o.zh}的標誌造型示意。${sentence(o.desc)}。` +
    `白色背景中央一組抽象幾何記號（圓、方、線條、負空間）示範「${o.zh}」的造型語言，` +
    `不出現任何字母、中文字或完整字，極簡標誌設計稿、黑色單色、正上方俯視，4:3 構圖。${NO_TEXT}`,

  /** 字體性格：抽象字形標本，不出現可讀單字。 */
  glyph: (o) =>
    `${o.zh}的字體性格標本。${sentence(o.desc)}。` +
    `白紙上兩行放大的抽象筆畫與字形片段，筆畫特徵清楚表現「${o.zh}」，` +
    `每一筆都是不成字的幾何筆畫片段，不可讀出任何完整中文字或英文單字，` +
    `黑色單色、平面排版標本、正上方俯視，4:3 構圖。${NO_TEXT}`,

  /** 空間：無人的室內攝影，看材料、光線與佈局。 */
  interior: (o) =>
    `${o.zh}的室內空間示例。${sentence(o.desc)}。` +
    `一間空無一人的室內空間，以「${o.zh}」的方式選擇材料、光線與家具，` +
    `建築攝影、自然視角、單色調不過度飽和，4:3 構圖。${NO_TEXT}`,

  /** 聲音：把音色／節奏畫成波形，不用文字與樂器名牌。 */
  sound: (o) =>
    `${o.zh}的聲音質感示意。${sentence(o.desc)}。` +
    `深色背景上的抽象波形與光暈，線條密度、快慢與軟硬清楚表現「${o.zh}」，` +
    `極簡聲音視覺化、平面圖形、4:3 構圖。${NO_TEXT}`,

  /** 影像風格：人物場合用 generality 鏡頭，不看見可辨識面孔。 */
  cinema: (o) =>
    `${o.zh}的影片畫面示例。${sentence(o.desc)}。` +
    `以「${o.zh}」的方式呈現一個日常場景（人物只作背影或側影，避免可辨識面孔），` +
    `電影感單幀、自然光，4:3 構圖。${NO_TEXT}`,

  /** 程序：工廠／測試／加工的實景，只看動作。 */
  process: (o) =>
    `${o.zh}的製造或測試程序示例。${sentence(o.desc)}。` +
    `一張程序實景照片，工具、材料與動作清楚表現「${o.zh}」，` +
    `攝影棚或工廠柔光、超寫實攝影，4:3 構圖；畫面中不出現文字與標示，人手可以出現。${NO_TEXT}`,

  /** 吉祥物：角色造型本身就是要看的东西。 */
  character: (o) =>
    `${o.zh}的角色造型示例。${sentence(o.desc)}。` +
    `一隻簡潔的品牌形象角色立於純色背景正中，造型特徵清楚表現「${o.zh}」，` +
    `3D 角色渲染、柔和攝影棚光，4:3 構圖。${NO_TEXT}`,

  /** 抽象示意：幾何關係圖，給制度／結構類選項用。 */
  diagram: (o) =>
    `${o.zh}的結構示意。${sentence(o.desc)}。` +
    `以幾個深灰色的圓角方塊、圓形與清楚的細線排出「${o.zh}」的關係，` +
    `對比強烈、不是淡灰小圖，動作方向用粗箭頭或拖影表示，` +
    `極簡平面示意圖、正上方俯視、白色背景，4:3 構圖。${NO_TEXT}`,
};

/** dimension → 圖種。沒有列出的維度就是不生成（見 docs/product/BRAND-OPTION-IMAGES.md）。 */
const TEMPLATE_OF = {
  calm_energy: 'atmosphere',
  precise_warm: 'atmosphere',
  premium_access: 'atmosphere',
  quiet_bold: 'atmosphere',
  simple_deep: 'atmosphere',
  trad_modern: 'atmosphere',
  local_global: 'atmosphere',
  authority_friend: 'atmosphere',

  material: 'tile',
  surface: 'tile',
  tactile: 'tactile',
  substrates: 'paper',
  processes: 'print',
  repeat: 'pattern',
  elevation: 'shadow',
  light: 'atmosphere',
  atmosphere: 'atmosphere',
  mood: 'atmosphere',
  imagery: 'photoStyle',
  shot: 'frame',
  composition: 'frame',
  lighting: 'litSubject',
  mat3d: 'sphere',
  finish: 'sphere',
  style3d: 'renderStyle',
  appearance: 'product',
  scene3d: 'scene',
  cam3d: 'camera',
  light3d: 'litSubject',

  // 第二輪：其餘「用講的講不清楚」的維度
  border: 'uiCard',
  contrast: 'uiCard',
  density: 'layout',
  radius: 'uiCard',
  transparency: 'uiCard',
  motion: 'diagram',
  colorRules: 'swatch',
  colorStyle: 'swatch',
  colorways: 'swatch',
  cRatio: 'swatch',
  cStatus: 'swatch',
  cChroma: 'swatch',
  cNeutral: 'swatch',
  cContrast: 'swatch',
  cDark: 'swatch',
  clearSpace: 'mark',
  compareTouch: 'layout',
  logoStyle: 'mark',
  logoType: 'mark',
  logoVariants: 'mark',
  langLockup: 'mark',
  typePers: 'glyph',
  tyBase: 'glyph',
  tyLhCjk: 'glyph',
  tyMeasure: 'glyph',
  tyScale: 'glyph',
  tyWeights: 'glyph',
  d_auth: 'atmosphere',
  d_craft: 'atmosphere',
  d_logic: 'atmosphere',
  d_quiet: 'atmosphere',
  d_refined: 'atmosphere',
  d_trad: 'atmosphere',

  borderColor: 'uiCard',
  borderStyle: 'uiCard',
  borderWidth: 'uiCard',
  colorOut: 'swatch',
  fillOpacity: 'uiCard',
  fillStates: 'uiCard',
  fillType: 'uiCard',
  focusRing: 'uiCard',
  gradFallback: 'swatch',
  gradStops: 'swatch',
  gradType: 'swatch',
  gradUse: 'swatch',
  patContrast: 'pattern',
  patDensity: 'pattern',
  patFill: 'pattern',
  patMotif: 'pattern',
  radiusScale: 'uiCard',
  shapeKit: 'diagram',
  texBlend: 'tactile',
  texSpec: 'tactile',

  animStyle: 'diagram',
  capStyle: 'cinema',
  editStyle: 'cinema',
  gradMotion: 'diagram',
  instrument: 'sound',
  motionRole: 'diagram',
  motionScale: 'diagram',
  motionStyle: 'diagram',
  motionUse: 'diagram',
  musicStyle: 'sound',
  perform: 'cinema',
  rhythm: 'sound',
  storyStyle: 'cinema',
  timbre: 'sound',
  uiSound: 'sound',
  videoFormat: 'layout',
  videoStyle: 'cinema',
  voice: 'sound',
  soundEl: 'sound',
  silence: 'sound',

  anim3d: 'diagram',
  bgKind: 'scene',
  delivery3d: 'diagram',
  displayAnim: 'diagram',
  lens: 'frame',
  lightBox: 'litSubject',
  mascot: 'character',
  mfg: 'process',
  parts: 'diagram',
  powerType: 'diagram',
  prodMat: 'sphere',
  proto: 'process',
  protoStage: 'process',
  quality3d: 'renderStyle',
  reduced3d: 'diagram',
  sizeClass: 'product',
  turntable: 'diagram',
  usage: 'scene',
  spaceAccess: 'interior',

  cctPolicy: 'interior',
  cleanPolicy: 'interior',
  crowdPolicy: 'interior',
  errorPattern: 'uiCard',
  focusPolicy: 'uiCard',
  iconStyle: 'diagram',
  interiorStyle: 'interior',
  labelPos: 'uiCard',
  navPattern: 'layout',
  serviceMoments: 'cinema',
  spaceLight: 'interior',
  spaceMat: 'interior',
  spaceSensory: 'interior',
  spaceType: 'interior',
  targetPolicy: 'uiCard',
  themeMode: 'uiCard',
  touchpoints: 'layout',
  uiStates: 'uiCard',
  uiStyle: 'uiCard',
  uxPattern: 'layout',
  wayfinding: 'interior',
  zones: 'interior',
  a11yTarget: 'uiCard',
  signageLang: 'mark',

  adFormats: 'layout',
  adGoal: 'diagram',
  channels: 'layout',
  claimTypes: 'layout',
  copyFramework: 'diagram',
  ctas: 'uiCard',
  ctaStyle: 'uiCard',
  disclosures: 'layout',
  emojiPolicy: 'layout',
  funnel: 'diagram',
  headlineScale: 'layout',
  hooks: 'layout',
  kpis: 'diagram',
  logoPos: 'layout',
  patOverlay: 'layout',
  pillars: 'layout',
  reviewFlow: 'diagram',
  safeMargin: 'layout',
  slides: 'layout',
  targeting: 'diagram',
  templateTypes: 'layout',
  tplAlign: 'layout',
  tplBg: 'swatch',

  modelTypes: 'diagram',
  libTypes: 'diagram',
  useCases: 'diagram',
  refTypes: 'diagram',
  reviewLevel: 'diagram',
  aiPolicy: 'diagram',
  seedPolicy: 'diagram',
};

/**
 * 逐個選項的「視覺翻譯」。
 *
 * 鏡頭運動（橫搖、急搖、手持…）本身在靜止的一幀裡不存在，只寫「以橫搖的方式
 * 取景」模型會畫出一張普通照片，看不出分別。這裡把每個運動翻譯成看得見的東西：
 * 拖影方向、主體比例、透視壓縮、視角高低。
 */
const VISUAL_HINT = {
  // stage4c 鏡位
  'shot/sh_fix': '固定機位、構圖完全靜止清晰，無任何動態模糊',
  'shot/sh_push': '主體佔畫面較大、背景因長焦而壓縮',
  'shot/sh_pull': '主體偏小、看得到更多環境',
  'shot/sh_pan': '鏡頭橫向掃過：整張照片有明顯的水平方向拖影，邊緣被拉成橫向條紋，主體輪廓仍可辨',
  'shot/sh_tilt': '低角度仰視或明顯俯角，水平線略微傾斜',
  'shot/sh_track': '主體保持清晰，背景有明顯的水平方向拖影',
  'shot/sh_orbit': '約 45 度的斜側環繞視角，看得到主體側面與後方關係',
  'shot/sh_crane': '高角度俯視，看得到桌面與物件頂部',
  'shot/sh_hand': '輕微手震：畫面邊緣有細碎模糊與極輕微的歪斜，不是完全平直',
  'shot/sh_whip': '極強烈的水平拖影，畫面幾乎只剩橫向色帶，主體糊成一片',
  'shot/sh_zoom': '明顯的透視壓縮，背景被拉近放大、主體邊緣輕微放射狀模糊',
  'shot/sh_slow': '極短快門凝結的瞬間質感，細節銳利異常',
  'shot/sh_time': '長時間曝光的光跡與時間流逝感，物件靜止、光影被拉長',

  // stage4d 運鏡
  'cam3d/c3_orbit': '約 45 度斜側視角，看得到物件的側面與背面',
  'cam3d/c3_push': '物件佔畫面較大、背景壓縮',
  'cam3d/c3_dive': '高角度俯視，像由上方下降時的視角',
  'cam3d/c3_fly': '低角度穿越感，前景有輕微掠過的元素',
  'cam3d/c3_turn': '物件以正側面呈現，像轉盤轉到一半',
  'cam3d/c3_macro': '極近距離特寫物件表面的一小部分，淺景深',
  'cam3d/c3_isofix': '等距視角、固定構圖、無動態',
  'cam3d/c3_dof': '前景清晰、背景明顯失焦（或相反），焦點轉移的瞬間',
  'cam3d/c3_match': '兩個相似形狀前後呼應的構圖',
  'cam3d/c3_fix': '正面視角、固定構圖、完全清晰',

  // 層次／陰影：同一個白方塊，只換影子
  'elevation/none': '方塊完全沒有影子，像直接貼在背景上',
  'elevation/ambient': '只有一層極淡、擴散很遠的環境陰影',
  'elevation/hard': '一道邊緣銳利、方向明確的深影',
  'elevation/layered': '兩到三層不同距離的影子，層次清楚',
  'elevation/glow': '方塊邊緣向外發出柔光，不是投影',

  // 3D 場景：模型曾經畫出手，改成明確禁止
  'scene3d/sc_city': '城市背景但畫面中不出現任何人物或人手，物件放在中央展示台',
  'scene3d/sc_room': '房間一角但畫面中不出現任何人物或人手，物件放在桌面上',
  'scene3d/sc_nature': '戶外草地與石頭，但不出現人手',
  'style3d/s3_plush': '毛絨物件單獨放置，不出現人手',
};

/**
 * 共用視覺翻譯：很多維度都在講「溫暖／安靜／未來／極簡」，如果只把中文丟給模型，
 * 出來的會是同一道彩虹。這裡把抽象形容詞落成看得見的主體、材料或光線。
 * key 是 opt_id：同一個字在不同維度意思相近，共用一條就夠。
 */
const SCENE_HINT = {
  // stage1 張力：每格只有一個中間態選項，用一半一半的畫面表达
  calm_energy: '一半是平靜湖面、一半是流動光帶，張力在中間',
  precise_warm: '一半是精密網格、一半是暖木色，精確與溫度並置',
  premium_access: '一半是深色石材高級感、一半是明亮親和空間',
  quiet_bold: '大面積留白中只有一個大膽色塊',
  simple_deep: '極簡畫面但有豐富的層次與細節',
  trad_modern: '一半是古典對稱、一半是當代極簡線條',
  local_global: '本地街景與世界地圖輪廓疊合的抽象畫面',
  authority_friend: '一半是正式深色制服感、一半是親切的暖色人像剪影',

  // 光與氣（最容易被畫成同一道彩虹的一組）
  clear: '清澈透明的高山湖水、可見水下石頭、空氣通透',
  hazy: '清晨薄霧蓋住樹林，邊界柔化、層次仍可見',
  drycool: '乾燥的淺灰藍調、清爽無水氣',
  humid: '濕潤空氣、凝結水珠與柔軟散射光',
  still: '完全平靜的湖面與對稱倒影，沒有風',
  flowing: '溪水長曝光成絲綢般流動的水紋',
  afterrain: '雨後濕潤的石板與清新綠意，地面有積水反光',
  snow: '雪地與冷藍天空，細雪粒清晰',
  springmorn: '春天清晨的嫩綠與淡金陽光',
  lateafternoon: '午後斜射的暖光與長影子',
  deepnight: '深藍夜空與微弱星點，整體暗調；畫面不得出現彩虹或彩色光譜',
  mist: '清晨白色薄霧貼地，只見模糊樹影，沒有其他物體',
  afterglow: '日落後天邊的紫粉與橙紅漸層，地平線清晰',
  moonlight: '夜空中一輪清楚的白月亮，銀藍色冷光灑在平靜地面',
  candle: '一小枝點燃的蠟燭，暗背景中只有小範圍暖光',
  scope: '深色背景上的示波器綠色波形與細微霓虹光跡',
  steam: '透明水蒸氣由下往上飄，背景溫暖且柔化',
  aurora: '夜空中綠紫極光簾幕，星星清楚可見',
  water: '清澈水面與細微漣漪，反映天空，不是閃電不是城市',
  dawn: '冷調破曉，淡藍與極淡粉，太陽還沒升起',
  noon: '正午高角度直射白光，影子很短',
  golden: '黃金時刻的低角度金光，長影與暖色調',
  bluehour: '日落后藍調時刻，深藍天空與城市微弱暖燈',
  overcast: '多雲陰天，光線平均、沒有明顯影子',
  window: '窗框投下的柔和方形光影，落在淺色牆面',
  diffuse: '光線經柔光罩擴散，影子幾乎消失',
  warmlamp: '室內暖黃燈泡光，集中而親近',
  clinical: '均勻冷白光，無影、乾淨、無裝飾',
  selfglow: '物體自身發出柔和光暈，四周被照亮',
  rim: '物體邊緣一圈清楚輪廓光，正面偏暗',
  hard: '單一強烈直射光，邊緣尖銳的深影',
  flat: '完全平均的光，沒有方向性也沒有影子',

  // 情緒／性格
  calm: '平靜的湖面與淡藍灰天色，沒有強烈對比',
  warm: '暖木色與柔和燈光，貼近人的溫度',
  fresh: '嫩綠葉片與清晨露水，明亮通透',
  myst: '薄霧中的深色樹林，神秘但不過度暗',
  lux: '深色石材與少量金色反射，克制的高級感',
  vital: '鮮明橙紅與向上流動的光，有活力',
  nost: '泛黃舊照片質感與柔焦，回憶感',
  future: '冷藍紫與精密幾何光帶，未來感',
  heal: '柔和米白與淡綠，安靜修復的感覺',
  solemn: '深藍灰與對稱構圖，莊重克制',
  play: '明亮多色圓形與跳躍排版，活潑但不混亂',
  tense: '高對比暗調與銳利斜線，張力強',
  mellow: '奶油色與柔和圓形，溫潤不刺激',
  cool: '冷藍灰與光滑表面，理性清爽',
  quiet: '大量留白與單一微小主體，安靜',
  gentle: '柔軟織物與低對比淺色，溫柔',
  airy: '大量留白、light exposure 偏高、輕盈',
  steady: '水平線與穩定對稱構圖，可靠',
  precise: '精密網格與對齊的細線，準確',
  clean: '純白背景與單一乾淨形體',
  friendly: '圓潤形狀與暖色，親切',
  elegant: '細長比例與低飽和高明度，優雅',
  restrained: '只用了少數元素與中性色，克制',
  bold: '大面積高彩度色塊與粗形體，大膽',
  playful: '不規則圓形與跳動節奏，有趣',
  poetic: '柔光與朦胧層次，詩意',
  agile: '斜向動線與輕快節奏',
  unhurried: '緩慢的橫向層次與從容留白',

  // 配色
  cs_mono: '同一深淺不同的灰階與單一色相',
  cs_pastel: '高明度低彩度的粉蠟色色票',
  cs_morandi: '灰調柔化的莫蘭迪色票',
  cs_clash: '高彩度對比色並置，衝突明顯',
  cs_retro: '復古的棕黃與褪色紅綠',
  cs_coolTech: '冷藍灰加一點螢光青，科技感',
  cs_earth: '泥土、木、石的天然色票',
  cs_blackgold: '大面積黑加少量金色',
  cs_neon: '暗背景上的高彩度霓虹色',
  cs_green: '不同深淺的綠色為主',
  cs_duotone: '只有兩種色相互相疊合',
  cs_cleanAccent: '大面積中性色加一個醒目重點色',

  // 個性刻度：同一軸的五格要看出由左到右的變化，不能全是彩虹
  d_auth_m2: '深色正式服裝的背影剪影、對稱構圖，權威感',
  d_auth_m1: '深藍灰色的簡潔空間，正式但不過度',
  d_auth_z: '一半正式一半柔和的對比畫面',
  d_auth_p1: '暖色柔和光線下的親切人像背影',
  d_auth_p2: '明亮暖色、開放姿態的親切人像背影',
  d_craft_m2: '精確網格與整齊排列的幾何形',
  d_craft_m1: '對齊但有少許紋理的幾何形',
  d_craft_z: '一半工整網格一半手作紋理',
  d_craft_p1: '手捏陶土與可見指紋的不規則表面',
  d_craft_p2: '強烈手作筆觸與粗糙紙張纖維',
  d_logic_m2: '理性網格、資料圖表與清楚的直線',
  d_logic_m1: '簡潔線條與少量暖色點綴',
  d_logic_z: '一半理性線條一半柔軟光影',
  d_logic_p1: '柔和光影與不規則筆觸，帶人味',
  d_logic_p2: '溫暖手繪感與流動色彩，感性',
  d_quiet_m2: '大面积极淺灰留白，只有極小一個形體',
  d_quiet_m1: '安靜的浅色空間與少量元素',
  d_quiet_z: '小面積色彩與大面積留白平衡',
  d_quiet_p1: '一個醒目大色塊在浅色背景上',
  d_quiet_p2: '高彩度大色塊與強烈對比，搶眼',
  d_refined_m2: '細線、精緻材質與克制留白',
  d_refined_m1: '細膩紋理與柔和光線',
  d_refined_z: '精緻與粗獷材質各半',
  d_refined_p1: '粗獷但未經修飾的天然表面',
  d_refined_p2: '原始、粗礪、未打磨的材料',
  d_trad_m2: '古典對稱構圖與深色木質',
  d_trad_m1: '古典比例配上簡化線條',
  d_trad_z: '古典與當代元素各半',
  d_trad_p1: '當代極簡與明亮色彩',
  d_trad_p2: '強烈未來感的幾何與冷光',
  cw_action: '白色按鈕上清楚的深色文字色塊，不是空白',
  cw_white: '深底上的白色線框方塊，不是黑框',
  // 色彩規則：示範「對／不對」時不能把錯的東西畫成建議
  cr_accent: '大面積底色與墨色文字，重點色只出現在小色塊， 不可作文字色',
  cr_action: '只有可按的元件是醒目色，其他都是中性灰',
  cr_contrast: '深墨色文字壓在極淺底色上，對比清楚',
  cr_notcolor: '四個狀態除了不同顏色，另有不同幾何形狀',
  cr_noPureBlack: '文字是深灰帶暖色調，不是純黑',
  cr_noPureWhite: '卡片是柔和米白，頁面底色不是純白',
  cr_max3: '畫面只有三種彩色與大量中性色',
  cr_logo: '同一個幾何記號只有少數核准配色版本',
  cr_print: '同一組色塊的螢幕版與印刷打樣版並排',
  cr_share: '主色佔大多數，子品牌色只在小區塊',
  cr_photo: '深色半透明遮罩上有淺色幾何形代表標誌位置',
  cd_none: '只有單一淺色主題，沒有深色版本',
  cd_auto: '同一畫面分兩半，一半淺色一半深色',
  cd_dual: '兩張並排的畫面，一張淺色一張深色',
  cd_section: '大部分是淺色畫面，只在中間一塊深色區',
  ct_aa: '文字與底色有明顯但不太極端的明暗對比',
  ct_aaa: '文字與底色有非常強的明暗對比',
  cs_h: '一個小記號週圍留白，上方有淡淡的比例框線',
  cs_x: '一個小記號週圍留白，旁邊有一段標示高度的細線',
  cs_ratio: '一個小記號置中，週圍是規則的方格框線',
  cs_tbd: '一個小記號與週圍模糊的未定框線',
  cr_80155: '大片底色、少量墨色、極小一點重點色',
  cr_603010: '六成主色、三成輔助色、一成重點色',
  // 標誌與字體
  lt_word: '一條橫向的長形字標位置，由抽象方塊组成，不是可讀文字',
  lt_letter: '一個單獨的抽象字母狀幾何記號，不代表任何真實字母',
  lt_pict: '一個可辨識的物件圖形記號，例如一片葉子或一間屋，沒有文字',
  lt_abstract: '完全抽象的幾何形記號，沒有可辨識物件也沒有文字',
  lt_combo: '左邊圖形記號加右邊長條字標位置的橫向組合',
  lt_emblem: '圓形或盾形邊框包住中間幾何記號',
  lt_mascot: '一個簡化角色造型作為標誌',
  ls_minimal: '極少線條與大面積留白的幾何記號',
  ls_geo: '由圓、方、三角基本形組成的記號',
  ls_hand: '帶手繪筆觸與不規則線條的記號',
  ls_vintage: '復古徽章式對稱構圖',
  ls_luxury: '細線、襯線感與高對比黑白',
  ls_tech: '精密幾何與電路般的切角',
  ls_organic: '圓潤的有機曲線',
  ls_line: '只有細線條構成的線性記號',
  ls_bold: '粗厚實心形體',
  ls_motion: '帶斜向動勢的形體',
  ls_negative: '利用負空間形成的記號',
  tp_geo: '接近圓與方的無襯線筆畫',
  tp_humanist: '帶書寫痕跡的無襯線筆畫',
  tp_swiss: '極度理性、等寬結構的無襯線筆畫',
  tp_classic: '有襯線與明顯粗細對比的筆畫',
  tp_didone: '極細襯線與極粗主筆的強對比',
  tp_slab: '粗厚方形襯線',
  tp_mono: '等寬、機械式的筆畫',
  tp_round: '圓頭筆畫與柔軟轉角',
  tp_kai: '帶毛筆書寫感的筆畫',
  tp_display: '張揚、戲劇化的展示字形',
  tp_hand: '手寫不規則筆畫',

  // 空間
  is_min: '空白牆、極少家具、乾淨直線',
  is_japandi: '淺木、米白、矮家具與自然光',
  is_nordic: '白牆、淺木、簡約布料的北歐空間',
  is_ind: '裸露管線、水泥地與金屬工業風',
  is_lux: '石材、黃銅與柔和重點光',
  is_cn: '木格、對稱與東方留白',
  is_org: '大量植物與天然材質',
  is_retro: '復古瓷磚與暖色家具',
  is_med: '白牆、藍色點綴與強烈陽光',
  is_future: '光滑表面、間接光與極簡幾何',
  is_home: '柔軟沙發與居家生活感',
  is_fresh: '明亮通風、淺色與綠意',
  sp_clinic: '診療室：乾淨、無菌感、安靜',
  sp_retail: '零售店：貨架與展示動線',
  sp_fnb: '餐飲空間：餐桌與溫暖照明',
  sp_office: '辦公室：工作桌與間隔',
  sp_pop: '快閃店：臨時結構與強烈視覺',
  sp_hotel: '酒店大堂：寬敞與精致材質',
  sp_studio: '工作室：簡潔桌面與創作工具',
  sp_show: '展覽空間：動線與展示台',
  sl_ambient: '看不見光源的均勻間接光',
  sl_accent: '暗背景中一束重點照明打在主體上',
  sl_day: '自然日光從側面大窗進入',
  sl_warm: '暖黃色溫的室內光',
  sl_neutral: '中性色溫、無偏色',
  sl_cool: '偏藍冷色溫',
  sl_dim: '光線昏暗、只留輪廓',
  sl_emerg: '暗空間中的緊急指示光',
  sx_wood: '木地板與木飾面',
  sx_stone: '天然石材紋理',
  sx_terrazzo: '水磨石碎片',
  sx_carpet: '柔軟地毯',
  sx_vinyl: '平滑塑膠地材',
  sx_paint: '平整塗料牆面',
  sx_wallpaper: '有細膩花紋的牆紙',
  sx_glass: '透明玻璃與反射',
  sx_fabric: '布面軟包',
  sx_metal: '拉絲金屬表面',
  sx_bamboo: '竹材紋理',
  sx_acoustic: '吸音孔板',
  sn_music: '柔軟聲波與温暖光暈',
  sn_quiet: '完全安靜的吸音空間',
  sn_scent: '空氣中細微 aromatic 粒子',
  sn_temp: '冷暖色溫對比',
  sn_touch: '可觸摸的柔軟材質特寫',
  sn_focus: '注意力集中在單一亮點',
  sn_neutral: '中性、無干擾',
  sn_nature: '自然光與植物',

  // 影像／音樂
  vs_doc: '真實紀錄片單幀，手持感與自然光',
  vs_brand: '精緻品牌形象片，細膩打光與慢節奏',
  vs_product: '產品特寫與乾淨背景',
  vs_ugc: '手機拍攝的日常真實感',
  vs_teach: '清楚展示步驟的教學畫面',
  vs_motion: '抽象動態圖形',
  vs_interview: '人物側影受訪，背景簡潔',
  vs_vlog: '生活隨手拍的親切感',
  vs_slow: '慢動作凝結的細節',
  vs_fashion: '時尚大片式構圖與強烈光影',
  vs_oneshot: '一鏡到底的長鏡頭畫面',
  vs_unbox: '開箱桌面俯視與包裝',
  ms_amb: '緩慢起伏的長音波形',
  ms_piano: '稀疏單音的波形與留白',
  ms_folk: '溫暖木質樂器感的波形',
  ms_lofi: '低沉、帶顆粒感的波形',
  ms_jazz: '不規則搖擺節奏的波形',
  ms_chamber: '多層次弦樂波形',
  ms_down: '低頻強烈的電子波形',
  ms_house: '規律四拍電子波形',
  ms_cine: '大編制、動態範圍大的波形',
  ms_guo: '東方旋律線條的波形',
  ms_pop: '明亮規律的流行波形',
  ms_funk: '切分節奏的波形',
  ms_tech: '精密重複的電子波形',
  ms_world: '多元打擊樂的波形',
  in_piano: '琴鍵敲擊的清晰瞬態波形',
  in_guitar: '木吉他撥弦的溫暖衰減波形',
  ms_warm: '圓潤低中頻波形',
  tb_warm: '圓潤低中頻波形',
  tb_bright: '明亮高頻波形',
  an_2d: '扁平向量色塊',
  an_hand: '手繪線條與不規則填色',
  an_3d: '3D 渲染的立體物件',
  an_stop: '逐格拍攝的輕微跳動質感',
  an_clay: '黏土材質的立體角色',
  an_cut: '剪紙拼貼',
  an_kin: 'kinetictype 幾何構成',
  an_white: '白板上的簡筆線條',
  an_cel: '賽璐璐平塗色塊',
  an_roto: '真實影像轉描的邊緣',
  an_mix: '多種媒材混合拼貼',
  an_iso: '等距視角的立體場景',

  // 3D 與產品
  s3_photo: '接近照片的物理正確渲染',
  s3_low: '少面數的低多邊形面',
  s3_clay: '無光澤黏土材質',
  s3_glass: '透明玻璃折射',
  s3_toon: '卡通平塗色塊',
  s3_iso: '等距視角與乾淨色塊',
  s3_abs: '抽象幾何、無真實材質',
  s3_liquid: '液態金屬光澤',
  s3_plush: '毛絨柔軟表面',
  s3_voxel: '方塊像素化體積',
  s3_dio: '強烈打光的戲劇化展示',
  s3_grey: '全灰黏土模型、無材質',
  sc_studio: '純色無縫攝影棚背景，沒有其他物件',
  sc_iso: '微型等距空間，物件放在中間',
  sc_room: '真實房間的一角，物件放在桌面上，不出現人手',
  sc_nature: '自然戶外環境，物件放在石頭或草地上',
  sc_float: '物件懸浮在虛空中，周圍有小平面的碎片',
  sc_city: '城市街道背景，物件放在畫面中央，不出現人手',
  sc_mini: '微縮模型場景',
  sc_stand: '簡潔展示台',
  sc_world: '童話式繽紛小世界',
  sc_surreal: '超現實扭曲空間',
  mc_none: '空景，沒有角色',
  mc_real: '寫實 3D 人物，正面站立',
  mc_q: '可愛 Q 版角色，大頭小身',
  mc_clay: '黏土角色',
  mc_animal: '擬人化動物角色',
  mc_geo: '幾何簡化角色',
  mc_faceless: '沒有五官的角色',
  mc_robot: '機器人角色',
  mc_object: '擬人化物件角色',
  mc_virtual: '虛擬偶像風格角色',
  mf_inj: '塑膠射出成型機與模具',
  mf_die: '金屬壓鑄與熔融金屬',
  mf_cnc: 'CNC 切削與金屬屑',
  mf_sheet: '鈑金折彎',
  mf_ext: '擠出成型線',
  mf_3dp: '3D 列印逐層堆疊',
  mf_cast: '澆注澆铸',
  mf_thermo: '熱成型塑膠片',
  mf_hand: '手工組裝工作台',
  mf_sew: '縫紉與布料',
  pm_abs: '霧面塑膠外殼',
  pm_rec: '帶斑點的再生塑膠',
  pm_alu: '鋁合金表面',
  pm_ss: '不鏽鋼表面',
  pm_glass: '透明玻璃',
  pm_ceramic: '細膩陶瓷',
  pm_wood: '木纹',
  pm_leather: '皮革纹理',
  pm_fabric: '织物纹理',
  pm_silicone: '柔軟矽膠',
  pm_bio: '生物基材料',
  pr_drop: '產品掉落撞擊地面的瞬間',
  pr_wear: '刮痕與磨耗特寫',
  pr_uv: '陽光曝曬測試',
  pr_ip: '防水防塵測試',
  pr_chem: '化學試劑測試',
  pr_batt: '電池充放電測試',
  pr_key: '按鍵壽命測試',
  pr_skin: '皮膚接觸測試',
  pr_use: '實際使用情境',
  pr_color: '色差比對',
  pr_ship: '運輸包裝測試',

  // UI 與版面
  ui_flat: '平面色塊與留白，沒有陰影',
  ui_skeu: '模擬真實物件的皮革與縫線',
  ui_neu: '柔凸起與凹下的軟阴影',
  ui_glass: '半透明磨砂玻璃與背景模糊',
  ui_brut: '粗黑邊框與原始色彩',
  ui_card: '分開的圓角卡片',
  ui_mat: 'Material 式層次與鮮明色彩',
  ui_data: '密集圖表與數據面板',
  ui_conv: '大型圓角與親和配色',
  ui_edit: '純文字與大量留白的編輯式畫面',
  ui_cute: '圓潤、柔和粉色',
  ui_dark: '深色背景與高對比文字',
  ux_onepage: '一條連續縱向的長頁面',
  ux_wizard: '分成數個步驟的進度條畫面',
  ux_dash: '多塊資訊同時呈現的儀表板',
  ux_search: '頂部搜尋框與結果列表',
  ux_chat: '左右交談氣泡',
  ux_card: '一格一卡的排列',
  ux_listdetail: '左側清單右側詳情',
  ux_booking: '日曆與時段選擇',
  ux_checkout: '商品清單與付款流程',
  ux_member: '會員資料與等級',
  ux_onboard: '新手引導的多頁提示',
  ux_empty: '空白狀態與單一動作按鈕',
  tp_single: '一張單圖貼文版位',
  tp_carousel: '多頁滑動的連續畫面',
  tp_quote: '大字引言居中',
  tp_info: '多欄資訊圖',
  tp_ba: '左右並排的前後對比',
  tp_how: '步驟式排列',
  tp_product: '產品主圖加少量說明',
  tp_event: '日期與活動資訊突出',
  tp_promo: '折扣與行動按鈕突出',
  tp_testi: '見證引言與頭像位置',
  tp_video: '影片封面與播放位置',
  tp_story: '直式故事版位',
  tp_ppt: '簡報投影片版位',
  tp_edm: '電子郵件版位',
  tp_banner: '橫幅版位',
  tp_lp: '長頁登陸頁版位',
  ch_ig: '方形社群貼文版位',
  ch_igr: '直式短影音版位',
  ch_fb: '社群動態版位',
  ch_th: '縮圖海報版位',
  ch_tt: '直式短影音版位',
  ch_yt: '橫式影片封面版位',
  ch_li: '專業社群文章版位',
  ch_xhs: '生活方式圖文版位',
  ch_wa: '即時通訊對話版位',
  ch_edm: '電子郵件版位',
  ch_web: '網站頁面版位',
  ch_gads: '搜尋廣告文字版位',
  ch_meta: '社群廣告版位',
  ch_kol: '合作創作者貼文版位',
  ch_ppt: '簡報版位',
  ch_print: '印刷品版位',
};

/**
 * 住在 material 維度、但本質是「光與氣」的選項：出樣本磚會變成錯的東西
 * （月光不可能是一塊磚）。這幾個用氛圍圖。
 */
const ATMOSPHERE_OPTIONS = new Set([
  'mist',
  'afterglow',
  'moonlight',
  'candle',
  'scope',
  'steam',
  'aurora',
  'water',
]);

/**
 * 同名維度在不同 stage 意思不同：stage0 的 channels 是業務渠道、stage4g 的
 * touchpoints 是治理接觸點，都不是視覺題。明確排除，不要靠維度名猜。
 */
const SKIP_STAGE_DIMENSION = new Set(['stage0/channels', 'stage0/repeat', 'stage4g/touchpoints']);

/**
 * 有些選項名就是平台名（Instagram／TikTok／LinkedIn…）。直接把名字寫進 prompt，
 * 模型會畫出那個平台的假介面與真字，違反零文字。這裡換成中性描述。
 */
const SAFE_LABEL = {
  ch_ig: '方形社群貼文', ch_igr: '直式短影音貼文', ch_fb: '社交動態貼文',
  ch_th: '輕社群短文', ch_tt: '直式短影音', ch_yt: '橫式影片封面',
  ch_li: '專業社群文章', ch_xhs: '生活方式圖文', ch_wa: '即時通訊訊息',
  ch_edm: '電子郵件通訊', ch_web: '網站與落地頁', ch_gads: '搜尋廣告',
  ch_meta: '社群廣告', ch_kol: '合作創作者貼文', ch_ppt: '簡報頁面',
  ch_print: '印刷品與店內陳列',
  tp_quote: '大字引言版式',
  sl_content: '標題加內文版式',
  vf_916: '直式影片畫面', vf_45: '四比五動態貼文', vf_11: '方形影片畫面',
  vf_169: '橫式影片畫面', vf_219: '電影寬螢幕畫面',
};

/** 少數選項的中文名會令模型固執地畫出假字；改用純抽象示意。 */
const TEMPLATE_OVERRIDE = {
  'templateTypes/tp_quote': 'diagram',
};

function promptFor(row) {
  const option = {
    id: row.opt_id,
    zh: SAFE_LABEL[row.opt_id] ??
      (row.zh === null || row.zh === undefined || String(row.zh).trim() === ''
        ? String(row.opt_id).replace(/_/g, ' ')
        : String(row.zh)),
    desc: row.description ?? '',
    dimension: row.dimension,
  };

  const kind =
    ATMOSPHERE_OPTIONS.has(option.id) && option.dimension === 'material'
      ? 'atmosphere'
      : (TEMPLATE_OVERRIDE[`${option.dimension}/${option.id}`] ?? TEMPLATE_OF[option.dimension] ?? 'tile');

  const text = TEMPLATES[kind](option).replace(/。。/g, '。');
  const hint =
    VISUAL_HINT[`${option.dimension}/${option.id}`] ??
    SCENE_HINT[option.id];

  // 提示放在「零文字」之前：最後一句仍然是最硬的規則。
  return hint === undefined ? text : text.replace(NO_TEXT, `視覺重點：${hint}。${NO_TEXT}`);
}

/** 同一格每次生成都得到同一個 seed，重跑不會換一個樣子。 */
function seedFor(stage, dimension, optId, offset = 0) {
  const hash = createHash('sha256').update(`${stage}/${dimension}/${optId}/${offset}`).digest();
  return hash.readUInt32BE(0) % 100000;
}

/** PNG → WebP。cwebp 不存在就用 PNG 頂住（寧願大，不要沒有圖）。 */
function toWebp(source, target) {
  return new Promise((resolve, reject) => {
    const child = spawn('cwebp', ['-q', WEBP_QUALITY, '-m', '6', '-quiet', source, '-o', target]);
    let err = '';

    child.stderr.on('data', (chunk) => {
      err += String(chunk);
    });

    child.on('error', () => {
      // 沒有 cwebp：直接寫 PNG 內容（副檔名仍然是 .webp 會壞，所以報錯提示安裝）。
      reject(new Error('找不到 cwebp，請先安裝：brew install webp'));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`cwebp exited ${code}: ${err.slice(-300)}`));
        return;
      }

      resolve(undefined);
    });
  });
}

/* ── ComfyUI ──────────────────────────────────────────── */

const QWEN = join(process.env.HOME ?? '', '.workbuddy/skills/comfyui-qwen-image/scripts/qwen21.py');

function runQwen(prompt, size, seed, cwd) {
  return new Promise((resolve, reject) => {
    const args = [QWEN, 't2i', prompt, '--size', size, '--seed', String(seed), '--steps', '25'];
    // cwd 指去臨時目錄：qwen21.py 把圖存在自己的 cwd，不應該落在 repo 裡。
    const child = spawn('python3', args, { cwd });
    let out = '';
    let err = '';

    child.stdout.on('data', (chunk) => {
      out += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      err += String(chunk);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`qwen21 exited ${code}: ${err.slice(-400) || out.slice(-400)}`));
        return;
      }

      const match = /SAVED: (.+?) \(\d+ bytes\)/.exec(out);

      if (match === null) {
        reject(new Error(`找不到 SAVED 行：${out.slice(-400)}`));
        return;
      }

      resolve(match[1].trim());
    });
  });
}

/* ── 主流程 ───────────────────────────────────────────── */

function parseArgs(argv) {
  const args = {
    stage: '',
    dimensions: [],
    limit: 0,
    opt: '',
    force: false,
    offset: 0,
    dryRun: false,
    size: '512x384',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];

    if (key === '--stage') args.stage = argv[++i] ?? '';
    else if (key === '--dimension') {
      args.dimensions = String(argv[++i] ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value !== '');
    } else if (key === '--limit') args.limit = Number(argv[++i] ?? 0);
    else if (key === '--opt') args.opt = String(argv[++i] ?? '');
    else if (key === '--offset') args.offset = Number(argv[++i] ?? 0);
    else if (key === '--size') args.size = argv[++i] ?? '512x384';
    else if (key === '--force') args.force = true;
    else if (key === '--dry-run') args.dryRun = true;
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.stage === '') {
    console.error(
      '用法：node scripts/gen-option-images.mjs --stage stage2 [--dimension material,tactile] [--limit N] [--force] [--dry-run]',
    );
    process.exitCode = 1;
    return;
  }

  const env = await loadEnv();
  const db = new PgClient({
    host: '127.0.0.1',
    port: Number(env.DB_PORT ?? 25432),
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB,
  });

  await db.connect();

  const where = ['stage = $1'];
  const params = [args.stage];

  if (args.dimensions.length > 0) {
    params.push(args.dimensions);
    where.push(`dimension = any($${params.length})`);
  } else {
    // 不帶 --dimension = 該 stage 所有「需要圖」的維度，而不是全部選項。
    // keywords／banned／政策條文沒有視覺答案，硬生圖只會製造假訊息。
    params.push(Object.keys(TEMPLATE_OF));
    where.push(`dimension = any($${params.length})`);
  }

  const { rows: found } = await db.query(
    `select stage, dimension, opt_id, zh, description from brand_guide_option
      where ${where.join(' and ')}
      order by dimension, sort_order`,
    params,
  );

  await db.end();

  const rows = found
    .filter((row) => !SKIP_STAGE_DIMENSION.has(`${row.stage}/${row.dimension}`))
    .filter((row) => args.opt === '' || row.opt_id === args.opt);

  const target = (row) => join(ASSETS, row.stage, row.dimension, `${row.opt_id}.webp`);

  const todo = (args.force ? rows : rows.filter((row) => !existsSync(target(row)))).slice(
    0,
    args.limit > 0 ? args.limit : undefined,
  );

  const label = args.dimensions.length > 0 ? args.dimensions.join(',') : '全部維度';

  console.log(
    `待生成：${todo.length} 張（${args.stage} / ${label}），` +
      `這批維度已有 ${rows.length - (args.force ? 0 : todo.length)} 張。`,
  );

  if (args.dryRun) {
    const seen = new Set();

    for (const row of todo) {
      if (seen.has(row.dimension) || seen.size >= 8) {
        continue;
      }

      seen.add(row.dimension);
      console.log(`\n[${row.dimension}/${row.opt_id}] ${row.zh}\n${promptFor(row)}`);
    }

    return;
  }

  const workDir = await mkdtemp(join(tmpdir(), 'brand-option-img-'));
  let done = 0;
  let failed = 0;

  for (const row of todo) {
    const name = `${row.dimension}/${row.opt_id} ${row.zh}`;
    const started = Date.now();

    try {
      const savedPath = await runQwen(
        promptFor(row),
        args.size,
        seedFor(row.stage, row.dimension, row.opt_id, args.offset),
        workDir,
      );
      const file = target(row);

      await mkdir(dirname(file), { recursive: true });
      await toWebp(savedPath, file);
      await rm(savedPath, { force: true });

      const { size } = await stat(file);

      done += 1;
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      console.log(`✓ ${done}/${todo.length} ${name}  ${Math.round(size / 1024)}KB  ${secs}s`);
    } catch (error) {
      failed += 1;
      console.error(`✗ ${name}  ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await rm(workDir, { recursive: true, force: true });

  console.log(`\n完成：${done} 成功，${failed} 失敗。圖在 ${join(ASSETS, args.stage)}`);
  console.log('記得 git add 這批圖：它們是系統的一部分，不是暫存檔。');

  if (failed > 0) {
    process.exitCode = 1;
  }
}

await main();
