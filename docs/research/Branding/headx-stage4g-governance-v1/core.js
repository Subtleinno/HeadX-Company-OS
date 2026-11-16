
const KEY="brand_stage4g_v1";
const BK={s0:"brand_brief_stage0",s1:"brand_brief_stage1",s2:"brand_brief_stage2",s3:"brand_brief_stage3",s4a:"brand_brief_stage4a",s4b:"brand_brief_stage4b",s4c:"brand_brief_stage4c",s4d:"brand_brief_stage4d",s4e:"brand_brief_stage4e",s4f:"brand_brief_stage4f"};
const norm=t=>String(t||"").replace(/\s+/g,"").toLowerCase();
const emptyState=()=>{const s={s0:null,s1:null,s2:null,s3:null,s4a:null,s4b:null,s4c:null,s4d:null,s4e:null,s4f:null,dims:{},text:{},reg:[],lic:[],exc:[],cwm:{},ctxOff:{},cwnote:{},tpm:{},raci:{},custom:{}};CAT_KEYS.forEach(k=>{s[k]=[];s.custom[k]=[]});return s};
function load(){let s=emptyState();try{const r=JSON.parse(localStorage.getItem(KEY)||"null");if(r){const e=emptyState();s=Object.assign(e,r);s.custom=Object.assign(e.custom,r.custom||{});["dims","text","cwm","ctxOff","cwnote","tpm","raci"].forEach(k=>s[k]=r[k]||{});["reg","lic","exc"].forEach(k=>s[k]=Array.isArray(r[k])?r[k]:[]);CAT_KEYS.forEach(k=>{if(!Array.isArray(s[k]))s[k]=[];if(!Array.isArray(s.custom[k]))s.custom[k]=[]})}}catch(x){}return autoImport(s)}
function autoImport(s){Object.keys(BK).forEach(n=>{if(s[n])return;try{const raw=localStorage.getItem(BK[n]);if(raw){const p=PARSE[n](raw);if(p){s[n]=p;if(n==="s4a"&&p.brand)setIf(s,"brandName",p.brand)}}}catch(x){}});return s}
function setIf(s,k,v){if(v!=null&&String(v).trim()&&!String(s.text[k]||"").trim())s.text[k]=String(v)}
function save(s){try{localStorage.setItem(KEY,JSON.stringify(s))}catch(x){}}
const flat=k=>CAT[k].groups.flatMap(g=>g.items);
const byId=(k,id)=>flat(k).find(i=>i.id===id);
const labels=(k,s)=>[...s[k].map(id=>(byId(k,id)||{zh:id}).zh),...s.custom[k]];
const items=(k,s)=>[...s[k].map(id=>byId(k,id)||{id,zh:id,desc:"",t:[],conf:[],risk:false,pro:false,note:"",n1:0,n2:0}),...s.custom[k].map(t=>({id:"custom",zh:t,desc:"（自訂）",t:[],conf:[],risk:false,pro:false,note:"",n1:0,n2:0}))];
const count=(k,s)=>s[k].length+s.custom[k].length;
const has=(s,id)=>CAT_KEYS.some(k=>s[k].includes(id));
const anyName=id=>{for(const k of CAT_KEYS){const i=byId(k,id);if(i)return i.zh}return id};
const picked=(s,d)=>{const id=s.dims[d];return id?OPTD(d,id):null};
const T_=(s,id)=>String(s.text[id]||"").trim();
const num=(s,id,d)=>{const v=parseFloat(T_(s,id));return isFinite(v)?v:d};
const nameList=a=>(a||[]).map(x=>x&&x.name).filter(Boolean);
function J(t){try{return typeof t==="string"?JSON.parse(t):t}catch(e){return null}}
const brandName=s=>T_(s,"brandName")||(s.s1&&s.s1.name)||(s.s0&&s.s0.name)||"品牌";
const esc=t=>String(t==null?"":t).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
const csvq=x=>`"${String(x==null?"":x).replace(/"/g,'""')}"`;

// ---------- 前階段匯入 ----------
function parseS0(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage0"))return null;const ch=j.choices||{},sel=j.selections||{},d=j.derived||{};return {name:(j.text||{}).trading||(j.text||{}).legalZh||"",budget:(ch.brandBudget||{}).name||"",industry:nameList(sel.industry),delivery:nameList(sel.delivery),languages:nameList(sel.languages),flags:d.flags||[],claims:!!d.claims_risk}}
function parseS1(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage1"))return null;return {name:j.brand_name||"",statement:(j.positioning_statement||{}).text||"",anti:nameList(j.anti_persona)}}
function parseS2(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage2"))return null;return {statement:(j.sensory_statement||{}).text||""}}
function parseS3(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage3"))return null;return {statement:(j.voice_statement||{}).text||"",script:((j.language_rules||{}).script||{}).name||""}}
function parseS4a(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4a"))return null;return {brand:j.brand_name||"",statement:(j.visual_statement||{}).text||"",avoid:nameList(j.visual_avoid),palette:(j.color||{}).palette||{}}}
function parseS4b(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4b"))return null;const co=j.color_output||{},fin=j.finishes||{};return {statement:(j.surface_statement||{}).text||"",colors:(co.colors||[]).map(c=>({role:c.role,hex:c.hex,cmyk:c.cmyk_proofed||"",pms:c.pantone||"",status:c.status||"未打樣"})),cmykPolicy:(co.cmyk_policy||{}).name||"",outputs:nameList(co.outputs),bleed:(co.bleed||{}).name||"",tac:(co.tac||{}).name||"",colorways:(j.colorways||[]).map(c=>({id:c.id,name:c.name,bg:c.background,fg:c.foreground,ac:c.accent,tr:c.text_contrast,ar:c.accent_contrast})),processes:nameList(fin.processes),minLines:(((fin.print_spec||{}).processes)||[]).map(p=>({name:p.name,min:p.min_line_mm})),avoid:nameList(j.surface_avoid)}}
function parseS4c(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4c"))return null;const sd=j.sound||{};return {statement:(j.statement||{}).text||"",licSources:nameList((sd.licensing||{}).sources),voice:nameList((sd.voice||{}).types),captions:(((j.video||{}).captions||{}).style||{}).name||"",music:nameList(sd.music)}}
function parseS4d(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4d"))return null;const p=j.product||{},cmf=p.cmf||{};return {statement:(j.statement||{}).text||"",cmfApproval:(cmf.approval||{}).name||"",light:(cmf.light_source||{}).name||"",compliance:nameList(p.compliance),materials:nameList(p.materials)}}
function parseS4e(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4e"))return null;return {statement:(j.statement||{}).text||"",a11yTarget:((j.ui||{}).a11y_target||{}).name||"",tests:nameList(j.a11y_tests)}}
function parseS4f(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4f"))return null;const tr=j.template_rules||{},co=j.compliance||{};return {statement:(j.statement||{}).text||"",channels:nameList((j.channels||{}).selected),claims:nameList(co.claims),review:(co.review_flow||{}).name||"",fonts:tr.fonts||{},disclosures:nameList(co.disclosures)}}
const PARSE={s0:parseS0,s1:parseS1,s2:parseS2,s3:parseS3,s4a:parseS4a,s4b:parseS4b,s4c:parseS4c,s4d:parseS4d,s4e:parseS4e,s4f:parseS4f};
function importBrief(text,s){const j=J(text);if(!j||typeof j.schema!=="string")return null;const m=j.schema.match(/^brand\/stage(\d)([abcdef]?)/);if(!m)return null;const k="s"+m[1]+m[2];if(!PARSE[k])return null;const p=PARSE[k](j);if(!p)return null;s[k]=p;if(k==="s4a"&&p.brand)setIf(s,"brandName",p.brand);try{localStorage.setItem(BK[k],JSON.stringify(j))}catch(e){}return k}
function ctxStages(s){const a=[];
  a.push(s.s0?`【Stage 0 業務】行業：${s.s0.industry.join("、")||"（無）"}｜交付：${s.s0.delivery.join("、")||"（無）"}｜語言：${s.s0.languages.join("、")||"（無）"}｜規管提示：${s.s0.flags.join("、")||"（無）"}｜健康宣稱風險：${s.s0.claims?"有":"無"}`:"【Stage 0 業務】（尚未匯入）");
  a.push(s.s1?`【Stage 1 定位】${s.s1.statement||"（無）"}｜絕對不要像：${s.s1.anti.join("、")||"（無）"}`:"【Stage 1 定位】（尚未匯入）");
  a.push(s.s3?`【Stage 3 語言】${s.s3.statement||"（無）"}｜書寫語言：${s.s3.script||"（無）"}`:"【Stage 3 語言】（尚未匯入）");
  a.push(s.s4a?`【Stage 4A 視覺語言】${s.s4a.statement||"（無）"}｜視覺禁區：${s.s4a.avoid.join("、")||"（無）"}`:"【Stage 4A 視覺語言】（尚未匯入）");
  a.push(s.s4b?`【Stage 4B 表面系統】${s.s4b.statement||"（無）"}｜色彩輸出：${s.s4b.outputs.join("、")||"（無）"}｜CMYK 策略：${s.s4b.cmykPolicy||"（未定）"}｜TAC：${s.s4b.tac||"（未定）"}｜出血：${s.s4b.bleed||"（未定）"}｜工藝：${s.s4b.processes.join("、")||"（無）"}｜配色變體：${s.s4b.colorways.map(c=>c.name).join("、")||"（無）"}｜色彩登記：${s.s4b.colors.map(c=>c.role+" "+c.hex+"（"+c.status+"）").join("；")||"（無）"}`:"【Stage 4B 表面系統】（尚未匯入）");
  a.push(s.s4c?`【Stage 4C 動態影片】${s.s4c.statement||"（無）"}｜音樂授權來源：${s.s4c.licSources.join("、")||"（無）"}｜旁白：${s.s4c.voice.join("、")||"（無）"}｜字幕：${s.s4c.captions||"（未定）"}`:"【Stage 4C 動態影片】（尚未匯入）");
  a.push(s.s4d?`【Stage 4D 3D 與產品】${s.s4d.statement||"（無）"}｜CMF 核准：${s.s4d.cmfApproval||"（未定）"}｜光源：${s.s4d.light||"（未定）"}`:"【Stage 4D 3D 與產品】（尚未匯入）");
  a.push(s.s4e?`【Stage 4E UI／UX 與空間】${s.s4e.statement||"（無）"}｜無障礙目標：${s.s4e.a11yTarget||"（未定）"}｜測試：${s.s4e.tests.join("、")||"（無）"}`:"【Stage 4E UI／UX 與空間】（尚未匯入）");
  a.push(s.s4f?`【Stage 4F 行銷】${s.s4f.statement||"（無）"}｜渠道：${s.s4f.channels.join("、")||"（無）"}｜宣稱：${s.s4f.claims.join("、")||"（無）"}｜審稿：${s.s4f.review||"（未定）"}｜字體：${(s.s4f.fonts.head||"")+"／"+(s.s4f.fonts.body||"")}`:"【Stage 4F 行銷】（尚未匯入）");
  return a.join("\n")}
function ctxGov(s){const L=k=>labels(k,s).join("、")||"（尚未選擇）",P=d=>{const o=picked(s,d);return o?o.zh:"（尚未選擇）"},X=id=>T_(s,id)||"（尚未填寫）";
  return [`媒體：${L("media")}｜觸點：${L("touchpoints")}｜檔案格式：${L("fileFormats")}｜分發：${L("distribution")}`,
  `配色變體 × 場景：${cwNames(s).map(n=>n+"["+CTX.map(c=>(cwCell(s,n,c.id)||"-")).join("")+"]").join("；")||"（尚未定義）"}（A 允許、C 有條件、X 禁止、- 未定；順序：${CTX.map(c=>c.zh).join("、")}）`,
  `打樣登記：${s.reg.length} 筆（已核准 ${s.reg.filter(r=>r.status==="已核准").length}）｜有效期 ${P("proofValidity")}｜核准模式 ${P("approvalMode")}`,
  `授權登記：${s.lic.length} 筆｜到期提醒 ${P("licenseWarn")}｜資產類型 ${L("licenseTypes")}`,`標誌：最小 ${X("lm_px")}px／${X("lm_mm")}mm｜留白 ${P("logoClear")}（${X("lc_note")}）｜禁用 ${L("prohibited")}`,
  `無障礙：${L("a11yUse")}｜命名：${P("namePattern")}｜版本：${P("versionScheme")}`,`治理：負責人 ${X("owner")}｜稽核 ${L("audit")}（${P("reviewCadence")}）｜例外上限 ${P("exceptionMax")}｜例外 ${s.exc.length} 筆`,`禁區：${L("avoidGov")}`].join("\n")}

// ---------- 日期 ----------
function pdate(str){const m=String(str||"").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));if(d.getUTCFullYear()!==+m[1]||d.getUTCMonth()!==+m[2]-1||d.getUTCDate()!==+m[3])return null;return d}
const todayUTC=()=>{const n=new Date();return new Date(Date.UTC(n.getFullYear(),n.getMonth(),n.getDate()))};
const daysTo=d=>Math.round((d-todayUTC())/86400000);
function addMonths(d,m){const x=new Date(d.getTime());x.setUTCMonth(x.getUTCMonth()+m);return x}
const fmtD=d=>d?d.toISOString().slice(0,10):"";
function proofMonths(s){const o=picked(s,"proofValidity");return o?parseFloat(o.tok["--months"]):null}
function proofInfo(s,r){const d=pdate(r.date),mo=proofMonths(s);let exp=null,left=null,state=r.status||"未打樣";if(d&&mo>0){exp=addMonths(d,mo);left=daysTo(exp);if(r.status==="已核准"&&left<0)state="已過期／待重新核准"}return {date:d,exp,left,state}}
function licInfo(s,r){const d=pdate(r.expiry);const w=picked(s,"licenseWarn"),warn=w?parseFloat(w.tok["--days"]):60;if(!r.expiry)return {state:"未填到期日",left:null,d:null};if(!d)return {state:"日期格式錯誤",left:null,d:null};const left=daysTo(d);return {state:left<0?"已過期":left<=warn?"即將到期":"有效",left,d}}

// ---------- 配色變體矩陣 ----------
const DEFCW=["預設彩色","深底反白","單色黑","單色白","灰階","高對比","照片上","深色模式"];
function cwNames(s){return s.s4b&&s.s4b.colorways.length?s.s4b.colorways.map(c=>c.name):DEFCW}
function cwInfo(s,name){const c=s.s4b&&s.s4b.colorways.find(x=>x.name===name);return c||null}
function cwCell(s,name,ctx){return ((s.cwm[name]||{})[ctx])||""}
function suggestCW(name){const n=String(name),o={};const set=(a,v)=>a.forEach(x=>o[x]=v);
  if(/單色黑|黑色單色|mono.?black/i.test(n)){set(["web","mono","spot","emb","cmyk","social","pack","stamp"],"A");set(["dark","photo","video"],"X");set(["ooh"],"C")}
  else if(/單色白|白色單色|mono.?white/i.test(n)){set(["dark","photo","video","emb"],"A");set(["web","mono","spot","stamp","cmyk"],"X");set(["pack","ooh","social"],"C")}
  else if(/灰階|gray|grey/i.test(n)){set(["mono","stamp","web"],"A");set(["spot","emb","dark","photo"],"X");set(["cmyk","social","pack"],"C")}
  else if(/高對比|high.?contrast/i.test(n)){set(["web","dark","ooh","social"],"A");set(["photo","video","pack","cmyk"],"C")}
  else if(/照片/.test(n)){set(["photo","video","social"],"A");set(["web","mono","spot","emb","stamp"],"X");set(["dark","cmyk","pack","ooh"],"C")}
  else if(/深色|dark/i.test(n)){set(["dark","video","social"],"A");set(["web","mono","stamp"],"X");set(["photo","cmyk","pack","ooh"],"C")}
  else if(/反白|reverse/i.test(n)){set(["dark","video","pack","ooh","social"],"A");set(["photo","emb","cmyk"],"C");set(["web","mono","stamp"],"X")}
  else if(/子品牌|限定|sub/i.test(n)){CTX.forEach(c=>o[c.id]="C")}
  else{set(["web","cmyk","social","pack","ooh","video"],"A");set(["photo","dark","spot","emb"],"C");set(["mono","stamp"],"X")}
  return o}
function matrixCSV(s){const names=cwNames(s);return ["配色變體,"+CTX.map(c=>c.zh+(s.ctxOff[c.id]?"（不適用）":"")).join(",")+",條件與備註",...names.map(n=>[csvq(n),...CTX.map(c=>csvq(CWSTATE[cwCell(s,n,c.id)]||"未定")),csvq(s.cwnote[n]||"")].join(","))].join("\n")}

// ---------- 觸點 ----------
const tpmRow=(s,id)=>Object.assign({fmt:"",size:"",cw:"",owner:"",appr:"",note:""},s.tpm[id]||{});
function tpmCSV(s){return "觸點,格式,尺寸／規格,配色變體,負責人,是否需核准,授權與限制,常見起點（供參考）\n"+items("touchpoints",s).map(i=>{const r=tpmRow(s,i.id);return [i.zh,r.fmt,r.size,r.cw,r.owner,r.appr,r.note,i.note+(i.n1?`（${i.n1}×${i.n2}）`:"")].map(csvq).join(",")}).join("\n")}

// ---------- RACI ----------
const racCell=(s,a,r)=>((s.raci[a]||{})[r])||"";
function raciIssues(s){const out=[];ACTS.forEach(a=>{const row=ROLES.map(r=>racCell(s,a,r));const filled=row.some(x=>x);if(!filled)return;const A=row.filter(x=>x==="A").length,Rr=row.filter(x=>x==="R").length;if(A!==1)out.push({act:a,msg:A===0?"沒有 A（最終負責人）":`有 ${A} 個 A，應只有 1 個`});if(Rr<1)out.push({act:a,msg:"沒有 R（執行者）"})});return out}
function raciCSV(s){return "活動,"+ROLES.join(",")+"\n"+ACTS.map(a=>[csvq(a),...ROLES.map(r=>csvq(racCell(s,a,r)))].join(",")).join("\n")}

// ---------- 命名 ----------
const SLUG=t=>String(t||"").trim().toLowerCase().replace(/[^a-z0-9._\-]+/g,"-").replace(/^-+|-+$/g,"");
function genName(s){const p=picked(s,"namePattern");if(!p)return "";const g=id=>SLUG(T_(s,id));const parts=[g("n_brand"),g("n_asset"),g("n_variant"),g("n_size"),"v"+g("n_ver").replace(/^v/,"")];if(p.id==="np_b")parts.push(g("n_date"));return parts.filter(Boolean).join("_")+"."+(g("n_ext")||"ext")}
function badName(n){const p=[];if(/\s/.test(n))p.push("有空格");if(/[A-Z]/.test(n))p.push("有大寫");if(/[()（）]/.test(n))p.push("有括號");if(/final|copy|副本|最新|新版|最終|new|v?\d+\s*final/i.test(n))p.push("含 final／最新／copy 等不明確字眼");if(/[^\x00-\x7F]/.test(n))p.push("含非英文字元（跨系統與供應商可能出問題）");if(!/\.[a-z0-9]{2,5}$/i.test(n))p.push("沒有副檔名");if(!/v\d/.test(n)&&!/\d{8}/.test(n))p.push("沒有版本號或日期");return p}
function nameScan(s){return String(s.text.file_samples||"").split(/\n+/).map(x=>x.trim()).filter(Boolean).map(n=>({name:n,issues:badName(n)}))}

// ---------- 檢查 ----------
function checks(s){
  const out=[],A=(l,m)=>out.push({level:l,msg:m});const sel=id=>has(s,id);
  CAT_KEYS.forEach(k=>{if(CAT[k].max<90&&count(k,s)>CAT[k].max)A("warn",`「${CAT[k].title.replace(/（.*/,"")}」選了 ${count(k,s)} 個，超過建議的 ${CAT[k].max} 個。`)});
  if(count("prohibited",s)>0&&count("prohibited",s)<8)A("info","禁用與誤用建議至少 8 個，並為每個準備錯誤示範與正確做法。");if(count("avoidGov",s)>0&&count("avoidGov",s)<5)A("info","治理禁區建議至少 5 個。");
  if(!T_(s,"owner"))A("warn","沒有填『品牌資產負責人』：沒有一個人負責，治理規則不會被執行。");
  // 打樣登記
  const pv=picked(s,"proofValidity"),am=picked(s,"approvalMode");
  if(!pv)A("warn","還沒決定色彩打樣有效期（或以事件觸發重新打樣）。");
  if(!s.reg.length&&(sel("md_print")||sel("md_pack")||sel("md_uniform")||sel("md_product")||(s.s4b&&s.s4b.outputs.some(x=>/CMYK|專色|CMF/.test(x)))))A("warn","有印刷、包裝、制服或產品，但打樣登記冊是空的；沒有登記，就沒有『已核准』這回事。");
  s.reg.forEach((r,i)=>{const nm=r.item||("第 "+(i+1)+" 筆");const pi=proofInfo(s,r);
    if(r.date&&!pi.date)A("warn",`打樣登記「${nm}」：日期格式要用 YYYY-MM-DD。`);if(pi.date&&daysTo(pi.date)>0)A("error",`打樣登記「${nm}」：打樣日期在未來（${r.date}）。`);
    if(r.status==="已核准"){const miss=[];if(!r.approver)miss.push("核准者");if(!r.date)miss.push("打樣日期");if(!r.printer)miss.push("印刷廠／供應商");if(!r.book)miss.push("色票或 ICC 版本");if(!r.spec)miss.push("色彩規格");if(miss.length)A("warn",`打樣登記「${nm}」：狀態是已核准，但缺少 ${miss.join("、")}。`);if(r.printer&&!r.jobv)A("warn",`打樣登記「${nm}」：有印刷廠但沒有工單或版本；之後無法追溯是哪一次打樣。`)}
    if(/pantone|pms|專色/i.test(r.spec||"")&&!r.book)A("warn",`打樣登記「${nm}」：有專色但沒有登記色票版本（同一個編號在不同色票版本可能有差異，須註明）。`);
    if(/cmyk/i.test(r.spec||"")&&!r.printer&&r.status==="已核准")A("warn",`打樣登記「${nm}」：CMYK 值已核准，但沒有登記由哪個印刷廠、哪種紙張打樣；CMYK 不是通用值。`);
    if(pi.state==="已過期／待重新核准"&&r.status==="已核准")A("warn",`打樣登記「${nm}」：核准已超過有效期（${fmtD(pi.exp)}），須重新確認或重新打樣。`);else if(pi.left!=null&&pi.left>=0&&pi.left<=60&&r.status==="已核准")A("info",`打樣登記「${nm}」：核准將於 ${pi.left} 天後到期。`);
    if(r.status==="打樣未通過")A("info",`打樣登記「${nm}」：打樣未通過，須跟進調整並重新打樣。`)});
  if(s.reg.length&&am&&am.id!=="am_single"&&s.reg.some(r=>r.approver&&r.approver===T_(s,"owner")&&false))A("info","");
  if(s.s4b){if(/自動近似|草稿|naive/i.test(s.s4b.cmykPolicy)&&!s.reg.some(r=>r.status==="已核准"))A("warn","4B 的 CMYK 策略仍是自動近似值，但這裡沒有任何已核准的打樣；近似值不可作為官方印刷色。");
    s.s4b.colors.forEach(c=>{if(c.status==="已打樣核准"&&!s.reg.some(r=>(r.item||"").includes(c.role)||(r.spec||"").toUpperCase().includes((c.hex||"").toUpperCase())))A("info",`4B 把「${c.role}（${c.hex}）」標為已打樣核准，但打樣登記冊裡沒有對應紀錄。`)})}
  if(s.s4d&&/已核准/.test(s.s4d.cmfApproval)&&!s.reg.length)A("info","4D 的 CMF 已核准，但打樣登記冊是空的；請把色樣編號、光源與核准者登記進來。");
  if(s.s4d&&s.s4d.cmfApproval&&!/已核准/.test(s.s4d.cmfApproval)&&s.reg.some(r=>r.status==="已核准"&&/產品|CMF|塑|金屬/.test(r.item||"")))A("info","打樣登記有產品色彩已核准，但 4D 的 CMF 狀態未標為已核准，請核對。");
  // 配色變體矩陣
  const names=cwNames(s);
  if(!s.s4b)A("info","尚未匯入 4B：配色變體使用預設名稱清單，沒有對比數據。");
  const used=CTX.filter(c=>!s.ctxOff[c.id]);
  const anyDef=names.some(n=>CTX.some(c=>cwCell(s,n,c.id)));
  if(!anyDef)A("warn","配色變體 × 場景矩陣還沒有任何設定；可用『套用建議』作起點，再逐格由人類決定。");
  else{used.forEach(c=>{if(!names.some(n=>cwCell(s,n,c.id)==="A")){A("warn",`場景「${c.zh}」沒有任何『允許』的配色變體；使用者會自己決定，結果不可控。若不適用請取消勾選。`)}});
    names.forEach(n=>{const ci=cwInfo(s,n);const row=CTX.map(c=>cwCell(s,n,c.id));if(!row.some(x=>x))A("info",`配色變體「${n}」在所有場景都未定義。`);
      if(ci&&ci.tr!=null&&ci.tr<4.5){const bad=CTX.filter(c=>c.text&&cwCell(s,n,c.id)==="A");if(bad.length)A("warn",`配色變體「${n}」的文字對比只有約 ${ci.tr}:1（低於 4.5:1），但在 ${bad.map(c=>c.zh).join("、")} 被設為『允許』；請改為禁止或有條件。`)}
      if(ci&&ci.ar!=null&&ci.ar<3){const bad=CTX.filter(c=>c.text&&cwCell(s,n,c.id)==="A");if(bad.length)A("info",`配色變體「${n}」的強調色對比約 ${ci.ar}:1（低於 3:1），在文字場景使用時須避免只靠強調色傳達資訊。`)}
      if(/單色黑/.test(n)&&(cwCell(s,n,"dark")==="A"||cwCell(s,n,"photo")==="A"))A("warn",`「${n}」在深色或照片場景被設為允許：黑色標誌在深底上幾乎看不見。`);
      if(/單色白/.test(n)&&(cwCell(s,n,"web")==="A"||cwCell(s,n,"mono")==="A"))A("warn",`「${n}」在淺色底或白紙單色印刷被設為允許：白色標誌在淺底上看不見。`);
      if(CTX.some(c=>cwCell(s,n,c.id)==="A"&&c.id==="photo")&&!/照片|反白|單色白|高對比/.test(n))A("info",`「${n}」被允許用在照片上：照片明暗不定，須有遮罩或固定位置並實測對比。`);
      if(/灰階/.test(n)&&cwCell(s,n,"spot")==="A")A("info","灰階在專色印刷被允許：專色印刷應直接用單色版，不是灰階轉換。")})
    if(used.some(c=>["cmyk","spot","mono"].includes(c.id))&&!names.some(n=>["cmyk","spot","mono"].some(id=>cwCell(s,n,id)==="A"))&&(sel("md_print")||sel("md_pack")))A("warn","有印刷或包裝，但全彩、專色與單色印刷都沒有允許的配色變體。")}
  // 觸點矩陣
  const tps=items("touchpoints",s);
  if(!tps.length)A("warn","還沒選觸點；沒有觸點矩陣，就不知道哪個物料誰負責、用哪個格式。");
  else{const noOwner=tps.filter(i=>!tpmRow(s,i.id).owner),noCw=tps.filter(i=>!tpmRow(s,i.id).cw),noAppr=tps.filter(i=>!tpmRow(s,i.id).appr);if(noOwner.length)A("warn",`觸點矩陣有 ${noOwner.length} 個觸點沒有負責人（如 ${noOwner.slice(0,3).map(i=>i.zh).join("、")}）。`);if(noCw.length)A("info",`觸點矩陣有 ${noCw.length} 個觸點沒有指定配色變體。`);if(noAppr.length&&noAppr.length===tps.length)A("info","觸點矩陣還沒有標示哪些觸點需要核准。");
    ["tpm_pack","tpm_label","tpm_sign","tpm_uniform"].forEach(id=>{if(sel(id)&&tpmRow(s,id).appr==="否")A("warn",`「${anyName(id)}」被標為不需核准；涉及印刷工藝、法規標示或安全的物料通常須核准。`)});
    cwNames(s).forEach(n=>{});tps.forEach(i=>{const r=tpmRow(s,i.id);if(r.cw&&!names.includes(r.cw)&&r.cw!=="（多個）")A("info",`觸點「${i.zh}」的配色變體「${r.cw}」不在 4B 配色變體清單中。`)})}
  if(s.s4f){const ch=s.s4f.channels.join("、");if(/Instagram|Facebook|TikTok|Threads|小紅書|LinkedIn/.test(ch)&&!(sel("tpm_post")||sel("tpm_avatar")))A("info","4F 有社群渠道，但觸點矩陣沒有社群貼文模板或頭像。");if(/EDM/.test(ch)&&!sel("tpm_edm"))A("info","4F 有 EDM，但觸點矩陣沒有 EDM 與電郵簽名。");if(/簡報/.test(ch)&&!sel("tpm_ppt"))A("info","4F 有簡報，但觸點矩陣沒有簡報。");if(/網站/.test(ch)&&!sel("tpm_web"))A("info","4F 有網站，但觸點矩陣沒有網站頁首與頁尾。");if(/印刷/.test(ch)&&!(sel("tpm_flyer")||sel("tpm_card")))A("info","4F 有印刷物與店內陳列，但觸點矩陣沒有單張或名片。")}
  // 媒體 vs 檔案格式
  if((sel("md_print")||sel("md_pack")||sel("md_uniform")||sel("md_ooh"))&&!sel("ff_pdf_vec"))A("warn","有印刷、包裝、制服或戶外，但檔案格式沒有向量母檔（印刷、刺繡與燙印需要向量）。");
  if(sel("md_print")&&!sel("ff_pdfx"))A("info","印刷品建議用印刷廠指定的 PDF/X 版本交付（PDF/X 是 ISO 15930 的印刷交換標準家族；PDF/X-1a 要求全 CMYK／專色並拍平透明，PDF/X-4 可保留透明與色彩管理；以印刷廠要求為準）。");
  if(sel("md_web")&&!sel("ff_svg"))A("info","網站建議提供 SVG 標誌（含深淺色版本）。");if(sel("md_video")&&!sel("ff_mp4"))A("info","有影片，但檔案格式沒有影片格式。");
  if(sel("ff_font")&&!sel("lt_font"))A("warn","檔案格式包含字體檔，但授權資產類型沒有字體；字體授權範圍通常分桌面、網頁、App、嵌入與廣告。");
  if(sel("ff_native")&&s.distribution.length===1&&sel("ds_cloud"))A("info","設計原始檔只用共享雲端分發：請限制編輯權限，並保留版本紀錄。");if(sel("ds_mail"))A("warn","用電郵附件分發品牌檔案容易產生多個版本；建議改用有版本與權限的方式。");
  if(sel("ff_gif"))A("info","動圖須避免每秒超過 3 次閃光，自動播放超過 5 秒須可暫停（見 4C）。");
  // 命名
  const ps=picked(s,"namePattern");if(!ps)A("info","還沒決定檔案命名模式與版本規則。");else{const g=genName(s);["n_brand","n_asset","n_variant","n_size","n_ver","n_ext"].forEach(id=>{if(!T_(s,id))A("info",`命名欄位 ${id} 還沒填，無法產生完整的範例檔名。`)});if(ps.id==="np_b"&&!T_(s,"n_date"))A("warn","命名模式含日期，但沒有填日期欄位。");const vs=picked(s,"versionScheme"),v=T_(s,"n_ver");if(vs&&v){if(vs.id==="vs_sem"&&!/^\d+\.\d+$/.test(v))A("warn",`版本規則是『主版本.次版本』，但版本欄位「${v}」不符。`);if(vs.id==="vs_date"&&!/^\d{8}$|^\d{4}-\d{2}-\d{2}$/.test(v))A("warn",`版本規則是日期版本，但版本欄位「${v}」不符。`)}}
  const ns=nameScan(s).filter(x=>x.issues.length);if(ns.length)A("warn",`檔案名稱樣本有 ${ns.length} 個有問題（例如「${ns[0].name}」：${ns[0].issues.join("、")}）。`);
  // 標誌規則
  if(!T_(s,"lm_px")&&!T_(s,"lm_mm"))A("info","還沒填標誌最小尺寸（螢幕與印刷）。");if(picked(s,"logoClear")&&!T_(s,"lc_note"))A("warn","已選留白規則，但沒有說明 x 是什麼；沒有定義，留白規則無法被執行。");
  const lpx=num(s,"lm_px",NaN),lmm=num(s,"lm_mm",NaN);if(isFinite(lpx)&&lpx<24)A("info","標誌最小寬度小於 24px：這個尺寸通常只能用簡化圖示版本，完整標誌的細節會消失；請實測。");if(isFinite(lmm)&&lmm<10&&(sel("md_uniform")||(s.s4b&&s.s4b.processes.some(x=>/刺繡|燙|壓|雕/.test(x)))))A("warn","標誌最小寬度偏小，而且用到刺繡、燙印、壓凸或雕刻等工藝；這些工藝有最小線寬，須向供應商確認（見 4B）。");
  if(!sel("pr_screencolor")&&count("prohibited",s)>0)A("info","禁用清單沒有『以螢幕色作為印刷依據』，這是色彩治理最常見的誤用。");
  // 授權
  if(!s.lic.length&&(sel("lt_font")||sel("lt_music")||sel("lt_photo")||s.s4f&&s.s4f.fonts.head))A("warn","有字體、音樂或照片，但授權登記冊是空的；沒有登記，就無法在到期前處理。");
  const lw=picked(s,"licenseWarn");if(s.lic.length&&!lw)A("info","還沒決定授權到期提醒期。");
  s.lic.forEach((r,i)=>{const nm=r.asset||("第 "+(i+1)+" 筆"),li=licInfo(s,r);if(li.state==="已過期")A("error",`授權「${nm}」已過期 ${Math.abs(li.left)} 天；須續約或停止使用並下架。`);else if(li.state==="即將到期")A("warn",`授權「${nm}」將於 ${li.left} 天後到期。`);else if(li.state==="日期格式錯誤")A("warn",`授權「${nm}」：到期日格式要用 YYYY-MM-DD。`);else if(li.state==="未填到期日")A("info",`授權「${nm}」沒有到期日：是永久授權，還是未填？請註明。`);
    const miss=[];if(!r.scope)miss.push("範圍");if(!r.doc)miss.push("文件位置");if(!r.owner)miss.push("負責人");if(!r.licensor)miss.push("授權人");if(miss.length)A("warn",`授權「${nm}」缺少 ${miss.join("、")}。`);
    if(/字體|font/i.test(r.type||"")&&r.scope&&!/桌面|網頁|web|app|嵌入|廣告|印刷|desktop|print/i.test(r.scope))A("info",`字體授權「${nm}」的範圍沒有說明用途（桌面、網頁、App、嵌入、廣告、印刷）。`);
    if(/AI|生成/i.test((r.type||"")+(r.asset||"")))A("warn",`AI 生成素材「${nm}」：須確認工具條款、可否商用、是否須披露，以及能否註冊或保護。`);
    if(/音樂|旁白|聲音/.test(r.type||"")&&r.scope&&!/廣告|商用|媒體|地區/.test(r.scope))A("info",`聲音授權「${nm}」的範圍沒有說明媒體、地區或廣告用途。`)});
  if(s.s4c&&s.s4c.licSources.length&&!s.lic.some(r=>/音樂|聲音|旁白/.test(r.type||"")))A("warn","4C 有音樂或聲音來源，但授權登記冊沒有音樂或聲音的紀錄。");
  if(s.s4c&&s.s4c.voice.some(x=>/AI/.test(x))&&!s.lic.some(r=>/AI|旁白|人聲/.test((r.type||"")+(r.asset||""))))A("warn","4C 有 AI 合成人聲，但授權登記冊沒有對應紀錄（須確認工具條款、聲音權與披露）。");
  if(s.s4f){if(s.s4f.channels.some(x=>/KOL/.test(x))&&!s.lic.some(r=>/KOL|KOC|合作/.test((r.type||"")+(r.asset||""))))A("warn","4F 有 KOL／KOC 合作，但授權登記冊沒有內容使用權與期限的紀錄。");const f=s.s4f.fonts||{};[f.head,f.body].filter(Boolean).forEach(fn=>{if(!s.lic.some(r=>(r.asset||"").includes(fn)))A("info",`4F 使用字體「${fn}」，授權登記冊沒有這個字體的紀錄。`)})}
  if(sel("lt_ai"))A("info","AI 生成素材屬須專業人士判斷的領域：商用權、版權歸屬與披露要求因工具與法域而異。");
  // 無障礙
  if(!s.a11yUse.length)A("warn","還沒選跨媒體無障礙規則。");else{if(sel("md_video")&&!sel("au_caption"))A("warn","有影片，但跨媒體無障礙沒有字幕與文字稿。");if((sel("md_ppt")||sel("tpm_contract"))&&!sel("au_pdftag"))A("warn","有簡報或 PDF 文件，但沒有 PDF 標籤與閱讀順序規則（可參考 PDF/UA 與 WCAG 的 PDF 技術，須用輔助科技驗證）。");if(sel("md_print")&&!sel("au_print"))A("info","有印刷品，但沒有易讀印刷規則；字級與對比須依受眾決定並用實物測試。");if(sel("md_web")&&!(sel("au_alt")&&sel("au_contrast")))A("info","有網站，但無障礙規則沒有同時包含替代文字與對比。");if(sel("md_space")&&!sel("au_space"))A("info","有店內空間，但無障礙規則沒有空間標示與無障礙。")}
  if((s.s0&&s.s0.languages.length>=2||s.s3&&/雙語|英/.test(s.s3.script))&&!sel("au_lang"))A("info","品牌用多於一種語言：須標示文件與段落語言（尤其 PDF 與網頁）。");
  if(s.s4e&&/AA/.test(s.s4e.a11yTarget)&&!s.a11yUse.length)A("info","4E 有 AA 設計目標，但跨媒體無障礙規則還沒定義。");
  // 治理
  const ri=raciIssues(s);if(!ACTS.some(a=>ROLES.some(r=>racCell(s,a,r))))A("warn","責任矩陣（RACI）還沒填；誰使用、誰核准、誰負責例外，必須事先講清楚。");else ri.forEach(x=>A("warn",`責任矩陣「${x.act}」：${x.msg}。`));
  if(!picked(s,"approvalMode"))A("info","還沒決定核准模式（單人、兩人或加專業人士）。");else if(picked(s,"approvalMode").id==="am_single"&&((s.s4f&&s.s4f.claims.length)||(s.s0&&s.s0.claims)))A("warn","有健康或優惠等高風險宣稱，但核准模式是單人核准；建議兩人以上並加入專業人士。");
  if((s.s4f&&s.s4f.claims.length||s.s0&&s.s0.claims)&&ACTS.some(a=>ROLES.some(r=>racCell(s,a,r)))&&!ROLES.some((r,i)=>i===5&&["核准新模板與配色變體","批准例外"].some(a=>racCell(s,a,r))))A("info","有宣稱風險，但責任矩陣中『合規／專業人士』沒有參與核准模板或例外。");
  if(!picked(s,"reviewCadence"))A("info","還沒決定定期稽核頻率。");if(count("audit",s)>0&&count("audit",s)<3)A("info","稽核項目少於 3 個。");if(!count("audit",s))A("warn","還沒選稽核項目；沒有稽核，規則就只是文件。");
  const em=picked(s,"exceptionMax"),mx=em?parseFloat(em.tok["--days"]):null;if(!em&&s.exc.length)A("warn","有例外登記，但沒有決定例外有效期上限。");
  s.exc.forEach((r,i)=>{const nm=r.use||("例外 "+(i+1));const d0=pdate(r.date),d1=pdate(r.expiry);if(!r.expiry)A("warn",`例外「${nm}」沒有到期日：沒有期限的例外會變成規則。`);else if(!d1)A("warn",`例外「${nm}」：到期日格式要用 YYYY-MM-DD。`);else{if(daysTo(d1)<0)A("warn",`例外「${nm}」已過期 ${Math.abs(daysTo(d1))} 天：須結束、改回標準或重新批准。`);if(mx&&d0&&(d1-d0)/86400000>mx)A("warn",`例外「${nm}」的期限超過你設定的上限 ${mx} 天。`)}if(!r.approver)A("warn",`例外「${nm}」沒有核准者。`);if(!r.why)A("info",`例外「${nm}」沒有寫原因。`)});
  if(!picked(s,"versionScheme"))A("info","還沒決定版本規則。");if(!s.distribution.length)A("info","還沒決定資產分發方式。");
  // 4A–4F 禁區
  if(s.s4a&&s.s4a.avoid.length&&!sel("pr_effect")&&!sel("pr_busy"))A("info","4A 有視覺禁區，建議把相關誤用（陰影特效、雜亂背景）寫進禁用清單。");
  return out}

// ---------- 輸出 ----------
function draft(s){const L=(k,n)=>labels(k,s).slice(0,n).join("、")||"［尚未選擇］";const P=d=>{const o=picked(s,d);return o?o.zh:"［未定］"};
  return `${brandName(s)} 的跨媒體使用與治理：媒體「${L("media",4)}」，觸點 ${count("touchpoints",s)} 個，配色變體 ${cwNames(s).length} 個（已定義場景矩陣），打樣登記 ${s.reg.length} 筆（有效期 ${P("proofValidity")}），授權登記 ${s.lic.length} 筆，核准模式「${P("approvalMode")}」，稽核「${P("reviewCadence")}」。${count("avoidGov",s)?"禁區："+labels("avoidGov",s).slice(0,4).join("、")+"。":""}`}
function negatives(s){const n=[...labels("avoidGov",s),...labels("prohibited",s)];if(s.s1)n.push(...s.s1.anti);if(s.s4a)n.push(...s.s4a.avoid);if(s.s4b)n.push(...s.s4b.avoid);return [...new Set(n)]}
function proofCSV(s){return PROOFCOLS.map(c=>c[1]).join(",")+",有效至,狀態判斷\n"+s.reg.map(r=>{const pi=proofInfo(s,r);return [...PROOFCOLS.map(c=>r[c[0]]||""),fmtD(pi.exp),pi.state].map(csvq).join(",")}).join("\n")}
function licCSV(s){return LICCOLS.map(c=>c[1]).join(",")+",狀態,剩餘天數\n"+s.lic.map(r=>{const li=licInfo(s,r);return [...LICCOLS.map(c=>r[c[0]]||""),li.state,li.left==null?"":li.left].map(csvq).join(",")}).join("\n")}
function excCSV(s){return EXCCOLS.map(c=>c[1]).join(",")+"\n"+s.exc.map(r=>EXCCOLS.map(c=>csvq(r[c[0]]||"")).join(",")).join("\n")}
function namingMD(s){const p=picked(s,"namePattern"),vs=picked(s,"versionScheme");return `# ${brandName(s)} · 檔案命名與版本規則（draft）\n\n- 命名模式：${p?p.zh:"（未定）"}\n- 版本規則：${vs?vs.zh:"（未定）"}\n- 範例：\`${genName(s)||"（請填命名欄位）"}\`\n\n## 規則\n\n- 對外交付檔案：全小寫英文、數字、連字號與底線；不使用空格、括號與非英文字元（跨系統與供應商較穩）。\n- 不使用 final、最新、copy、新版 等不明確字眼；用版本號或日期。\n- 母檔只保留一個「現行版」，舊版移到封存並標示下架日期。\n- 每次改動都要更新版本與變更紀錄。\n\n## 現有檔名檢查\n\n`+(nameScan(s).map(n=>`- ${n.name}：${n.issues.length?n.issues.join("、"):"通過"}`).join("\n")||"（沒有樣本）")}
function usageRules(s){const md=[`# ${brandName(s)} · 跨媒體使用規則（brand-usage-rules，draft）\n`,"> 草稿，不等於核准。授權與核准只是內部管理工具，不是法律文件；印刷以印刷廠要求為準。\n"];
  md.push("## 標誌\n\n- 最小尺寸：螢幕 "+(T_(s,"lm_px")||"（未定）")+" px；印刷 "+(T_(s,"lm_mm")||"（未定）")+" mm\n- 留白：" +((picked(s,"logoClear")||{zh:"（未定）"}).zh)+"；x 的定義：" +(T_(s,"lc_note")||"（未定義）")+"\n\n### 禁用與誤用\n\n"+(labels("prohibited",s).map(x=>"- ✕ "+x).join("\n")||"（未選）"));
  md.push("\n## 配色變體 × 場景\n\n"+"| 配色變體 | "+CTX.map(c=>c.zh).join(" | ")+" |\n|---|"+CTX.map(()=>"---").join("|")+"|\n"+cwNames(s).map(n=>`| ${n} | ${CTX.map(c=>s.ctxOff[c.id]?"—":(CWSTATE[cwCell(s,n,c.id)]||"未定")).join(" | ")} |`).join("\n")+"\n\n條件與備註：\n"+cwNames(s).filter(n=>s.cwnote[n]).map(n=>`- ${n}：${s.cwnote[n]}`).join("\n"));
  md.push("\n## 觸點矩陣\n\n| 觸點 | 格式 | 尺寸 | 配色變體 | 負責人 | 核准 | 限制 |\n|---|---|---|---|---|---|---|\n"+items("touchpoints",s).map(i=>{const r=tpmRow(s,i.id);return `| ${i.zh} | ${r.fmt||"—"} | ${r.size||"—"} | ${r.cw||"—"} | ${r.owner||"—"} | ${r.appr||"—"} | ${r.note||"—"} |`}).join("\n"));
  md.push("\n## 檔案格式\n\n"+(labels("fileFormats",s).map(x=>"- "+x).join("\n")||"（未選）"));md.push("\n## 跨媒體無障礙\n\n"+(labels("a11yUse",s).map(x=>"- "+x).join("\n")||"（未選）"));
  md.push("\n## 常見誤用案例\n\n"+MISUSE.map(([id,l])=>`- ${l}：${T_(s,id)||"（未填）"}`).join("\n"));return md.join("\n")}
function auditMD(s){const cad=picked(s,"reviewCadence");const md=[`# ${brandName(s)} · 稽核清單（audit-checklist，draft）\n`,`頻率：${cad?cad.zh:"（未定）"}　負責人：${T_(s,"owner")||"（未填）"}\n`];
  md.push("## 項目\n");items("audit",s).forEach(i=>md.push(`- [ ] **${i.zh}**　常見落差：${i.avoid||"—"}　結果：＿＿＿　負責人：＿＿＿　日期：＿＿＿`));if(!s.audit.length)md.push("（未選）");
  md.push("\n## 自動檢查摘要\n");const ck=checks(s).filter(x=>x.level!=="info");md.push(ck.length?ck.map(x=>`- ${x.level==="error"?"✕":"⚠"} ${x.msg}`).join("\n"):"目前沒有 warn 或 error。");
  md.push("\n## 打樣到期\n");md.push(s.reg.map(r=>{const pi=proofInfo(s,r);return `- ${r.item||"（未命名）"}：${pi.state}${pi.exp?"，有效至 "+fmtD(pi.exp):""}`}).join("\n")||"（沒有登記）");md.push("\n## 授權到期\n");md.push(s.lic.map(r=>{const li=licInfo(s,r);return `- ${r.asset||"（未命名）"}：${li.state}${li.left!=null?"（"+li.left+" 天）":""}`}).join("\n")||"（沒有登記）");return md.join("\n")}
function governanceJSON(s){const P=d=>{const o=picked(s,d);return o?o.zh:null};return {schema:"headx.governance/v1",status:"draft",note:"登記冊是內部管理工具，不是法律文件；授權範圍以合約為準；印刷以印刷廠要求為準。",brand:brandName(s),owner:T_(s,"owner")||null,approval_mode:P("approvalMode"),proof_validity:P("proofValidity"),review_cadence:P("reviewCadence"),version_scheme:P("versionScheme"),exception_max:P("exceptionMax"),license_warning:P("licenseWarn"),
  proof_register:s.reg.map(r=>{const pi=proofInfo(s,r);return {...r,valid_until:fmtD(pi.exp)||null,derived_status:pi.state}}),license_register:s.lic.map(r=>{const li=licInfo(s,r);return {...r,derived_status:li.state,days_left:li.left}}),exceptions:s.exc,
  raci:Object.fromEntries(ACTS.map(a=>[a,Object.fromEntries(ROLES.map(r=>[r,racCell(s,a,r)]))])),raci_issues:raciIssues(s),approval:{state:"draft",approved_by:null}}}
function usageTokens(s){return {schema:"headx.usage-rules/v1",status:"draft",logo:{min_px:num(s,"lm_px",null),min_mm:num(s,"lm_mm",null),clear_space:(picked(s,"logoClear")||{}).zh||null,clear_space_definition:T_(s,"lc_note")||null},colorways:cwNames(s).map(n=>({name:n,info:cwInfo(s,n),contexts:Object.fromEntries(CTX.map(c=>[c.id,{label:c.zh,applicable:!s.ctxOff[c.id],rule:CWSTATE[cwCell(s,n,c.id)]||"未定"}])),note:s.cwnote[n]||null})),prohibited:labels("prohibited",s),file_formats:labels("fileFormats",s),naming:{pattern:(picked(s,"namePattern")||{}).zh||null,example:genName(s)||null},touchpoints:items("touchpoints",s).map(i=>({id:i.id,name:i.zh,...tpmRow(s,i.id)})),approval:{state:"draft",approved_by:null}}}
function buildGuide(s){const L=k=>labels(k,s),P=d=>{const o=picked(s,d);return o?`${o.zh}（${o.desc}）`:"（未定義）"};const md=[],H=t=>md.push("\n## "+t+"\n");
  md.push(`# ${brandName(s)} · 跨媒體使用與治理指南（governance-guide）`);md.push(`\n> ${T_(s,"statement")||draft(s)}\n`);md.push("> 草稿，不等於核准。登記冊是內部管理工具，不是法律文件；授權以合約為準；印刷以印刷廠要求為準。");
  H("1. 範圍與負責人");md.push(`負責人：${T_(s,"owner")||"（未填）"}\n\n媒體：${L("media").join("、")||"（未選）"}\n\n分發：${L("distribution").join("、")||"（未選）"}\n\n核准模式：${P("approvalMode")}`);
  H("2. 色彩打樣登記");md.push(`有效期：${P("proofValidity")}`);md.push(s.reg.length?"\n| 色彩／資產 | 規格 | 色票版本 | 印刷廠 | 工單 | 日期 | 核准者 | 狀態 | 有效至 |\n|---|---|---|---|---|---|---|---|---|\n"+s.reg.map(r=>{const pi=proofInfo(s,r);return `| ${r.item||"—"} | ${r.spec||"—"} | ${r.book||"—"} | ${r.printer||"—"} | ${r.jobv||"—"} | ${r.date||"—"} | ${r.approver||"—"} | ${pi.state} | ${fmtD(pi.exp)||"—"} |`}).join("\n"):"\n（沒有登記）");
  H("3. 配色變體 × 場景");md.push("| 配色變體 | "+CTX.map(c=>c.zh).join(" | ")+" |\n|---|"+CTX.map(()=>"---").join("|")+"|\n"+cwNames(s).map(n=>`| ${n} | ${CTX.map(c=>s.ctxOff[c.id]?"—":(CWSTATE[cwCell(s,n,c.id)]||"未定")).join(" | ")} |`).join("\n"));
  H("4. 觸點矩陣");md.push(items("touchpoints",s).map(i=>{const r=tpmRow(s,i.id);return `- ${i.zh}：${r.fmt||"—"}｜${r.size||i.note||"—"}｜${r.cw||"—"}｜負責 ${r.owner||"—"}｜核准 ${r.appr||"—"}`}).join("\n")||"（未選）");
  H("5. 檔案與命名");md.push(`格式：${L("fileFormats").join("、")||"（未選）"}\n\n命名：${P("namePattern")}\n\n範例：${genName(s)||"（未填）"}\n\n版本：${P("versionScheme")}`);
  H("6. 標誌規則與禁用");md.push(`最小：${T_(s,"lm_px")||"?"}px／${T_(s,"lm_mm")||"?"}mm\n\n留白：${P("logoClear")}（${T_(s,"lc_note")||"未定義"}）\n\n禁用：\n${L("prohibited").map(x=>"- "+x).join("\n")||"（未選）"}`);
  H("7. 授權");md.push(s.lic.length?"| 資產 | 類型 | 授權人 | 範圍 | 到期 | 狀態 |\n|---|---|---|---|---|---|\n"+s.lic.map(r=>{const li=licInfo(s,r);return `| ${r.asset||"—"} | ${r.type||"—"} | ${r.licensor||"—"} | ${r.scope||"—"} | ${r.expiry||"—"} | ${li.state} |`}).join("\n"):"（沒有登記）");
  H("8. 跨媒體無障礙");md.push(L("a11yUse").map(x=>"- "+x).join("\n")||"（未選）");
  H("9. 責任矩陣（RACI）");md.push("| 活動 | "+ROLES.join(" | ")+" |\n|---|"+ROLES.map(()=>"---").join("|")+"|\n"+ACTS.map(a=>`| ${a} | ${ROLES.map(r=>racCell(s,a,r)||"—").join(" | ")} |`).join("\n"));
  H("10. 例外與稽核");md.push(`例外上限：${P("exceptionMax")}\n\n稽核：${L("audit").join("、")||"（未選）"}（${P("reviewCadence")}）`);md.push(s.exc.length?"\n"+s.exc.map(r=>`- ${r.date||"?"}｜${r.use||"?"}｜${r.why||"?"}｜核准 ${r.approver||"?"}｜到期 ${r.expiry||"?"}`).join("\n"):"");
  H("11. 禁區");md.push(negatives(s).map(x=>"- "+x).join("\n")||"（未定義）");return md.join("\n")}
function buildSystem(s){const L=k=>labels(k,s).join("、")||"（未定義）",P=d=>{const o=picked(s,d);return o?o.zh:"（未定義）"};
  return `你是「${brandName(s)}」的跨媒體使用與治理 Agent。所有關於品牌資產使用、配色變體選擇、打樣與印刷核准、授權、檔案與命名、無障礙與稽核的建議，必須遵守以下規範。\n${s.s4b&&s.s4b.statement?"表面系統（4B）："+s.s4b.statement+"\n":""}\n【一句話】${T_(s,"statement")||draft(s)}\n【負責人與核准】負責人 ${T_(s,"owner")||"（未定義）"}；核准模式 ${P("approvalMode")}；打樣有效期 ${P("proofValidity")}\n【媒體與觸點】${L("media")}；${L("touchpoints")}\n【配色變體 × 場景】${cwNames(s).map(n=>n+"："+CTX.map(c=>c.zh+"="+(CWSTATE[cwCell(s,n,c.id)]||"未定")).join("，")).join("；")||"（未定義）"}\n【標誌】最小 ${T_(s,"lm_px")||"?"}px／${T_(s,"lm_mm")||"?"}mm；留白 ${P("logoClear")}；禁用：${L("prohibited")}\n【檔案】${L("fileFormats")}；命名 ${P("namePattern")}；版本 ${P("versionScheme")}\n【無障礙】${L("a11yUse")}\n\n【絕對禁止】${negatives(s).join("、")||"（未定義）"}\n\n【工作規則】\n1) 只可使用矩陣中標為『允許』的配色變體；『有條件』須列出條件並由人類確認；『禁止』與『未定』一律回報人類，不可自行推論。\n2) 印刷色必須引用打樣登記冊中『已核准』且未過期的紀錄（含色票或 ICC 版本、印刷廠、工單、日期、核准者）；沒有紀錄、紀錄過期或只有螢幕色／自動 CMYK 近似值時，必須標示『未核准』，不可當作官方色。\n3) 授權資產（字體、照片、音樂、旁白、AI 生成素材、KOL 內容）必須在授權登記冊有紀錄且未過期；過期、範圍不符或沒有紀錄時，必須停止並回報人類。授權範圍以合約為準，你不是律師。\n4) 不可自行批准例外；例外須有原因、核准者與到期日。不可修改登記冊的核准者與日期；不可偽造核准。\n5) 檔案命名須符合命名模式；輸出檔案格式須與媒體匹配（印刷用向量與印刷廠指定的 PDF/X 版本，螢幕用 SVG／位圖）；不可編造印刷廠要求或平台規格。\n6) 跨媒體無障礙規則（替代文字、字幕、PDF 標籤與閱讀順序、語言標示、對比）適用於所有輸出；你不可以宣稱『已符合』任何標準。\n7) 遇到規範沒有涵蓋或互相衝突的情況，請回報人類，不要自行決定。\n8) 所有輸出標示為『AI 提案，待人類核准』。`}
function hints(s){const H=[],A=(st,f,t,w)=>H.push({stage:st,field:f,text:t,why:w});
  A("4H 風格庫與 AI 生成契約","守門規則","把配色變體 × 場景矩陣、禁用清單、授權登記與打樣登記轉成 AI 生成前的守門檢查（允許／有條件／禁止／未定）","治理規則");
  A("4H 風格庫與 AI 生成契約","評估集","準備一組違規範例（過期授權、未核准印刷色、禁止配色、未經核准的例外），驗證 AI 會拒絕或回報人類","驗證治理守門");
  A("4H 風格庫與 AI 生成契約","版本與下架","風格庫條目須帶版本、核准者、日期與到期日；下架流程與稽核紀錄要可追溯","版本與稽核");
  if(s.s4b&&s.s4b.outputs.some(x=>/CMYK|專色/.test(x)))A("4H 風格庫與 AI 生成契約","色彩條目","風格庫的印刷色條目只可引用已核准的打樣登記，並帶色票版本與印刷廠","色彩治理");
  return H}
function completeness(s){const names=cwNames(s);const anyDef=names.some(n=>CTX.some(c=>cwCell(s,n,c.id)));const tps=items("touchpoints",s);const raciOK=ACTS.every(a=>ROLES.some(r=>racCell(s,a,r)))&&raciIssues(s).length===0;const c=[
  ["scope","媒體、觸點與分發",count("media",s)>=1&&count("touchpoints",s)>=1&&count("distribution",s)>=1],["owner","資產負責人與核准模式",!!T_(s,"owner")&&!!picked(s,"approvalMode")],["proof","打樣登記（至少 1 筆）與有效期",s.reg.length>=1&&!!picked(s,"proofValidity")],["matrix","配色變體 × 場景矩陣",anyDef],
  ["tpm","觸點矩陣（每項有負責人）",tps.length>=1&&tps.every(i=>tpmRow(s,i.id).owner)],["files","檔案格式、命名與版本",count("fileFormats",s)>=1&&!!picked(s,"namePattern")&&!!picked(s,"versionScheme")],["logo","標誌最小尺寸、留白與禁用（至少 8 項）",(!!T_(s,"lm_px")||!!T_(s,"lm_mm"))&&!!picked(s,"logoClear")&&!!T_(s,"lc_note")&&count("prohibited",s)>=8],
  ["license","授權類型與授權登記（至少 1 筆）",count("licenseTypes",s)>=1&&s.lic.length>=1&&!!picked(s,"licenseWarn")],["a11y","跨媒體無障礙（至少 4 項）",count("a11yUse",s)>=4],["raci","責任矩陣（每項恰有 1 個 A）",raciOK],["audit","稽核項目與頻率、例外上限",count("audit",s)>=3&&!!picked(s,"reviewCadence")&&!!picked(s,"exceptionMax")],["avoid","治理禁區（至少 5 個）",count("avoidGov",s)>=5],["mis","3 個常見誤用案例",MISUSE.every(([id])=>T_(s,id))]];
  const done=c.filter(x=>x[2]).length;return {done,total:c.length,pct:Math.round(done/c.length*100),missing:c.filter(x=>!x[2]).map(x=>({key:x[0],label:x[1]}))}}
function buildBrief(s){const c=completeness(s),pk=k=>items(k,s).map(i=>({id:i.id,name:i.zh,note:i.desc}));const dm={};DIMS.forEach(d=>{const o=picked(s,d.id);if(o)dm[d.id]={id:o.id,name:o.zh,note:o.desc}});const tx={};TEXTS.forEach(t=>{if(T_(s,t.id))tx[t.id]=T_(s,t.id)});
  return {schema:"brand/stage4g-governance/v1",status:c.missing.length?"incomplete":"complete",completeness:c.pct,missing:c.missing,approval:{state:"draft",approved_by:null,note:"草稿；登記冊是內部管理工具，不是法律文件；授權與合規須由合資格專業人士確認；打樣核准須由人類執行。"},
   stage_context:{stage0:s.s0||null,stage1:s.s1||null,stage3:s.s3||null,stage4a:s.s4a||null,stage4b:s.s4b||null,stage4c:s.s4c||null,stage4d:s.s4d||null,stage4e:s.s4e||null,stage4f:s.s4f||null},brand_name:brandName(s),owner:tx.owner||null,
   scope:{media:pk("media"),touchpoints:pk("touchpoints"),distribution:pk("distribution")},governance:{approval_mode:dm.approvalMode||null,proof_validity:dm.proofValidity||null,review_cadence:dm.reviewCadence||null,version_scheme:dm.versionScheme||null,exception_max:dm.exceptionMax||null,license_warning:dm.licenseWarn||null,audit:pk("audit")},
   proof_register:s.reg,colorway_matrix:{contexts:CTX.map(c=>({id:c.id,name:c.zh,applicable:!s.ctxOff[c.id]})),rows:cwNames(s).map(n=>({name:n,info:cwInfo(s,n),cells:Object.fromEntries(CTX.map(c=>[c.id,cwCell(s,n,c.id)])),note:s.cwnote[n]||null}))},touchpoint_matrix:items("touchpoints",s).map(i=>({id:i.id,name:i.zh,...tpmRow(s,i.id)})),
   files:{formats:pk("fileFormats"),naming:{pattern:dm.namePattern||null,fields:{brand:tx.n_brand||null,asset:tx.n_asset||null,variant:tx.n_variant||null,size:tx.n_size||null,version:tx.n_ver||null,ext:tx.n_ext||null,date:tx.n_date||null},example:genName(s)||null,samples:tx.file_samples||null}},
   logo:{min_px:tx.lm_px||null,min_mm:tx.lm_mm||null,clear_space:dm.logoClear||null,clear_space_definition:tx.lc_note||null,prohibited:pk("prohibited")},license_types:pk("licenseTypes"),license_register:s.lic,a11y:pk("a11yUse"),raci:Object.fromEntries(ACTS.map(a=>[a,Object.fromEntries(ROLES.map(r=>[r,racCell(s,a,r)]))])),exceptions:s.exc,
   avoid:pk("avoidGov"),combined_negatives:negatives(s),misuse_cases:{m1:tx.mis1||null,m2:tx.mis2||null,m3:tx.mis3||null},notes:tx.st_note||null,statement:{text:T_(s,"statement")||draft(s),source:T_(s,"statement")?"human":"auto-draft"},
   governance_json:governanceJSON(s),usage_rules:usageTokens(s),usage_rules_md:usageRules(s),naming_md:namingMD(s),audit_md:auditMD(s),consistency_checks:checks(s),downstream_hints:hints(s),guide_md:buildGuide(s),system_prompt:buildSystem(s),
   agent_rules:["所有使用品牌資產的輸出必須符合 system_prompt、guide_md 與 usage_rules。","只可使用配色變體矩陣中『允許』的組合；『有條件』須確認條件；『禁止』與『未定』回報人類。","印刷色必須引用打樣登記冊中已核准且未過期的紀錄；沒有紀錄、過期、只有螢幕色或自動 CMYK 近似值時，標示未核准。","授權資產必須在授權登記冊有紀錄且未過期並在範圍內；否則停止並回報人類。授權範圍以合約為準，你不是律師。","不可自行批准例外、修改登記冊的核准者與日期、或偽造核准。","combined_negatives 中的任何一項都不可出現；不確定時回報人類。","consistency_checks 中 level 為 warn 或 error 的項目須先由人類確認，才可進入 4H。","approval.state 為 draft 時，不得視為已核准；不得自行把狀態改為已核准。","status 為 incomplete 時，缺少的欄位不得自行補寫。","本階段不提供風格相符度分數。"]}}

// ---------- 預填 ----------
function seedFromStages(s){let n=0;if(s.s4b&&s.s4b.colors.length&&!s.reg.length){s.s4b.colors.forEach(c=>{s.reg.push({item:c.role,spec:[c.hex,c.cmyk&&("CMYK "+c.cmyk),c.pms&&(/pantone/i.test(c.pms)?c.pms:"Pantone "+c.pms)].filter(Boolean).join("；"),book:"",printer:"",jobv:"",date:"",approver:"",status:c.status==="已打樣核准"?"已打樣待核准":c.status||"未打樣"});n++})}
  if(!s.lic.length){const f=s.s4f&&s.s4f.fonts||{};[f.head,f.body].filter((v,i,a)=>v&&a.indexOf(v)===i).forEach(fn=>{s.lic.push({asset:fn,type:"字體",licensor:"",ltype:"",scope:"",expiry:"",doc:"",owner:""});n++});if(s.s4c)s.s4c.licSources.forEach(x=>{s.lic.push({asset:"音樂與聲音："+x,type:"音樂與音效",licensor:"",ltype:x,scope:"",expiry:"",doc:"",owner:""});n++});if(s.s4c&&s.s4c.voice.some(x=>/AI/.test(x))){s.lic.push({asset:"AI 合成人聲",type:"AI 生成素材",licensor:"",ltype:"",scope:"",expiry:"",doc:"",owner:""});n++}if(s.s4f&&s.s4f.channels.some(x=>/KOL/.test(x))){s.lic.push({asset:"KOL／KOC 合作內容",type:"KOL／KOC 合約與內容使用權",licensor:"",ltype:"",scope:"",expiry:"",doc:"",owner:""});n++}}
  return n}
function applySuggest(s){cwNames(s).forEach(n=>{const sg=suggestCW(n);s.cwm[n]=s.cwm[n]||{};CTX.forEach(c=>{if(!s.cwm[n][c.id]&&sg[c.id])s.cwm[n][c.id]=sg[c.id]})})}

// ---------- 貼回 ----------
function matchItem(k,name){const n=norm(name);if(!n)return null;const L=flat(k);return L.find(i=>i.id===name||norm(i.zh)===n)||L.find(i=>n.length>=2&&(norm(i.zh).includes(n)||(norm(i.zh).length>=2&&n.includes(norm(i.zh)))))||null}
function matchOpt(d,name){const dm=DIM(d);if(!dm)return null;const n=norm(name);return dm.opts.find(o=>o.id===name||norm(o.zh)===n)||dm.opts.find(o=>n.length>=2&&(norm(o.zh).includes(n)||(norm(o.zh).length>=2&&n.includes(norm(o.zh)))))||null}
function extractJSON(text){const f=text.match(/```(?:json)?\s*([\s\S]*?)```/i);return JSON.parse(f?f[1]:text.slice(text.indexOf("{"),text.lastIndexOf("}")+1))}
function normalizeBrief(j){if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4g"))return j;const n=a=>(a||[]).map(x=>x.name);const o={},sc=j.scope||{},g=j.governance||{},f=j.files||{},lg=j.logo||{};
  o.media=n(sc.media);o.touchpoints=n(sc.touchpoints);o.distribution=n(sc.distribution);o.audit=n(g.audit);o.fileFormats=n(f.formats);o.prohibited=n(lg.prohibited);o.licenseTypes=n(j.license_types);o.a11yUse=n(j.a11y);o.avoidGov=n(j.avoid);
  o.dims={};const d=(k,x)=>{if(x)o.dims[k]=x.name};d("approvalMode",g.approval_mode);d("proofValidity",g.proof_validity);d("reviewCadence",g.review_cadence);d("versionScheme",g.version_scheme);d("exceptionMax",g.exception_max);d("licenseWarn",g.license_warning);d("namePattern",(f.naming||{}).pattern);d("logoClear",lg.clear_space);
  o.text={};const t=(k,x)=>{if(x!=null&&x!=="")o.text[k]=String(x)};t("owner",j.owner);t("lm_px",lg.min_px);t("lm_mm",lg.min_mm);t("lc_note",lg.clear_space_definition);const nf=(f.naming||{}).fields||{};[["n_brand","brand"],["n_asset","asset"],["n_variant","variant"],["n_size","size"],["n_ver","version"],["n_ext","ext"],["n_date","date"]].forEach(([k,v])=>t(k,nf[v]));t("file_samples",(f.naming||{}).samples);const mc=j.misuse_cases||{};t("mis1",mc.m1);t("mis2",mc.m2);t("mis3",mc.m3);t("st_note",j.notes);t("brandName",j.brand_name);if(j.statement&&j.statement.source==="human")t("statement",j.statement.text);
  o.reg=j.proof_register;o.lic=j.license_register;o.exc=j.exceptions;o.raci=j.raci;
  const cm=j.colorway_matrix||{};o.cwm={};o.cwnote={};o.ctxOff={};(cm.contexts||[]).forEach(c=>{if(c.applicable===false)o.ctxOff[c.id]=true});(cm.rows||[]).forEach(r=>{o.cwm[r.name]=r.cells||{};if(r.note)o.cwnote[r.name]=r.note});
  o.tpm={};(j.touchpoint_matrix||[]).forEach(r=>{o.tpm[r.id]={fmt:r.fmt||"",size:r.size||"",cw:r.cw||"",owner:r.owner||"",appr:r.appr||"",note:r.note||""}});return o}
function applyPaste(text,s){const out={applied:[],custom:[],errors:[]};let j;
  try{j=normalizeBrief(extractJSON(text))}catch(e){out.errors.push("找不到可解析的 JSON 區塊（請連同 ```json 區塊一起貼上）");return out}
  CAT_KEYS.forEach(k=>{if(!Array.isArray(j[k]))return;const ids=[],cu=[];j[k].forEach(n=>{const m=matchItem(k,n);if(m){if(!ids.includes(m.id))ids.push(m.id)}else if(String(n).trim()&&!cu.includes(String(n).trim()))cu.push(String(n).trim())});s[k]=ids;s.custom[k]=cu;out.applied.push(`${CAT[k].title.replace(/（.*/,"")}：${ids.length} 項`+(cu.length?`＋自訂 ${cu.length} 項`:""));cu.forEach(c=>out.custom.push(c))});
  const dd=Object.assign({},j.dims||{});DIMS.forEach(d=>{if(typeof j[d.id]==="string"||(j[d.id]&&j[d.id].name))dd[d.id]=typeof j[d.id]==="string"?j[d.id]:j[d.id].name});let c=0;Object.entries(dd).forEach(([d,v])=>{if(!DIM(d))return;const o=matchOpt(d,v);if(o){s.dims[d]=o.id;c++}else out.errors.push(`「${d}」的值「${v}」不在清單內，未套用`)});if(c)out.applied.push(`單選規則：${c} 項`);
  const tx=Object.assign({},j.text||{});TEXTS.forEach(t=>{if(typeof j[t.id]==="string"||typeof j[t.id]==="number")tx[t.id]=j[t.id]});let tc=0;Object.entries(tx).forEach(([k,v])=>{if(TEXT_BY[k]&&(typeof v==="string"||typeof v==="number")){s.text[k]=String(v);tc++}});if(tc)out.applied.push(`文字欄：${tc} 項`);
  const rows=(k,cols)=>{if(Array.isArray(j[k])&&j[k].length){s[k]=j[k].filter(r=>r&&typeof r==="object").map(r=>{const o={};cols.forEach(([id])=>o[id]=r[id]!=null?String(r[id]):"");return o});out.applied.push({reg:"打樣登記",lic:"授權登記",exc:"例外登記"}[k]+"："+s[k].length+" 筆")}};rows("reg",PROOFCOLS);rows("lic",LICCOLS);rows("exc",EXCCOLS);
  if(j.raci&&typeof j.raci==="object"){s.raci={};Object.entries(j.raci).forEach(([a,row])=>{if(ACTS.includes(a)&&row&&typeof row==="object"){s.raci[a]={};ROLES.forEach(r=>{if(["R","A","C","I"].includes(row[r]))s.raci[a][r]=row[r]})}});out.applied.push("責任矩陣")}
  if(j.cwm&&typeof j.cwm==="object"){s.cwm=j.cwm;s.cwnote=j.cwnote||{};s.ctxOff=j.ctxOff||{};out.applied.push("配色變體矩陣")}if(j.tpm&&typeof j.tpm==="object"&&Object.keys(j.tpm).length){s.tpm=j.tpm;out.applied.push("觸點矩陣")}
  if(!out.applied.length)out.errors.push("JSON 內沒有可辨識的欄位");return out}
