
// ===== Stage 04F v3 · 模板選擇器、AI 填寫提示、發佈與成效紀錄、補充檢查（擴充 core.js） =====
const chName=id=>(CH_INFO[id]||{}).name||anyName(id);
const selTpls=s=>s.tplSel.map(id=>TPL_BY[id]).filter(Boolean);
function recommendTpls(s,o){o=o||{};const sc0=s.channels.filter(c=>TPL_CHS.includes(c));const chs=o.ch&&o.ch!=="all"?[o.ch]:(sc0.length?sc0:TPL_CHS);
  return TPLS.filter(t=>chs.includes(t.ch)&&(o.allowRisk||!t.hr)).map(t=>{let sc=0,why=[];if(s.channels.includes(t.ch)){sc+=3;why.push("已選渠道")}if(o.goal&&t.goals.includes(o.goal)){sc+=3;why.push("符合目標")}else if(!o.goal&&s.adGoal.some(g=>t.goals.includes(g))){sc+=2;why.push("符合已選目標")}if(o.funnel&&t.funnel.includes(o.funnel)){sc+=2;why.push("符合漏斗階段")}else if(!o.funnel&&s.funnel.some(f=>t.funnel.includes(f))){sc+=1;why.push("符合已選漏斗")}if(t.hr){sc-=1;why.push("高風險須人類審核")}return {t,sc,why}}).sort((a,b)=>b.sc-a.sc||a.t.id.localeCompare(b.t.id))}
function tplSpec(t){const ci=CH_INFO[t.ch]||{specs:[]};return ci.specs.map(r=>r[0]+"："+r[1]).join("；")}
function tplPrompt(s,t){const X=id=>T_(s,id)||"（未填）",p=palette(s),pal=Object.entries(p).map(([k,v])=>k.slice(2)+" "+v).join("、")||"（未填）";const neg=[...labels("adAvoid",s)].join("、")||"（未定義）";
  const frames=t.frames.map(f=>"- "+f[0]+"：「"+f[1]+"」").join("\n");const slots=t.slots.map(a=>"- "+a[0]+"："+a[1]).join("\n");const json="{\n"+t.slots.map(a=>'  "'+a[0]+'": "…"').join(",\n")+',\n  "needs_human_review": '+(t.hr?"true":"false")+',\n  "claims_used": [],\n  "disclosures_added": [],\n  "assumptions": []\n}';
  return `【任務】請用模板「${t.id}｜${t.name}」為「${brandName(s)}」生成一則${chName(t.ch)}內容。\n\n【品牌背景】\n${ctxStages(s)}\n\n【策略】目標：${labels("adGoal",s).join("、")||"（未定）"}；漏斗：${labels("funnel",s).join("、")||"（未定）"}；市場定位：${labels("positioning",s).join("、")||"（未定）"}；定位一句話：${X("pos_line")}；受眾：${X("aud")}\n【視覺】色值：${pal}；字體：${X("f_head")}／${X("f_body")}\n【語氣】對照 Stage 3 的說話性格與用語；${X("hook")==="（未填）"?"":"已有主 Hook：「"+X("hook")+"」"}\n\n【模板：${t.name}】\n用途：${t.purpose}｜格式：${t.fmt}\n文案框架：${t.fw}\n結構：\n${frames}\n平台規格：${tplSpec(t)}\n模板備註：${t.notes||"—"}\n合規：${t.comp||"—"}\n\n【請填寫的欄位】\n${slots}\n\n【規則】\n1) 只可使用我提供的品牌知識與事實；不確定的資料寫在 assumptions，不要編造數字、獎項、見證、價格或療效。\n2) 一則內容一個主要 CTA；標題與文字須在安全區內；對比至少 4.5:1。\n3) 不可使用：${neg}。\n4) 涉及價格、優惠、健康、見證、前後對比或比較時，needs_human_review 必須為 true，並列出 claims_used。\n5) 商業合作與 AI 生成內容須按平台與 4H 政策披露，寫入 disclosures_added。\n6) 平台規格與政策以最新說明為準；你不是律師，合規由人類與專業人士確認。\n7) 輸出標示為「AI 提案，待人類核准」。\n\n【輸出】請只輸出以下 JSON：\n\`\`\`json\n${json}\n\`\`\``}
function tplLibMD(){const md=["# 渠道模板庫（template-library，草稿）\n","> 平台規格與政策會變，以各平台最新說明為準；合規提醒不是法律意見；高風險模板須人類合規審核。\n"];TPL_CHS.forEach(ch=>{const ci=CH_INFO[ch];md.push(`## ${ci.name}\n\n`+ci.specs.map(r=>`- ${r[0]}：${r[1]}`).join("\n")+"\n\n來源：\n"+ci.sources.map(r=>`- ${r[0]}（${r[1]}）`).join("\n")+"\n");TPLS.filter(t=>t.ch===ch).forEach(t=>{md.push(`### ${t.id}｜${t.name}${t.hr?"（須人類合規審核）":""}\n\n- 用途：${t.purpose}\n- 目標：${t.goals.map(anyName).join("、")}；漏斗：${t.funnel.map(anyName).join("、")}\n- 格式：${t.fmt}\n- 文案框架：${t.fw}\n- 結構：\n`+t.frames.map(f=>`  - ${f[0]}：${f[1]}`).join("\n")+`\n- 欄位：${t.slots.map(a=>a[1]).join("、")}\n- 合規：${t.comp||"—"}${t.notes?"\n- 備註："+t.notes:""}\n`)})});return md.join("\n")}
function tplPromptsMD(s){const L=selTpls(s);return `# 已選模板的 AI 填寫提示（draft）\n\n`+(L.length?L.map(t=>`## ${t.id}｜${t.name}\n\n\`\`\`\n${tplPrompt(s,t)}\n\`\`\`\n`).join("\n"):"（還沒有選模板）")}
const numv=v=>{const x=parseFloat(String(v).replace(/,/g,""));return isFinite(x)?x:null};
function pubDate(str){const m=String(str||"").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.getUTCMonth()===+m[2]-1?d:null}
function pubIssues(s){const out=[],A=(l,m)=>out.push({level:l,msg:m});const now=new Date(),today=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));
  s.pubs.forEach((r,i)=>{const nm=r.title||("第 "+(i+1)+" 筆"),t=TPL_BY[r.tpl];if(!t)A("warn",`成效紀錄「${nm}」：模板編號「${r.tpl||"空白"}」不在模板庫。`);else{if(r.ch&&chName(t.ch)!==r.ch)A("info",`成效紀錄「${nm}」：渠道與模板所屬渠道（${chName(t.ch)}）不一致。`);if(t.hr&&!r.reviewer)A("warn",`成效紀錄「${nm}」：使用高風險模板「${t.id}」，但沒有合規審核者。`);if((t.claims.length||/KOL|合作/.test(r.title||""))&&!r.disc)A("warn",`成效紀錄「${nm}」：沒有記錄披露狀態。`)}
    const d=pubDate(r.date);if(r.date&&!d)A("warn",`成效紀錄「${nm}」：日期格式要用 YYYY-MM-DD。`);else if(d&&d>today)A("error",`成效紀錄「${nm}」：日期在未來。`);
    const v={reach:numv(r.reach),eng:numv(r.eng),clicks:numv(r.clicks),conv:numv(r.conv)};Object.entries(v).forEach(([k,x])=>{if(r[k]&&x==null)A("warn",`成效紀錄「${nm}」：${k} 不是數字。`);if(x!=null&&x<0)A("warn",`成效紀錄「${nm}」：${k} 不可為負數。`)});if(v.clicks!=null&&v.reach!=null&&v.clicks>v.reach)A("warn",`成效紀錄「${nm}」：點擊多於觸及，請核對定義。`);if(v.conv!=null&&v.clicks!=null&&v.conv>v.clicks)A("warn",`成效紀錄「${nm}」：轉化多於點擊，請核對定義。`)});return out}
function pubSummary(s){const m={};s.pubs.forEach(r=>{if(!r.tpl)return;const e=m[r.tpl]=m[r.tpl]||{tpl:r.tpl,n:0,reach:0,eng:0,clicks:0,conv:0};e.n++;["reach","eng","clicks","conv"].forEach(k=>{const x=numv(r[k]);if(x!=null&&x>=0)e[k]+=x})});return Object.values(m).map(e=>({...e,engRate:e.reach>0?e.eng/e.reach*100:null,ctr:e.reach>0?e.clicks/e.reach*100:null,cvr:e.clicks>0?e.conv/e.clicks*100:null,small:e.n<5}))}
const csvq2=x=>`"${String(x==null?"":x).replace(/"/g,'""')}"`;
function pubCSV(s){return PUBCOLS.map(c=>c[1]).join(",")+"\n"+s.pubs.map(r=>PUBCOLS.map(c=>csvq2(r[c[0]]||"")).join(",")).join("\n")}
function tplCSV(s){return "渠道,編號,名稱,用途,格式,文案框架,須人類審核,已選\n"+TPLS.map(t=>[chName(t.ch),t.id,t.name,t.purpose,t.fmt,t.fw,t.hr?"是":"否",s.tplSel.includes(t.id)?"是":"否"].map(csvq2).join(",")).join("\n")}
const _checks=checks;
checks=function(s){const out=_checks(s),A=(l,m)=>out.push({level:l,msg:m});const sel=id=>has(s,id),rf=picked(s,"reviewFlow"),hr0=s.s0&&s.s0.claims;
  TPL_CHS.forEach(ch=>{if(s.channels.includes(ch)&&!s.tplSel.some(id=>(TPL_BY[id]||{}).ch===ch))A("warn",`已選渠道「${chName(ch)}」，但還沒有選任何模板；AI Agent 與人類沒有模板可套用。`)});
  s.tplSel.forEach(id=>{const t=TPL_BY[id];if(!t)return;if(!s.channels.includes(t.ch))A("info",`模板「${t.id} ${t.name}」所屬渠道「${chName(t.ch)}」沒有被選用。`);if(t.hr){if(!rf||rf.id!=="rf_comp")A("warn",`選了高風險模板「${t.id} ${t.name}」，但審稿流程不是『第二人審稿＋人類合規審核』。`);t.claims.forEach(cl=>{if(!sel(cl))A("warn",`模板「${t.id}」會涉及「${anyName(cl)}」，但宣稱類型沒有勾選。`)})}});
  if(sel("ch_xhs")&&hr0)A("warn","小紅書：社區規範限制高風險內容（如醫美整形、醫療器械）的售賣與推廣，並不鼓勵營銷導流；業務涉及健康或美容時，內容與合作須先人類合規審核並核對平台最新規則。");
  if(sel("ch_xhs")&&!sel("ds_coop")&&(sel("ch_kol")||sel("as_kol")))A("warn","小紅書合作內容須標示商業合作；披露項目沒有『商業合作披露』。");
  if(sel("ch_x")&&(sel("ch_kol")||sel("as_kol"))&&hr0)A("warn","X：Paid Partnership 標籤通常不適用於健康與保健、減重、藥物等類別，個別須向 X 申請；KOL 合作貼文發布前請先向 X 確認。");
  if(sel("ch_x")&&!sel("ds_coop")&&(sel("ch_kol")||sel("as_kol")))A("warn","X 的商業合作須用 Paid Partnership 標籤（只寫內文不算）；披露項目沒有『商業合作披露』。");
  if(sel("ch_tt")&&!(sel("ds_ad")||sel("ds_coop")))A("info","TikTok：推廣品牌（包括自己的）須開啟 Disclose commercial content；披露項目沒有『廣告／贊助標示』或『商業合作披露』。");
  if(sel("TT-07")&&hr0)A("warn","已選 TikTok 前後對比（高風險），而業務涉及健康：建議不做；平台對健康失實資訊有嚴格規則。");
  if(sel("ch_seo")&&(s.s0&&s.s0.languages&&s.s0.languages.length>=2))A("info","Website SEO：品牌用多於一種語言；多語言網址結構與 hreflang 標示本模板庫沒有涵蓋（未經查證），請核對 Google Search Central 說明。");
  if(sel("ch_seo")&&sel("cl_health"))A("info","Website SEO：健康內容頁須署名作者與資歷、引用來源與日期，不可變成醫療建議。");
  if(sel("ch_seo")&&!sel("ch_web"))A("info","已選 Website SEO，但沒有選『網站與落地頁』；頁面元件請沿用 4E。");
  // v3 新渠道
  if(sel("ch_fb"))A("info","Facebook：Meta 沒有公布自然發佈（相片、Reels、Story）的安全區與動態消息相片尺寸；模板用廣告指引（頂 14%、底 35%、側 6%）與常見尺寸作起點，請以 Meta 最新說明為準。");
  if(sel("ch_fb")&&(sel("ch_kol")||sel("as_kol"))&&!sel("ds_coop"))A("warn","Facebook 的商業合作須用 Meta 的標示工具；披露項目沒有『商業合作披露』。");
  if(sel("ch_yt")&&(sel("ch_kol")||sel("as_kol"))&&!sel("ds_coop"))A("warn","YouTube 的付費宣傳須按平台設定披露；披露項目沒有『商業合作披露』。");
  if(sel("ch_yt")&&hr0)A("info","YouTube：業務涉及健康，影片與說明欄不可作未證實的治療或預防宣稱，專家回答須專業人士審閱。");
  if(sel("ch_yt")&&sel("YT-01"))A("info","YouTube Shorts 時長上限資料來源不一致（60 秒或 3 分鐘），請以 YouTube 最新說明確認再定稿。");
  if(sel("ch_li")&&sel("LI-02"))A("info","LinkedIn 文件 Carousel 是 PDF：PDF 標籤、閱讀順序與語言見 4G；公司主頁字數上限說法不一，請在發文框實測。");
  if(sel("ch_li")&&sel("LI-04")&&!sel("cl_testi"))A("warn","LinkedIn 案例分享涉及客戶見證，但宣稱類型沒有勾選『客人見證』。");
  if(sel("ch_wa")){if(!sel("ds_data"))A("warn","WhatsApp：須有收件人的 opt-in（須講明是你的品牌）與個人資料收集聲明；披露項目沒有『個人資料收集聲明』。");A("info","WhatsApp：主動發起須用 Meta 核准的訊息範本（Marketing／Utility／Authentication）；客人來信後 24 小時內可自由回覆；《非應邀電子訊息條例》（第 593 章）對 WhatsApp 的適用性須專業人士確認。");if(sel("WA-05")||sel("WA-06")){if(!rf||rf.id!=="rf_comp")A("warn","已選 WhatsApp Marketing 模板，但審稿流程不是人類合規審核。")}if(!sel("WA-08")&&(sel("WA-05")||sel("WA-06")))A("warn","有 WhatsApp 推廣訊息，但沒有選『退訂確認』模板；必須及時處理退訂並停止同類訊息。")}
  if(sel("ch_edm")){if(!sel("ds_data"))A("warn","EDM：須有個人資料收集聲明；披露項目沒有『個人資料收集聲明』。");A("info","EDM（《非應邀電子訊息條例》第 593 章）：商業電子訊息須有寄件人名稱、地址、聯絡電話（電郵另須聯絡電郵）、顯眼的退訂說明與方式；收到退訂後 10 個工作天內停止寄送。這是提醒，不是法律意見。");if(s.tplSel.some(id=>/^EDM/.test(id))&&!T_(s,"disc_text"))A("info","已選 EDM 模板，但『條款與披露』欄位是空的；請準備頁尾（寄件人資料與退訂）。")}
  const s1=s.s1;if(sel("mp_expert")&&(sel("as_promo")||sel("tp_promo")))A("warn","市場定位是『高端專家』，但選了促銷策略或優惠推廣模板；折扣與倒數容易損害專家與高端感。");
  if(sel("mp_value")&&s1&&s1.anti&&s1.anti.some(x=>/廉價/.test(x)))A("warn","Stage 1 要避免廉價促銷感，但市場定位選了『親民值得』；請確認訊息是透明價格而不是低價促銷。");
  if(sel("mp_func")&&!sel("cl_health")&&hr0)A("info","市場定位『功能極致』涉及功效宣稱；業務涉及健康時，宣稱類型建議勾選『健康或療效宣稱』並由專業人士審核。");
  if(sel("mp_sus")&&!sel("cl_green"))A("info","市場定位『可持續責任』涉及環保宣稱，宣稱類型建議勾選『環保宣稱』並保存證據。");
  if(sel("vs_ba")&&!sel("cl_ba"))A("warn","影片策略選了前後對比，但宣稱類型沒有勾選『前後對比』。");if(sel("vs_testi")&&!sel("cl_testi"))A("warn","影片策略選了客人見證，但宣稱類型沒有勾選『客人見證』。");
  if(sel("vs_live"))A("info","直播屬即時內容，難以事前審核：須預先定好可說與不可說的清單，並安排審核者在場。");if(sel("vs_ugc"))A("info","UGC 徵集須取得內容使用授權與肖像同意，並列入授權登記（見 4G）。");
  if(sel("as_kol")&&!sel("ds_coop"))A("warn","廣告策略選了 KOL 合作，但披露項目沒有『商業合作披露』。");if(sel("as_retarget")&&!sel("tg_retarget"))A("info","廣告策略選了再行銷，受眾策略建議勾選『再行銷』並確認私隱與同意。");
  if(sel("as_msg")&&!sel("ds_data"))A("warn","廣告策略含電郵／WhatsApp，但沒有『個人資料收集聲明』。");
  if(sel("ls_compare")&&!sel("cl_compare"))A("warn","排版策略選了比較表，但宣稱類型沒有勾選『比較廣告』。");if(sel("ls_data"))A("info","數據圖表須有標題、單位、來源與日期。");if(sel("ls_port"))A("info","作品集須確認作品與肖像授權（見 4G）。");
  pubIssues(s).forEach(x=>out.push(x));
  return out};
const _completeness=completeness;
completeness=function(s){const c=_completeness(s);const cover=TPL_CHS.filter(ch=>s.channels.includes(ch));const extra=[["tplcov","每個選定的主要渠道至少有 1 個模板",cover.length>0&&cover.every(ch=>s.tplSel.some(id=>(TPL_BY[id]||{}).ch===ch))],["strat2","市場定位與影片／排版／廣告策略",count("positioning",s)>=1&&count("videoStrategy",s)>=1&&count("layoutStrategy",s)>=1&&count("adStrategy",s)>=1],["publog","發佈與成效紀錄（至少 1 筆）",s.pubs.length>=1]];const done=c.done+extra.filter(x=>x[2]).length,total=c.total+extra.length;return {done,total,pct:Math.round(done/total*100),missing:[...c.missing,...extra.filter(x=>!x[2]).map(x=>({key:x[0],label:x[1]}))]}};
const _buildBrief=buildBrief;
buildBrief=function(s){const b=_buildBrief(s);const pk=k=>items(k,s).map(i=>({id:i.id,name:i.zh,note:i.desc}));b.schema="brand/stage4f-marketing/v3";
  b.market_strategy={positioning:pk("positioning"),video_strategy:pk("videoStrategy"),layout_strategy:pk("layoutStrategy"),ad_strategy:pk("adStrategy")};
  b.templates_selected=pk("tplSel");b.selected_templates=selTpls(s);b.template_library_summary={total:TPLS.length,channels:TPL_CHS.map(ch=>({id:ch,name:chName(ch),count:TPLS.filter(t=>t.ch===ch).length,selected:s.tplSel.filter(id=>(TPL_BY[id]||{}).ch===ch).length}))};
  b.publish_log=s.pubs;b.publish_summary=pubSummary(s);b.template_prompts_md=tplPromptsMD(s);b.template_library_md=tplLibMD();
  b.agent_rules=[...b.agent_rules,"只可使用 selected_templates 中的模板生成內容；選模板時按渠道、目標、漏斗與風險；高風險模板（hr=true）輸出必須標示 needs_human_review=true，不可自動發布。","模板欄位以外的內容不可自行加入宣稱、價格、見證或獎項；不確定的資料寫入 assumptions，不可編造。","WhatsApp 與 EDM 訊息不可發給沒有 opt-in 的人；EDM 頁尾須有寄件人資料與退訂方式；WhatsApp 窗外只可用核准範本。","平台規格與政策以最新說明為準；模板庫的數字只是起點。"];return b};
const _normalizeBrief=normalizeBrief;
normalizeBrief=function(j){const o=_normalizeBrief(j);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4f")||o===j)return o;const n=a=>(a||[]).map(x=>x.name),ms=j.market_strategy||{};o.positioning=n(ms.positioning);o.videoStrategy=n(ms.video_strategy);o.layoutStrategy=n(ms.layout_strategy);o.adStrategy=n(ms.ad_strategy);o.tplSel=(j.templates_selected||[]).map(x=>x.id||x.name);o.pubs=j.publish_log;return o};
const _buildSystem=buildSystem;
buildSystem=function(s){const L=selTpls(s);return _buildSystem(s)+`\n\n【模板庫】已選模板：${L.map(t=>t.id+"("+t.name+(t.hr?"，高風險":"")+")").join("、")||"（無）"}。\n9) 生成內容前先按渠道、目標、漏斗選一個已選模板；按模板的結構與欄位填寫，輸出 JSON；高風險模板的輸出一律 needs_human_review=true，不可自動發布。\n10) WhatsApp 與 EDM 只可發給已 opt-in 的人；EDM 頁尾必須有寄件人名稱、地址、電話、電郵與退訂說明；WhatsApp 窗外只可用 Meta 核准的範本；不確定時回報人類。\n11) 平台規格（尺寸、字數、安全區、披露標籤）以最新平台說明為準；模板庫的數字只是起點，不可當作承諾。`};
const _ctxMkt=ctxMkt;
ctxMkt=function(s){return _ctxMkt(s)+`\n策略：市場定位 ${labels("positioning",s).join("、")||"（未選）"}｜影片策略 ${labels("videoStrategy",s).join("、")||"（未選）"}｜排版策略 ${labels("layoutStrategy",s).join("、")||"（未選）"}｜廣告策略 ${labels("adStrategy",s).join("、")||"（未選）"}\n已選模板：${selTpls(s).map(t=>t.id+" "+t.name).join("、")||"（未選）"}`};
const _hints=hints;
hints=function(s){const H=_hints(s);H.push({stage:"4G 跨媒體使用與治理",field:"模板庫與核准",text:"把 template-library 的模板編號與版本登記進模板庫，標示高風險模板須核准；發佈與成效紀錄定期回看，並寫回模板（改版升版本）；WhatsApp／EDM 的 opt-in 與退訂紀錄須保存",why:"模板與成效回饋"});H.push({stage:"4H 風格庫與 AI 生成契約",field:"模板與 AI 契約",text:"AI 只可從已選模板生成；高風險模板輸出須 needs_human_review；把 selected_templates 放入 AI 契約的使用情境與守門評估集",why:"AI 生成守門"});return H};
