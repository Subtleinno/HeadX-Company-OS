# 概念附錄

**主真相是 [`docs/CONCEPT.md`](../CONCEPT.md)。先讀那份。**

這裡是它的延伸與來源：把某個題目寫到底，用「查得到理由」的粒度寫，不是給人一次讀完。

## 這裡有什麼

| 檔案 | 內容 | 幾時讀 |
|---|---|---|
| `01-company-os-concept.md` | 上位構思的完整版（v0.8）：七原則、十二物件、角色、Needs 兩型、框架六條不變量 | 想追某個原則為甚麼這樣定 |
| `09-app-forge.md` | 平台自己生出缺少的 app：五步、App Kit、spec 編譯不重生、五道機器防護、孤兒偵測 | 做 App Forge，或想知「加一個部門」的成本 |
| `10-build-charter.md` | 開發憲章：紅／黃／綠領土、六個配方、六級驗證階梯、config ⊂ overlay ⊂ core | **agent 開工前必讀** |

## `future/`：未來部門 app 的構思

做到那個 app 才讀。現在一行都未寫。

| 檔案 | 內容 |
|---|---|
| `future/02-sales-app-concept.md` | Sales：facet split、ERPNext 分權、投影／鏡像／命令三態、Needs Email |
| `future/03-operations-app-concept.md` | 營運：計量維度、Consumption、三條業務 |
| `future/04-finance-app-concept.md` | 財務：會計例外變 Needs、Bank Feed 三路、Closing Run |
| `future/05-hr-app-concept.md` | 人事：計薪 MPF、法定規則版本化、Work Pattern |
| `future/06-app-library.md` | App 圖書館三層、CRM 分家、各 app 歸屬 |
| `future/07-group-tenant-site.md` | Group／Tenant／Site 三層、Hub 只存投影、多法域 |
| `future/08-scenario-coverage.md` | 附錄 A：十二變化軸、八間公司壓力測試（結論已入 `01`） |
| `future/11-delivery-plan.md` | 2026-11-10 的交付計劃。**已被 `HANDOFF.md` 的頁面隊列取代** |
| `future/strategy-doc-questions.md` | 交給 Perplexity 的問題：策略文件長什麼樣（未做） |

## `archive/`：已被吸收的底稿

第一輪調研與 changelog。結論已入 `01` 與 `10`，原文只留作證據。

| 檔案 | 內容 |
|---|---|
| `archive/prior-art-v1.md` | 第一輪競品調研（結論已入 `01` §12） |
| `archive/forge-prior-art.md` | App Forge 四組調研 |
| `archive/charter-prior-art.md` | 開發治理三組調研 |
| `archive/changelog-01.md` | `01` 的 v0.2–v0.6 改動記錄 |

## 規矩

- 這批文件的版本號會落後於 `CONCEPT.md`。**兩者衝突，以 `CONCEPT.md` 為準。**
- 不要把這裡的東西當成施工授權。施工只認 GitHub issue。
