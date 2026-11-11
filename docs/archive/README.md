# 歸檔

**這裡不是真相。** 歸檔只是留證據，讓你日後查「當時為甚麼這樣想」。

永久規則：**不要在這裡找現行規則。** 現行規則在 `docs/CONCEPT.md`、`docs/product/HANDOFF.md`、`docs/product/DECISIONS.md`。

| 檔案 | 原本是什麼 | 何時被取代 | 被誰取代 |
|---|---|---|---|
| `MASTER-PLAN-2026-11-07.md` | 2026-11-07 的全盤計劃：國際版／大陸版、gateway 三入口、customer-portal／supplier-portal、發件箱、MCP 六動詞 | 2026-11-11（C85） | `docs/CONCEPT.md` |
| `00-master-plan-v1.0.md` | 2026-11-10 的老闆版入口（原 `docs/concept/00`） | 2026-11-11（C85） | `docs/CONCEPT.md` |
| `BASE-UI-DESIGN-2026-11-07.md` | 舊共用外殼與底座管理 UX 規格 | 2026-11-09（C61） | `docs/product/FRAME-UIUX-HANDOFF.md` v1.4 |
| `BASE-UI-HXDESIGN-ALIGNMENT-2026-11-07.md` | Base UI 對照 HxDesign 的逐項實測表 | 2026-11-09（C61，#148 A） | Frame v1.3 設計稿 |
| `WORKSPACE-APP-SCOPE-DESIGN-v0.3.md` | 公司／品牌語意、三模式候選互動與接入契約 | 2026-11-11（C83） | `docs/product/SCOPE-MODEL.md` |
| `PERPLEXITY-MANAGER-PROMPT.md` | 給 Perplexity 做 PM 開 issue 的 prompt | 2026-11-11（C80） | 老闆直接對 issue 講，AI 自己開 |
| `planning-loop.md` | 規劃（Perplexity）與施工（WorkBuddy）的分工 | 2026-11-11（C80、C85） | `docs/product/HANDOFF.md` 第 5、7 節 |
| `12-ui-brief.md` | 外框第一版設計 brief | 2026-11-09（C53–C61） | `docs/design/frame/frame-0*.png` |
| `demo-public-stack-2026-11-07.md` | 隔離 Demo stack 的部署契約（`company-os-demo` project、零主機端口、named volume、cloudflared 對外） | 2026-11-11（C90） | 同一套 stack ＋ compose profile `tunnel`（C89） |
| `DEMO-PUBLIC-TESTING-2026-11-07.md` | 用 browser-use AI 測 Demo stack 的方法與報告格式 | 2026-11-11（C90） | 無（改為直接測現行那一套） |

歸檔不是刪除：`git log --follow <檔案>` 仍可追。但**不要在歸檔上繼續施工**——若某個舊計劃要復活，先寫進 `CONCEPT.md`，再開新檔。
