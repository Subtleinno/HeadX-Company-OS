
const KEY="brand_stage4e_v1";
const BK={s0:"brand_brief_stage0",s1:"brand_brief_stage1",s2:"brand_brief_stage2",s3:"brand_brief_stage3",s4a:"brand_brief_stage4a",s4b:"brand_brief_stage4b",s4c:"brand_brief_stage4c",s4d:"brand_brief_stage4d"};
const norm=t=>String(t||"").replace(/\s+/g,"").toLowerCase();
const emptyState=()=>{const s={s0:null,s1:null,s2:null,s3:null,s4a:null,s4b:null,s4c:null,s4d:null,dims:{},text:{},journey:{},custom:{}};CAT_KEYS.forEach(k=>{s[k]=[];s.custom[k]=[]});return s};
function load(){let s=emptyState();try{const r=JSON.parse(localStorage.getItem(KEY)||"null");if(r){const e=emptyState();s=Object.assign(e,r);s.custom=Object.assign(e.custom,r.custom||{});s.dims=r.dims||{};s.text=r.text||{};s.journey=r.journey||{};CAT_KEYS.forEach(k=>{if(!Array.isArray(s[k]))s[k]=[];if(!Array.isArray(s.custom[k]))s.custom[k]=[]})}}catch(x){}return autoImport(s)}
function autoImport(s){Object.keys(BK).forEach(n=>{if(s[n])return;try{const raw=localStorage.getItem(BK[n]);if(raw){const p=PARSE[n](raw);if(p){s[n]=p;if(n==="s4a")fillPalette(s,p.palette)}}}catch(x){}});return s}
function fillPalette(s,pal){Object.entries(pal||{}).forEach(([k,v])=>{if(/^c_/.test(k)&&!String(s.text[k]||"").trim()&&hex(v))s.text[k]=v})}
function save(s){try{localStorage.setItem(KEY,JSON.stringify(s))}catch(x){}}
const flat=k=>CAT[k].groups.flatMap(g=>g.items);
const byId=(k,id)=>flat(k).find(i=>i.id===id);
const labels=(k,s)=>[...s[k].map(id=>(byId(k,id)||{zh:id}).zh),...s.custom[k]];
const items=(k,s)=>[...s[k].map(id=>byId(k,id)||{id,zh:id,desc:"",t:[],conf:[],risk:false,pro:false,inter:false,note:"",cost:0}),...s.custom[k].map(t=>({id:"custom",zh:t,desc:"（自訂）",t:[],conf:[],risk:false,pro:false,inter:false,note:"",cost:0}))];
const count=(k,s)=>s[k].length+s.custom[k].length;
const has=(s,id)=>CAT_KEYS.some(k=>s[k].includes(id));
const anyName=id=>{for(const k of CAT_KEYS){const i=byId(k,id);if(i)return i.zh}return id};
const picked=(s,d)=>{const id=s.dims[d];return id?OPTD(d,id):null};
const T_=(s,id)=>String(s.text[id]||"").trim();
const num=(s,id,d)=>{const v=parseFloat(T_(s,id));return isFinite(v)?v:d};
const nameList=a=>(a||[]).map(x=>x&&x.name).filter(Boolean);
function J(t){try{return typeof t==="string"?JSON.parse(t):t}catch(e){return null}}
const brandName=s=>T_(s,"brandName")||(s.s1&&s.s1.name)||(s.s0&&s.s0.name)||"品牌";
const cl=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));

// ---------- 前階段匯入 ----------
function parseS0(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage0"))return null;const ch=j.choices||{},sel=j.selections||{},d=j.derived||{};return {name:(j.text||{}).trading||(j.text||{}).legalZh||"",budget:(ch.brandBudget||{}).name||"",priceTier:(ch.priceTier||{}).name||"",industry:nameList(sel.industry),delivery:nameList(sel.delivery),languages:nameList(sel.languages),flags:d.flags||[],claims:!!d.claims_risk}}
function parseS1(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage1"))return null;return {name:j.brand_name||"",statement:(j.positioning_statement||{}).text||"",dials:((j.core_tension||{}).dials||[]).map(d=>({id:d.id,left:d.left,right:d.right,position:d.position})),anti:nameList(j.anti_persona)}}
function parseS2(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage2"))return null;const rules={};Object.entries(j.physics_rules||{}).forEach(([k,v])=>rules[k]=(v&&v.name)||"");return {statement:(j.sensory_statement||{}).text||"",keywords:nameList(j.mood_keywords),anti:nameList(j.anti_keywords),avoid:nameList(j.avoid_materials),material:nameList((j.material_metaphor||{}).primary),rules}}
function parseS3(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage3"))return null;const dials={};(j.tone_dials||[]).forEach(d=>dials[d.id]=d.position);return {statement:(j.voice_statement||{}).text||"",personality:nameList(j.personality),dials,script:((j.language_rules||{}).script||{}).name||""}}
function parseS4a(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4a"))return null;return {statement:(j.visual_statement||{}).text||"",colorStyle:nameList((j.color||{}).style),shape:nameList((j.shape||{}).style),photo:nameList((j.photography||{}).style),icon:nameList(j.icon),avoid:nameList(j.visual_avoid),palette:(j.color||{}).palette||{}}}
function parseS4b(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4b"))return null;const sh=j.shape||{},bd=j.border||{},fl=j.fill||{};return {statement:(j.surface_statement||{}).text||"",tokens:j.surface_tokens||{},radius:(sh.radius_scale||{}).name||"",elevation:(sh.elevation||{}).name||"",borderWidth:(bd.width||{}).name||"",borderColor:(bd.color||{}).name||"",focus:(bd.focus||{}).name||"",fillOpacity:(fl.opacity||{}).name||"",fillStates:(fl.states||{}).name||"",colorways:(j.colorways||[]).map(c=>({id:c.id,name:c.name,bg:c.background,fg:c.foreground,ac:c.accent})),avoid:nameList(j.surface_avoid)}}
function parseS4c(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4c"))return null;const m=j.motion||{};return {statement:(j.statement||{}).text||"",tokens:j.motion_tokens||{},reduced:(m.reduced_motion||{}).name||"",autoplay:(m.autoplay||{}).name||"",avoid:nameList((j.avoid||{}).motion)}}
function parseS4d(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4d"))return null;const p=j.product||{};return {statement:(j.statement||{}).text||"",usage:nameList(p.usage),materials:nameList(p.materials),finishes:nameList(p.finishes),compliance:nameList(p.compliance),lighting:nameList((j.three_d||{}).lighting)}}
const PARSE={s0:parseS0,s1:parseS1,s2:parseS2,s3:parseS3,s4a:parseS4a,s4b:parseS4b,s4c:parseS4c,s4d:parseS4d};
function importBrief(text,s){const j=J(text);if(!j||typeof j.schema!=="string")return null;const m=j.schema.match(/^brand\/stage(\d)([abcd]?)/);if(!m)return null;const k="s"+m[1]+m[2];if(!PARSE[k])return null;const p=PARSE[k](j);if(!p)return null;s[k]=p;if(k==="s4a")fillPalette(s,p.palette);try{localStorage.setItem(BK[k],JSON.stringify(j))}catch(e){}return k}
function ctxStages(s){const a=[];
  a.push(s.s0?`【Stage 0 業務】行業：${s.s0.industry.join("、")||"（無）"}｜價格定位：${s.s0.priceTier||"（無）"}｜預算：${s.s0.budget||"（無）"}｜交付：${s.s0.delivery.join("、")||"（無）"}｜規管提示：${s.s0.flags.join("、")||"（無）"}｜健康宣稱風險：${s.s0.claims?"有":"無"}`:"【Stage 0 業務】（尚未匯入）");
  a.push(s.s1?`【Stage 1 定位】品牌：${s.s1.name||"（尚未命名）"}｜宣言：${s.s1.statement||"（無）"}｜張力刻度：${s.s1.dials.map(d=>`${d.left}↔${d.right}=${d.position}`).join("；")||"（無）"}｜絕對不要像：${s.s1.anti.join("、")||"（無）"}`:"【Stage 1 定位】（尚未匯入）");
  a.push(s.s2?`【Stage 2 感官】感官宣言：${s.s2.statement||"（無）"}｜材質隱喻：${s.s2.material.join("、")||"（無）"}｜關鍵字：${s.s2.keywords.join("、")||"（無）"}｜反關鍵字：${s.s2.anti.join("、")||"（無）"}｜物理禁區：${s.s2.avoid.join("、")||"（無）"}`:"【Stage 2 感官】（尚未匯入）");
  a.push(s.s3?`【Stage 3 語言】聲音宣言：${s.s3.statement||"（無）"}｜性格：${s.s3.personality.join("、")||"（無）"}｜書寫語言：${s.s3.script||"（無）"}`:"【Stage 3 語言】（尚未匯入）");
  a.push(s.s4a?`【Stage 4A 視覺語言】一句話：${s.s4a.statement||"（無）"}｜色彩：${s.s4a.colorStyle.join("、")||"（無）"}｜形狀：${s.s4a.shape.join("、")||"（無）"}｜視覺禁區：${s.s4a.avoid.join("、")||"（無）"}`:"【Stage 4A 視覺語言】（尚未匯入）");
  a.push(s.s4b?`【Stage 4B 表面系統】一句話：${s.s4b.statement||"（無）"}｜圓角：${s.s4b.radius||"（無）"}｜陰影：${s.s4b.elevation||"（無）"}｜邊框：${s.s4b.borderWidth||"（無）"}／${s.s4b.borderColor||"（無）"}｜焦點：${s.s4b.focus||"（無）"}｜填色狀態：${s.s4b.fillStates||"（無）"}｜tokens：${Object.entries(s.s4b.tokens).map(([k,v])=>k+"="+v).join("；")||"（無）"}`:"【Stage 4B 表面系統】（尚未匯入）");
  a.push(s.s4c?`【Stage 4C 動態影片】一句話：${s.s4c.statement||"（無）"}｜減少動態：${s.s4c.reduced||"（未定）"}｜自動播放：${s.s4c.autoplay||"（未定）"}｜動態 tokens：${Object.entries(s.s4c.tokens).map(([k,v])=>k+"="+v).join("；")||"（無）"}`:"【Stage 4C 動態影片】（尚未匯入）");
  a.push(s.s4d?`【Stage 4D 3D 與產品】一句話：${s.s4d.statement||"（無）"}｜使用情境：${s.s4d.usage.join("、")||"（無）"}｜物料：${s.s4d.materials.join("、")||"（無）"}｜表面：${s.s4d.finishes.join("、")||"（無）"}`:"【Stage 4D 3D 與產品】（尚未匯入）");
  return a.join("\n")}
function ctxUX(s){const L=k=>labels(k,s).join("、")||"（尚未選擇）",P=d=>{const o=picked(s,d);return o?o.zh:"（尚未選擇）"},X=id=>T_(s,id)||"（尚未填寫）";
  return [`UI：風格 ${L("uiStyle")}｜密度 ${P("density")}｜間距 ${P("spacingBase")}｜字級 ${P("typeBase")}｜主題 ${P("themeMode")}｜圖示 ${P("iconStyle")}｜目標 ${P("a11yTarget")}`,
  `UX：模式 ${L("uxPattern")}｜導覽 ${P("navPattern")}｜標籤 ${P("labelPos")}｜錯誤 ${P("errorPattern")}`,
  `元件：${L("components")}｜狀態 ${L("uiStates")}｜目標大小 ${P("targetPolicy")}｜焦點 ${P("focusPolicy")}`,`無障礙測試：${L("a11yTests")}`,
  `旅程：觸點 ${L("touchpoints")}｜服務時刻 ${L("serviceMoments")}｜已填旅程階段 ${STAGES.filter((x,i)=>jr(s,i).tp||jr(s,i).act).length}/${STAGES.length}`,
  `空間：類型 ${L("spaceType")}｜風格 ${L("interiorStyle")}｜分區 ${L("zones")}｜材質 ${L("spaceMat")}｜燈光 ${L("spaceLight")}｜感官 ${L("spaceSensory")}｜色溫 ${P("cctPolicy")}｜清潔 ${P("cleanPolicy")}`,
  `動線與尋路：客流 ${P("crowdPolicy")}｜尋路 ${L("wayfinding")}｜無障礙 ${L("spaceAccess")}｜標示語言 ${P("signageLang")}｜門 ${X("sp_door")}mm／通道 ${X("sp_corr")}mm／迴轉 ${X("sp_turn")}mm`,
  `色值：主 ${X("c_primary")}／輔 ${X("c_secondary")}／點綴 ${X("c_accent")}／文字 ${X("c_ink")}／背景 ${X("c_paper")}`,`禁區：${L("avoidUX")}`].join("\n")}

// ---------- 色彩 ----------
function hex(v){const m=String(v||"").trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);if(!m)return null;let h=m[1];if(h.length===3)h=h.split("").map(c=>c+c).join("");return "#"+h.toUpperCase()}
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const lin=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
const lum=h=>{const [r,g,b]=rgb(h).map(v=>lin(v/255));return .2126*r+.7152*g+.0722*b};
const fr=x=>(Math.floor(x*100)/100).toFixed(2);
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
function mixHex(a,b,u){const A=rgb(a),B=rgb(b);return "#"+A.map((v,k)=>Math.round(v+(B[k]-v)*u).toString(16).padStart(2,"0")).join("").toUpperCase()}
function palette(s){const o={};COLS.forEach(([id])=>{const h=hex(s.text[id]);if(h)o[id]=h});return o}
const SEMDEF={error:"#B42318",success:"#067647",warning:"#B54708",info:"#175CD3"};
function sem(s){const o={},d=[];[["error","c_error"],["success","c_success"],["warning","c_warning"],["info","c_info"]].forEach(([k,id])=>{const h=hex(s.text[id]);if(h)o[k]=h;else{o[k]=SEMDEF[k];d.push(k)}});o._defaults=d;return o}

// ---------- 主題、tokens ----------
function themes(s){const p=palette(s);if(!p.c_primary||!p.c_paper||!p.c_ink)return [];const sec=p.c_secondary||mixHex(p.c_paper,p.c_ink,.15),acc=p.c_accent||p.c_primary;
  const L={name:"淺色",bg:p.c_paper,fg:p.c_ink,primary:p.c_primary,secondary:sec,accent:acc};const out=[L];const tm=picked(s,"themeMode");
  if(tm&&tm.id!=="th_light"){let bg=lum(p.c_ink)<.12?p.c_ink:"#0F1115";const cw=s.s4b&&s.s4b.colorways.find(c=>/dark|深色/i.test(c.id+c.name));if(cw&&hex(cw.bg))bg=hex(cw.bg);let fg=p.c_paper;if(ratio(fg,bg)<7)fg="#F5F5F5";let pr=p.c_primary,g=0;while(ratio(pr,bg)<3&&g<12){pr=mixHex(pr,"#FFFFFF",.12);g++}let ac=acc;g=0;while(ratio(ac,bg)<3&&g<12){ac=mixHex(ac,"#FFFFFF",.12);g++}out.push({name:"深色",bg,fg,primary:pr,secondary:mixHex(bg,fg,.2),accent:ac})}
  return out}
function tokens(s){const t=(s.s4b&&s.s4b.tokens)||{},pxv=v=>{const n=parseFloat(v);return isFinite(n)?n:null};const dflt=!(s.s4b&&Object.keys(t).length);
  const r=(k,d)=>{const o=num(s,"u_radius",NaN);if(k==="md"&&isFinite(o))return o;const v=pxv(t["--radius-"+k]);return v!=null?v:d};
  const bw=isFinite(num(s,"u_border",NaN))?num(s,"u_border"):(pxv(t["--border-width"])!=null?pxv(t["--border-width"]):1);const fw=isFinite(num(s,"u_focus",NaN))?num(s,"u_focus"):(pxv(t["--focus-width"])!=null?pxv(t["--focus-width"]):2);const fo=pxv(t["--focus-offset"])!=null?pxv(t["--focus-offset"]):2;
  const dn=picked(s,"density"),h=dn?parseFloat(dn.tok["--control-h"]):40,tp=picked(s,"targetPolicy");
  return {rad:{sm:r("sm",4),md:r("md",8),lg:r("lg",12)},shadow:{sm:t["--shadow-sm"]||"none",md:t["--shadow-md"]||"none",lg:t["--shadow-lg"]||"none"},border:bw,focus:fw,focusOff:fo,h,pad:dn?parseFloat(dn.tok["--control-pad"]):16,targetMin:tp?parseFloat(tp.tok["--target-min"]):24,space:picked(s,"spacingBase")?parseFloat(picked(s,"spacingBase").tok["--space"]):8,text:picked(s,"typeBase")?parseFloat(picked(s,"typeBase").tok["--text-base"]):16,defaults:dflt,borderless:/無邊框/.test((s.s4b||{}).borderWidth||"")}}

// ---------- 元件規範引擎 ----------
function R_(item,state,fg,bg,kind,note){const req={text:4.5,large:3,ui:3,focus:3,info:0}[kind];const r=ratio(fg,bg);return {item,state,fg,bg,kind,req,ratio:r,pass:kind==="info"?true:r>=req,note:note||""}}
function bestText(bg,th){const c=[th.fg,th.bg,"#000000","#FFFFFF"];return c.map(x=>[x,ratio(x,bg)]).sort((a,b)=>b[1]-a[1])[0][0]}
function pickRing(th){return [th.fg,th.primary,th.accent].map(x=>[x,ratio(x,th.bg)]).sort((a,b)=>b[1]-a[1])[0][0]}
function suggestMix(th,min){for(let t=.1;t<=1.001;t+=.02){const c=mixHex(th.bg,th.fg,t);if(ratio(c,th.bg)>=min)return c}return th.fg}
function compRows(id,th,tk,sm){const rows=[],ring=pickRing(th),push=(...a)=>rows.push(R_(...a));const dir=lum(th.primary)>.3?th.fg:th.bg;
  const focus=()=>push("焦點外框","焦點",ring,th.bg,"focus",`外框 ${tk.focus}px、偏移 ${tk.focusOff}px；對相鄰背景需 3:1`);
  switch(id){
  case"cp_btn":{const tx=bestText(th.primary,th);push("按鈕文字","預設",tx,th.primary,"text",lum(th.primary)>.18&&lum(th.primary)<.45?"品牌色中間亮度，白字或深字都可能不足":"");push("按鈕文字","懸停",tx,mixHex(th.primary,dir,.12),"text");push("按鈕文字","按下",tx,mixHex(th.primary,dir,.22),"text");push("禁用文字","禁用",mixHex(th.bg,th.fg,.4),mixHex(th.bg,th.fg,.08),"info","禁用元件豁免對比，但須可辨識並說明原因");push("載入圖示","載入中",tx,th.primary,"ui");focus();break}
  case"cp_btn2":push("邊框","預設",th.primary,th.bg,"ui","描邊按鈕的邊界");push("文字","預設",th.primary,th.bg,"text");push("文字","懸停",th.primary,mixHex(th.bg,th.primary,.08),"text");push("文字","按下",th.primary,mixHex(th.bg,th.primary,.16),"text");focus();break;
  case"cp_link":push("連結文字","預設",th.primary,th.bg,"text","不可只靠顏色，須有底線或其他提示（SC 1.4.1）");push("連結文字","懸停",mixHex(th.primary,th.fg,.25),th.bg,"text");focus();break;
  case"cp_input":push("邊框（用輔色）","預設",th.secondary,th.bg,"ui","輸入框邊界須可辨識");push("邊框（建議值）","預設",suggestMix(th,3),th.bg,"info","達到 3:1 的最淺中性色："+suggestMix(th,3));push("佔位文字（中間灰）","預設",mixHex(th.bg,th.fg,.5),th.bg,"text","佔位文字也是文字；且不可取代標籤");push("佔位文字（建議值）","預設",suggestMix(th,4.5),th.bg,"info","達到 4.5:1："+suggestMix(th,4.5));push("輸入文字","預設",th.fg,th.bg,"text");push("錯誤邊框","錯誤",sm.error,th.bg,"ui","須同時有圖示與文字說明");push("錯誤訊息","錯誤",sm.error,th.bg,"text");push("成功圖示","成功",sm.success,th.bg,"ui");focus();break;
  case"cp_check":push("未選取邊框","預設",th.secondary,th.bg,"ui");push("已選取填色","已選",th.primary,th.bg,"ui");push("勾號","已選",bestText(th.primary,th),th.primary,"ui");push("標籤文字","預設",th.fg,th.bg,"text");focus();break;
  case"cp_switch":push("關閉軌道","關",mixHex(th.bg,th.fg,.4),th.bg,"ui");push("開啟軌道","開",th.primary,th.bg,"ui");push("滑塊對開啟軌道","開",th.bg,th.primary,"ui");focus();break;
  case"cp_tabs":push("選中指示線","選中",th.primary,th.bg,"ui");push("選中文字","選中",th.fg,th.bg,"text");push("未選文字","預設",mixHex(th.bg,th.fg,.65),th.bg,"text");focus();break;
  case"cp_card":{const surf=lum(th.bg)>.5?mixHex(th.bg,"#FFFFFF",.6):mixHex(th.bg,"#FFFFFF",.06);push("卡片文字","預設",th.fg,surf,"text");push("卡片邊框（輔色）","預設",th.secondary,surf,"info","卡片不是控制項，邊框非必須；若整張可點則須焦點與名稱");focus();break}
  case"cp_modal":push("彈窗文字","預設",th.fg,mixHex(th.bg,"#FFFFFF",lum(th.bg)>.5?.6:.06),"text");push("遮罩下的頁面對彈窗","預設",th.bg,mixHex(th.bg,th.fg,.5),"info","遮罩強度 50%；須鎖定焦點、可按 Esc 關閉");focus();break;
  case"cp_toast":["error","success","warning","info"].forEach(k=>{const tint=mixHex(th.bg,sm[k],.12);push("訊息文字","預設",th.fg,tint,"text");push("狀態圖示（"+{error:"錯誤",success:"成功",warning:"警告",info:"資訊"}[k]+"）","預設",sm[k],tint,"ui","須同時有文字，不只靠顏色")});break;
  case"cp_badge":[["主色",th.primary],["錯誤",sm.error],["成功",sm.success],["警告",sm.warning],["資訊",sm.info]].forEach(([n,c])=>push("標籤文字（"+n+"）","預設",c,mixHex(th.bg,c,.14),"text"));break;
  case"cp_table":push("標題文字","預設",th.fg,th.secondary,"text");push("斑馬紋列文字","預設",th.fg,mixHex(th.bg,th.fg,.04),"text");push("選中列文字","選中",th.fg,mixHex(th.bg,th.primary,.14),"text");push("懸停列文字","懸停",th.fg,mixHex(th.bg,th.primary,.08),"text");focus();break;
  case"cp_tooltip":push("提示文字","預設",th.bg,th.fg,"text");break;
  case"cp_progress":push("進度填色對軌道","預設",th.primary,mixHex(th.bg,th.fg,.12),"ui");push("軌道對背景","預設",mixHex(th.bg,th.fg,.12),th.bg,"info","軌道若不承載資訊可不要求，但建議可見");push("滑桿拇指","預設",th.primary,th.bg,"ui");focus();break;
  case"cp_nav":push("目前頁面文字","選中",th.primary,th.bg,"text");push("其他項目文字","預設",mixHex(th.bg,th.fg,.7),th.bg,"text");push("目前頁面指示","選中",th.primary,th.bg,"ui");focus();break;
  case"cp_acc":push("標題文字","預設",th.fg,th.bg,"text");push("展開圖示","預設",th.fg,th.bg,"ui");push("分隔線（輔色）","預設",th.secondary,th.bg,"info","非必須");focus();break}
  return rows}
function compSizes(id,tk){const c=byId("components",id);const interactive=c&&c.inter;const rad=/card|modal|toast|table/.test(id)?tk.rad.lg:/badge|tooltip/.test(id)?tk.rad.sm:tk.rad.md;const shadow=/modal|tooltip/.test(id)?tk.shadow.lg:/card|toast/.test(id)?tk.shadow.md:"none";const hasH=c&&c.n1===1;return {height:hasH?tk.h:null,pad:hasH?tk.pad:null,radius:rad,border:tk.border,shadow,target:interactive?tk.targetMin:null}}
function specAll(s){const ths=themes(s),tk=tokens(s),sm=sem(s),out=[];if(!ths.length)return out;s.components.forEach(id=>{const c=byId("components",id);if(!c)return;const sz=compSizes(id,tk);ths.forEach(th=>out.push({id,name:c.zh,theme:th.name,sizes:sz,rows:compRows(id,th,tk,sm)}))});return out}
function specFails(s){const f=[];specAll(s).forEach(c=>c.rows.forEach(r=>{if(!r.pass)f.push({comp:c.name,theme:c.theme,...r})}));return f}
function compPreview(id,th,tk,sm){const ring=pickRing(th),R=`border-radius:${tk.rad.md}px`,bw=tk.border;const tx=bestText(th.primary,th);const btn=(bg,fg,extra)=>`<span style="display:inline-flex;align-items:center;justify-content:center;min-height:${tk.h}px;padding:0 ${tk.pad}px;${R};background:${bg};color:${fg};font-weight:600;font-size:13px;${extra||""}">按鈕</span>`;
  const st=(l,h)=>`<div style="display:inline-block;margin:4px 10px 4px 0;text-align:center"><div>${h}</div><small style="font-size:10px;color:${th.fg};opacity:.7">${l}</small></div>`;const sh=`box-shadow:${tk.shadow.md}`;
  const wrap=h=>`<div style="background:${th.bg};color:${th.fg};padding:10px;border-radius:10px;border:1px solid rgba(128,128,128,.25)">${h}</div>`;
  switch(id){
  case"cp_btn":return wrap(st("預設",btn(th.primary,tx))+st("懸停",btn(mixHex(th.primary,lum(th.primary)>.3?th.fg:th.bg,.12),tx))+st("按下",btn(mixHex(th.primary,lum(th.primary)>.3?th.fg:th.bg,.22),tx))+st("禁用",btn(mixHex(th.bg,th.fg,.08),mixHex(th.bg,th.fg,.4)))+st("焦點",btn(th.primary,tx,`outline:${tk.focus}px solid ${ring};outline-offset:${tk.focusOff}px`)));
  case"cp_btn2":return wrap(st("預設",btn(th.bg,th.primary,`border:${Math.max(bw,1)}px solid ${th.primary}`))+st("懸停",btn(mixHex(th.bg,th.primary,.08),th.primary,`border:${Math.max(bw,1)}px solid ${th.primary}`))+st("焦點",btn(th.bg,th.primary,`border:${Math.max(bw,1)}px solid ${th.primary};outline:${tk.focus}px solid ${ring};outline-offset:${tk.focusOff}px`)));
  case"cp_input":{const inp=(b,extra)=>`<span style="display:inline-block;width:150px;min-height:${tk.h}px;line-height:${tk.h-2*bw}px;padding:0 10px;${R};border:${Math.max(bw,1)}px solid ${b};background:${th.bg};color:${mixHex(th.bg,th.fg,.5)};font-size:13px;${extra||""}">佔位文字</span>`;return wrap(st("預設",inp(th.secondary))+st("建議邊框",inp(suggestMix(th,3)))+st("錯誤",inp(sm.error))+st("焦點",inp(th.secondary,`outline:${tk.focus}px solid ${ring};outline-offset:${tk.focusOff}px`)))}
  case"cp_check":{const bx=(f,b)=>`<span style="display:inline-block;width:20px;height:20px;border-radius:${Math.min(tk.rad.sm,6)}px;border:${Math.max(bw,1)}px solid ${b};background:${f};color:${bestText(th.primary,th)};text-align:center;font-size:13px;line-height:18px">${f===th.primary?"✓":""}</span>`;return wrap(st("未選取",bx(th.bg,th.secondary))+st("已選取",bx(th.primary,th.primary)))}
  case"cp_switch":{const sw=(on)=>`<span style="display:inline-block;width:44px;height:24px;border-radius:99px;background:${on?th.primary:mixHex(th.bg,th.fg,.4)};position:relative"><i style="position:absolute;top:3px;${on?"right":"left"}:3px;width:18px;height:18px;border-radius:50%;background:${th.bg}"></i></span>`;return wrap(st("關",sw(false))+st("開",sw(true)))}
  case"cp_tabs":return wrap(`<span style="display:inline-block;padding:8px 14px;border-bottom:3px solid ${th.primary};font-weight:600;font-size:13px">選中</span><span style="display:inline-block;padding:8px 14px;color:${mixHex(th.bg,th.fg,.65)};font-size:13px">未選</span>`);
  case"cp_card":return wrap(`<div style="padding:14px;${R.replace(tk.rad.md+"px",tk.rad.lg+"px")};border:${bw}px solid ${th.secondary};${sh};background:${lum(th.bg)>.5?mixHex(th.bg,"#FFFFFF",.6):mixHex(th.bg,"#FFFFFF",.06)};font-size:13px"><b>卡片標題</b><br>內文示範文字。</div>`);
  case"cp_toast":return wrap(["error","success","warning","info"].map(k=>`<div style="margin:4px 0;padding:8px 12px;${R};background:${mixHex(th.bg,sm[k],.12)};color:${th.fg};border-left:4px solid ${sm[k]};font-size:13px"><b style="color:${sm[k]}">●</b> ${{error:"錯誤：請檢查電郵格式。",success:"成功：已儲存。",warning:"警告：即將過期。",info:"資訊：已更新。"}[k]}</div>`).join(""));
  case"cp_badge":return wrap([["主色",th.primary],["錯誤",sm.error],["成功",sm.success],["警告",sm.warning]].map(([n,c])=>`<span style="display:inline-block;margin-right:6px;padding:2px 10px;border-radius:${tk.rad.sm*2}px;background:${mixHex(th.bg,c,.14)};color:${c};font-size:12px;font-weight:600">${n}</span>`).join(""));
  default:return ""}}
const COLORKIND={text:"文字 4.5:1",large:"大字 3:1",ui:"元件 3:1",focus:"焦點 3:1",info:"參考"};

// ---------- 旅程與計算 ----------
const jr=(s,i)=>Object.assign({tp:"",act:"",front:"",back:"",emo:"",pain:"",opp:""},s.journey[i]||{});
function journeyRows(s){return STAGES.map((n,i)=>({stage:n,...jr(s,i)}))}
function queueCalc(s){const rooms=num(s,"sp_rooms",NaN),sess=num(s,"sp_session",NaN),buf=num(s,"sp_buffer",0),hrs=num(s,"sp_hours",NaN),peak=num(s,"sp_peak",NaN),wait=num(s,"sp_wait",NaN);if(![rooms,sess,hrs].every(isFinite)||rooms<=0||sess<=0)return null;const cyc=sess+buf,perRoomDay=Math.floor(hrs*60/cyc),perHour=rooms*60/cyc;const o={rooms,cyc,perRoomDay,daily:rooms*perRoomDay,perHour};if(isFinite(peak)){o.peak=peak;o.util=peak/perHour}if(isFinite(peak)&&isFinite(wait)){o.L=peak*wait/60;o.seats=Math.ceil(o.L)}const area=num(s,"sp_area",NaN);if(isFinite(area))o.area=area;return o}
function bdCompare(s){const d=num(s,"sp_door",NaN),c=num(s,"sp_corr",NaN),t=num(s,"sp_turn",NaN),r=[];if(isFinite(d))r.push({item:"門的淨寬",value:d,ref:BD.door_shall,ref2:BD.door_should,note:"手冊：淨寬不少於 800mm（建議 850mm）",level:d<BD.door_shall?"error":d<BD.door_should?"info":"ok"});if(isFinite(c))r.push({item:"通道淨寬",value:c,ref:BD.corr_min,ref2:BD.access_route,note:"手冊：通道淨寬不應少於 1200mm；1500mm 可讓兩部輪椅對向通過",level:c<BD.corr_min?"warn":c<BD.access_route?"info":"ok"});if(isFinite(t))r.push({item:"輪椅迴轉空間",value:t,ref:BD.turn,ref2:BD.turn,note:"手冊：1500mm×1500mm 迴轉空間（如升降機門前、通道死胡同附近）",level:t<BD.turn?"warn":"ok"});return r}
function cctBand(k){return k<3200?"warm":k<=4500?"neutral":k>=5000?"cool":"between"}

// ---------- 檢查 ----------
function selTags(s){const out={};CAT_KEYS.filter(k=>!["avoidUX","a11yTests","uiStates","touchpoints","serviceMoments"].includes(k)).forEach(k=>items(k,s).forEach(i=>(i.t||[]).forEach(t=>{(out[t]=out[t]||[]).push(i.zh)})));DIMS.forEach(d=>{const o=picked(s,d.id);if(o)(o.t||[]).forEach(t=>{(out[t]=out[t]||[]).push(o.zh)})});return out}
const ANTI_TAG={"冰冷醫院感":["clinical","cold"],"廉價促銷感":["loud","cheap"],"過度科技炫技":["neon","loud","digital"],"炫富浮誇":["flashy","loud"],"陰暗沉重":["dark"],"過度幼稚":["childish"],"純科技冷硬品牌":["cold","hard"],"老派藥房感":["dated"],"網紅爆款保健品":["loud"],"廉價模板感":["cheap"],"推銷式連鎖美容院":["loud","flashy"]};
const KW_AVOID=[[/克制|安靜|沉穩|沉靜|平靜|從容|舒緩/,["loud","neon","flashy","bold"],"偏張揚"],[/溫暖|溫潤|親切|柔和/,["cold","clinical","hard"],"偏冰冷硬朗"],[/輕盈|空靈|通透/,["dark"],"偏沉重暗"],[/優雅/,["loud","childish","flashy"],"偏浮誇或幼稚"]];
const AVOIDMAT=[["醫院式冷不鏽鋼",["sx_metal","is_fresh"],"info"],["假木紋貼皮",["sx_vinyl"],"info"],["廉價塑膠感",["sx_vinyl"],"info"],["霓虹螢光",["is_future"],"info"],["過度反光鏡面",["sx_metal","sx_glass"],"info"]];
const PAIRS=[["ui_flat","ui_skeu","warn","極簡扁平與擬物方向相反，請說明各自場景。"],["ui_neu","ui_glass","warn","新擬物與玻璃擬態都依賴低對比，疊用風險更高。"],["ui_brut","ui_edit","info","粗獷主義與編輯式風格差異大，請定義各自頁面。"],["nv_top","nv_tab","info",""],["is_min","is_ind","info","極簡與工業風同時選了，請說明各自區域。"],["is_japandi","is_lux","warn","日式禪意與輕奢方向不同，請取捨。"],["sl_warm","sl_cool","warn","暖白氛圍光與冷白檢查光方向相反，請說明各自分區。"],["sn_quiet","sn_music","info","靜默吸音與背景音樂同時選了，請說明何時何處。"],["sn_scent","sn_neutral","error","香氛與氣味中性互相矛盾。"],["zn_wait","zn_wait","info",""]];
function checks(s){
  const out=[],A=(l,m)=>out.push({level:l,msg:m});const tags=selTags(s),T=t=>tags[t]||[],J2=a=>[...new Set(a)].join("、");const tk=tokens(s),ths=themes(s);
  CAT_KEYS.forEach(k=>{if(CAT[k].max<90&&count(k,s)>CAT[k].max)A("warn",`「${CAT[k].title.replace(/（.*/,"")}」選了 ${count(k,s)} 個，超過建議的 ${CAT[k].max} 個。`)});
  PAIRS.forEach(([a,b,l,m])=>{if(a!==b&&m&&has(s,a)&&has(s,b))A(l,`「${anyName(a)}」＋「${anyName(b)}」：${m}`)});
  items("avoidUX",s).forEach(av=>{(av.conf||[]).forEach(c=>{if(has(s,c))A("error",`禁區「${av.zh}」與你選的「${anyName(c)}」互相矛盾。`)})});
  if(count("avoidUX",s)>0&&count("avoidUX",s)<5)A("info","UX 與空間禁區建議至少 5 個。");
  // 色值
  const p=palette(s);COLS.forEach(([id,l])=>{if(T_(s,id)&&!p[id])A("warn",`「${l}」不是有效的 HEX 色值。`)});["c_error","c_success","c_warning","c_info"].forEach(id=>{if(T_(s,id)&&!hex(s.text[id]))A("warn",`語意色 ${id} 不是有效的 HEX 色值。`)});
  const sm=sem(s);if(s.components.length&&sm._defaults.length)A("info",`語意色（${sm._defaults.map(k=>({error:"錯誤",success:"成功",warning:"警告",info:"資訊"}[k])).join("、")}）使用參考預設值；請確認它們與品牌色協調，並通過對比檢查。`);
  // tokens
  if(!s.s4b)A("info","尚未匯入 4B：圓角、陰影、邊框與焦點外框使用預設值（圓角 4／8／12px、邊框 1px、焦點 2px、無陰影）。建議先完成 4B。");
  else if(tk.defaults)A("info","4B 已匯入，但沒有 surface_tokens；請重新匯出 4B brief，或用上方覆寫欄位。");
  if(s.s4b&&/hair|細線|1px/.test(s.s4b.borderWidth)&&tk.border<=1)A("info","4B 的邊框是約 1px 細線；輸入框等控制項的邊界仍須與背景 3:1，細線更要靠顏色對比。");
  if(s.s4b&&/背景高亮/.test(s.s4b.focus))A("warn","4B 的焦點外框是『背景高亮＋底線』（偏移 0）；請確認高亮與底線對相鄰顏色達 3:1，且與 WCAG 2.2 焦點外觀的面積要求（約等於 2px 外框）。");
  // 元件與狀態
  const inter=s.components.filter(id=>(byId("components",id)||{}).inter);
  if(s.components.length&&!s.uiStates.length)A("warn","選了元件，但還沒選要定義的狀態。");
  if(inter.length){if(!has(s,"st_focus"))A("error","有互動元件，但沒有定義『鍵盤焦點』狀態（SC 2.4.7；WCAG 2.2 另有焦點外觀要求）。");if(!has(s,"st_disabled"))A("warn","有互動元件，但沒有定義『禁用』狀態。");if(!has(s,"st_hover")&&!has(s,"st_active"))A("info","沒有定義懸停與按下狀態；觸控與滑鼠的回饋都需要。")}
  if(has(s,"cp_input")){if(!has(s,"st_error"))A("warn","有輸入框，但沒有定義『錯誤』狀態；錯誤須有文字說明，不可只靠顏色。");if(!picked(s,"labelPos"))A("info","有輸入框，但還沒決定標籤位置；佔位文字不可取代標籤。");if(!picked(s,"errorPattern"))A("info","有輸入框，但還沒決定錯誤呈現方式。")}
  if(has(s,"cp_btn")&&has(s,"cp_btn2")===false)A("info","只有主要按鈕：次要行動（取消、返回）需要層級較低的按鈕。");
  if(has(s,"cp_modal")||has(s,"cp_tooltip")||has(s,"cp_nav"))A("info","彈窗、提示氣泡與導覽的行為（焦點鎖定、Esc、焦點返回、方向鍵）無法由顏色檢查，須在無障礙測試中驗證。");
  // 密度與目標大小
  const tp=picked(s,"targetPolicy");if(s.components.length&&inter.length){if(tk.h<24)A("error",`控制項高度 ${tk.h}px 低於 WCAG 2.2 AA 的最小目標 24×24 CSS px（SC 2.5.8；另有間距等例外）。`);else if(tp&&tk.h<tk.targetMin)A("warn",`控制項高度 ${tk.h}px 低於你選的目標大小政策（${tk.targetMin}px）；請加大高度或用透明內距擴大點擊區。`);if(!tp)A("info","還沒決定觸控目標大小政策（24px 為 WCAG 2.2 AA 的最低線；觸控裝置常見指引是 44 或 48）。")}
  const tb=picked(s,"typeBase");if(tb&&tb.id==="ty_14"&&(has(s,"cp_input")))A("info","內文 14px：輸入框字級低於 16px 時，iOS Safari 聚焦會自動放大頁面（常見做法是輸入框至少 16px）。");
  if(tb&&tb.id==="ty_14"&&s.s4d&&s.s4d.usage.some(x=>/長者|低視力/.test(x)))A("warn","4D 的使用情境包含長者或低視力使用者，但內文字級是 14px。");
  if(picked(s,"density")&&picked(s,"density").id==="dn_compact"&&has(s,"ui_data")===false&&s.uxPattern.includes("ux_booking"))A("info","預約流程多在手機使用，精簡密度（32px）會讓觸控吃力。");
  // 對比結果
  const fails=specFails(s);
  if(s.components.length&&!ths.length)A("info","還沒填主色、文字色與背景色，無法做元件對比檢查。");
  if(fails.length){const top=fails.slice(0,6).map(f=>`${f.comp}／${f.item}（${f.state}${f.theme==="深色"?"，深色主題":""}）：${f.fg} 對 ${f.bg} 約 ${fr(f.ratio)}:1，需 ${f.req}:1`);A("warn",`元件對比有 ${fails.length} 項未達門檻：${top.join("；")}${fails.length>6?"；…（其餘見元件實驗室）":""}`)}
  if(s.components.length&&ths.length&&!fails.length)A("info","目前選定元件的所有檢查項目都達到門檻（只涵蓋顏色對比，不含鍵盤、螢幕閱讀器與目標大小以外的行為）。");
  const tm=picked(s,"themeMode");if(has(s,"ui_dark")&&tm&&tm.id==="th_light")A("info","UI 風格含暗色科技，但主題模式只有淺色。");if(tm&&tm.id!=="th_light"&&!has(s,"at_contrast"))A("info","有深色主題，建議在無障礙測試加入對比檢查，並逐一測試深色下的所有狀態。");
  // UI 風格
  const a1=picked(s,"a11yTarget");if(has(s,"ui_neu"))A(a1&&a1.id!=="a1_unset"?"warn":"info","新擬物的邊界與狀態對比常低於 3:1；若要達 WCAG 2.2 AA，須為邊界、選取與焦點另加高對比提示。");
  if(has(s,"ui_glass")){A("warn","玻璃擬態：文字對比取決於模糊後的背景，須用最亮與最暗的背景實測；並提供不透明備援。");if(s.s2&&/完全不透明/.test(s.s2.rules.transparency||""))A("warn",`Stage 2 透明規則是「${s.s2.rules.transparency}」，但 UI 風格選了玻璃擬態。`);if(s.s4a&&s.s4a.avoid.some(v=>/玻璃|模糊/.test(v)))A("warn","4A 視覺禁區有過度模糊玻璃，但 UI 風格選了玻璃擬態。")}
  if(has(s,"ui_brut")&&s.s1&&s.s1.anti.some(x=>/廉價|網紅|浮誇/.test(x)))A("warn","粗獷主義容易被看成廉價或浮誇，與 Stage 1 的 Anti-Persona 要核對。");
  if(has(s,"ui_cute")&&s.s3&&/專業|嚴謹|可靠/.test(s.s3.personality.join("｜")))A("warn","Stage 3 的說話性格偏專業嚴謹，但 UI 風格選了手繪／可愛。");
  if(has(s,"ui_conv")){A("info","對話式介面須披露 AI（若是 AI）、提供人工出口，並讓使用者能回看與修改答案。")}
  if(has(s,"ui_data")&&picked(s,"density")&&picked(s,"density").id==="dn_comfort")A("info","資料密集儀表板搭配寬鬆密度，一屏資訊會很少；請確認是否有意。");
  // UX
  if(has(s,"ux_wizard")&&!has(s,"at_form"))A("info","步驟式精靈建議測試表單（回上一步保留輸入、重複輸入，SC 3.3.7）。");
  if(has(s,"ux_booking")){A("warn","預約流程會收集個人資料（健康相關更敏感）：須最少化收集、說明用途、取得適當同意並可取消；香港適用《個人資料（私隱）條例》，具體合規須由專業人士確認，不是法律意見。");if(!has(s,"tp_booking"))A("info","選了預約流程，但觸點沒有預約系統。")}
  if(has(s,"ux_checkout")&&!has(s,"ax_dark"))A("info","結帳流程是暗黑模式（預選加購、隱藏費用）的高風險位置，建議在禁區加入『暗黑模式』。");
  if(has(s,"ux_member")&&!has(s,"at_auth"))A("warn","會員登入須避免依賴記憶、轉錄或辨識難題（SC 3.3.8）；請加入驗證與登入的無障礙測試。");
  if(has(s,"ux_chat")&&s.s0&&s.s0.claims)A("warn","對話式引導涉及健康或效果宣稱：AI 不可提供診斷或療效保證，須有人工出口與合規審核。");
  if(has(s,"ux_empty")&&!has(s,"st_empty"))A("info","選了空狀態與錯誤處理，但狀態清單沒有『空狀態』。");
  if(s.s3&&/書面/.test(s.s3.script)&&picked(s,"errorPattern"))A("info","Stage 3 是書面語：錯誤與按鈕文案須沿用同一套語氣，並設定頁面語言（lang）；中英混合時標示各段語言（SC 3.1.1、3.1.2）。");
  if(has(s,"ux_onboard"))A("info","引導上手須可跳過、可稍後再看，且不阻擋核心任務。");
  // 無障礙測試
  if(s.components.length&&!s.a11yTests.length)A("warn","有元件規範，但還沒選任何無障礙測試。自動工具只找得到部分問題。");
  if(s.a11yTests.length&&!has(s,"at_kbd")&&!has(s,"at_sr"))A("warn","無障礙測試沒有鍵盤操作與螢幕閱讀器，這兩項最能抓出自動工具找不到的問題。");
  if(s.a11yTests.length&&!has(s,"at_user")&&s.s4d&&s.s4d.usage.some(x=>/長者|低視力/.test(x)))A("info","使用情境包含長者或低視力：建議加入真人測試。");
  if(a1&&a1.id==="a1_unset")A("info","無障礙目標尚未決定；在決定並測試前，不可宣稱符合任何等級。");
  // 旅程
  const jrows=journeyRows(s),filled=jrows.filter(r=>r.tp||r.act);
  if(s.touchpoints.length&&!filled.length)A("info","已選觸點，但旅程表還沒填。");
  if(filled.length&&filled.length<STAGES.length)A("info",`旅程表只填了 ${filled.length}/${STAGES.length} 個階段；沒填的階段通常是體驗缺口。`);
  jrows.forEach((r,i)=>{const e=parseInt(r.emo);if(e&&e<=2&&!r.opp)A("warn",`旅程「${r.stage}」的情緒很低（${EMO[e]}），但沒有寫改善機會。`);if(i>0){const pe=parseInt(jrows[i-1].emo);if(pe&&e&&pe-e>=2&&!r.opp)A("info",`旅程由「${jrows[i-1].stage}」到「${r.stage}」情緒下跌 ${pe-e} 級，建議寫改善機會。`)}if((r.tp||r.act)&&!r.back&&r.front)A("info",`旅程「${r.stage}」寫了前台但沒有後台支援，服務藍圖不完整。`)});
  if(has(s,"sm_wait")&&!has(s,"zn_wait")&&s.spaceType.length)A("info","服務時刻包含等候，但空間分區沒有等候區。");
  if(has(s,"sm_complaint")&&!jrows.some(r=>/投訴|補救/.test(r.opp+r.act+r.front)))A("info","服務時刻包含投訴與補救，但旅程表沒有對應的安排。");
  if(has(s,"sm_pay")&&s.uxPattern.includes("ux_checkout")===false&&s.s0&&s.s0.delivery.some(x=>/網上|線上/.test(x)))A("info","Stage 0 有線上交付，但 UX 模式沒有結帳流程。");
  // 空間
  const sp=s.spaceType.length>0;
  if(sp&&!s.zones.length)A("info","已選空間類型，但還沒選分區。");
  if(sp&&!s.spaceAccess.length)A("warn","已選空間類型，但還沒選任何無障礙空間設計；請對照建築署《設計手冊：暢通無阻的通道》並由註冊專業人士確認。");
  const pro=[...items("spaceType",s),...items("zones",s),...items("spaceMat",s),...items("spaceLight",s),...items("spaceSensory",s),...items("wayfinding",s),...items("spaceAccess",s)].filter(i=>i.pro);
  if(pro.length)A("info",`${pro.length} 項空間選擇涉及建築、消防、電氣、衛生或無障礙要求，須由註冊專業人士確認；本原型只作設計方向。`);
  const cp=picked(s,"cleanPolicy"),cc=picked(s,"cctPolicy"),cr=picked(s,"crowdPolicy");
  if(has(s,"sp_clinic")){if(has(s,"sx_carpet"))A("warn","診所空間用地毯：清潔、過敏與感染控制須評估。");if(has(s,"sn_scent"))A("warn","診所空間用香氛：過敏與氣喘風險，通常須避免或提示。");if(has(s,"sx_glass")&&has(s,"zn_consult"))A("info","諮詢區用玻璃隔間：視覺與聲音私隱須處理（霧面、窗簾、隔音）。");if(has(s,"zn_consult")||has(s,"zn_room"))A("info","診療與諮詢的私隱：聲音外洩、病人資料在櫃檯可見，須納入空間與流程設計。");if(!cp||cp.id==="cl_std")A("info","診所空間的清潔與消毒要求通常高於一般清潔；請確認清潔政策與材料耐受。")}
  if(cp&&["cl_freq","cl_clin"].includes(cp.id)){const bad=["sx_carpet","sx_wallpaper","sx_fabric","sx_wood"].filter(i=>has(s,i));if(bad.length)A("warn",`清潔政策是頻繁消毒或醫療級，但選了${bad.map(anyName).join("、")}；須確認耐消毒與可清潔性。`)}
  if(cc){const k=num(s,"sp_cct",NaN);if(isFinite(k)){const b=cctBand(k);const want={cc_warm:"warm",cc_neu:"neutral",cc_cool:"cool"}[cc.id];if(want&&b!==want)A("warn",`色溫政策是「${cc.zh}」，但填寫的主要色溫是 ${k}K（${{warm:"偏暖",neutral:"中性",cool:"偏冷",between:"介於暖與中性之間"}[b]}）。`)}}
  if(cc&&cc.id==="cc_cool"&&(has(s,"sl_warm")))A("warn","色溫政策偏冷，但燈光選了暖白氛圍光。");if(cc&&cc.id==="cc_warm"&&has(s,"sl_cool"))A("warn","色溫政策偏暖，但燈光選了冷白檢查光。");
  if(cr&&cr.id!=="cr_appt"&&!has(s,"zn_wait"))A("info","客流含即場排隊，但沒有等候區分區。");
  const q=queueCalc(s);if(q){if(q.util!=null&&q.util>1)A("error",`高峰每小時到達 ${q.peak} 人，超過服務容量（每小時約 ${q.perHour.toFixed(1)} 人）：隊伍會持續變長。`);else if(q.util!=null&&q.util>.85)A("warn",`高峰利用率約 ${(q.util*100).toFixed(0)}%，接近滿載；任何延誤都會堆積成隊伍，請預留餘量。`);if(q.seats!=null&&q.L!=null&&q.area&&q.seats*1.2>q.area/2)A("info","等候人數換算的座位數相對面積偏多，請確認等候區是否放得下。")}
  if(has(s,"wf_color")&&!has(s,"wf_icon")&&!has(s,"wf_door"))A("warn","色彩分區不可單獨使用（色盲辨識）；請加上文字或圖示。");
  if(has(s,"wf_digital"))A("info","數碼屏須考慮亮度、眩光與閃爍（每秒不超過 3 次），故障時要有備援標示。");
  const sg=picked(s,"signageLang");if(s.wayfinding.length&&!sg)A("info","已選尋路項目，但還沒決定標示語言。");if(s.s0&&s.s0.languages.some(x=>/英/.test(x))&&sg&&sg.id==="sg_zh")A("info","Stage 0 的語言包含英文，標示只有繁體中文。");
  bdCompare(s).forEach(r=>{if(r.level==="error")A("warn",`${r.item} ${r.value}mm 低於建築署手冊的 ${r.ref}mm（${r.note}）。須由註冊專業人士確認是否適用與合規。`);else if(r.level==="warn")A("warn",`${r.item} ${r.value}mm 低於手冊參考值 ${r.ref}mm（${r.note}）。`);else if(r.level==="info")A("info",`${r.item} ${r.value}mm 低於 ${r.ref2}mm（${r.note}）。`)});
  if(s.spaceAccess.length&&![num(s,"sp_door",NaN),num(s,"sp_corr",NaN),num(s,"sp_turn",NaN)].some(isFinite))A("info","已選無障礙空間，但沒有填門寬、通道寬與迴轉空間，無法與手冊參考值比較。");
  // 室內與前階段
  const wm=s.s2&&s.s2.material;
  if(s.s4d){if(s.s4d.usage.some(x=>/診所|專業/.test(x))&&sp&&!has(s,"sp_clinic"))A("info","4D 的產品使用情境是診所或專業環境，但空間類型沒有診所。");if(s.s4d.compliance.some(x=>/醫療器材/.test(x))&&has(s,"sp_clinic"))A("info","4D 提到醫療器材分類；診所空間與器材的規管要求須由專業人士確認。");if(s.s4d.materials.some(x=>/木/.test(x))&&has(s,"is_ind"))A("info","4D 產品用木材，空間選了工業風，請確認材質語言是否一致。")}
  if(s.s4b&&s.s4b.avoid.length&&has(s,"ui_glass")&&s.s4b.avoid.some(v=>/玻璃|模糊/.test(v)))A("warn","4B 表面禁區有玻璃或模糊，但 UI 風格選了玻璃擬態。");
  if(s.s4c){if(!s.s4c.reduced)A("info","4C 尚未定義減少動態政策；UI 元件的動態須遵循。");if(s.s4c.avoid.some(x=>/輪播|自動/.test(x))&&false)A("info","");const dur=parseFloat((s.s4c.tokens["--duration-base"]||"").replace("ms",""));if(isFinite(dur)&&dur>400&&(has(s,"cp_btn")||has(s,"cp_btn2")))A("info",`4C 的常用時長是 ${dur}ms，按鈕與輸入的互動回饋宜在約 100–250ms，請區分元件回饋與頁面轉場的時長。`)}
  else A("info","尚未匯入 4C，無法對照動態 token 與減少動態政策。");
  const a=s.s4a;if(a){const soft=a.shape.filter(x=>/大圓角|膠囊|有機/.test(x)),hard=a.shape.filter(x=>/直角|斜角/.test(x));if(soft.length&&tk.rad.md<4&&!tk.defaults)A("warn",`4A 的形狀是「${soft.join("、")}」，但 UI 圓角約 ${tk.rad.md}px。`);if(hard.length&&tk.rad.md>=16)A("warn",`4A 的形狀是「${hard.join("、")}」，但 UI 圓角約 ${tk.rad.md}px。`)}
  const r2=s.s2&&s.s2.rules;if(r2){if(/直角/.test(r2.radius||"")&&tk.rad.md>0&&!tk.defaults)A("warn",`Stage 2 圓角規則是「${r2.radius}」，但 UI 圓角約 ${tk.rad.md}px。`);if(/無陰影/.test(r2.elevation||"")&&tk.shadow.md!=="none"&&!tk.defaults)A("warn",`Stage 2 陰影規則是「${r2.elevation}」，但 4B tokens 的中層陰影不是 none。`)}
  // Stage 1/2/3
  const q1=s.s1;
  if(q1){q1.anti.forEach(x=>{const hit=J2((ANTI_TAG[x]||[]).flatMap(t=>T(t)));if(hit)A("warn",`Stage 1 要避免「${x}」，但你選的 ${hit} 容易帶來這種感覺。`)});q1.dials.forEach(d=>{if(d.id==="quiet_bold"&&d.position<=-1&&(T("loud").length||T("bold").length||T("neon").length))A("warn",`Stage 1 傾向「低調克制」，但 ${J2([...T("loud"),...T("bold"),...T("neon")])} 偏張揚。`);if(d.id==="premium_access"&&d.position<=-1&&T("cheap").length)A("warn",`Stage 1 傾向「高端稀有」，但 ${J2(T("cheap"))} 容易顯廉價。`);if(d.id==="authority_friend"&&d.position<=-1&&T("childish").length)A("warn",`Stage 1 傾向「專業權威」，但 ${J2(T("childish"))} 偏孩子氣。`)})}
  else A("info","尚未匯入 Stage 1，無法做定位交叉檢查。");
  const m=s.s2;
  if(m){m.keywords.forEach(k=>KW_AVOID.forEach(([re,tg,msg])=>{if(re.test(k)){const hit=J2(tg.flatMap(t=>T(t)));if(hit)A("warn",`Stage 2 的關鍵字「${k}」，但 ${hit} ${msg}。`)}}));m.avoid.forEach(av=>AVOIDMAT.forEach(([nm,ids,lv])=>{if(norm(av).includes(norm(nm)))ids.filter(i=>has(s,i)).forEach(i=>A(lv,`Stage 2 物理禁區有「${av}」，但你選了「${anyName(i)}」。`))}))}
  else A("info","尚未匯入 Stage 2，無法做材質與感官交叉檢查。");
  if(!s.s3)A("info","尚未匯入 Stage 3，無法對照介面文案與語氣。");
  // Stage 0
  const z=s.s0;if(z){if(z.delivery.some(x=>/到店|診所|店舖|現場/.test(x))&&!sp)A("info","Stage 0 有到店或現場交付，但還沒選空間類型。");if(z.flags.includes("health")&&has(s,"sn_scent"))A("warn","業務涉及健康：香氛須謹慎。");if(z.claims&&has(s,"sm_follow"))A("info","跟進訊息涉及健康或效果宣稱時，內容須人類合規審核，並提供退訂。");if(/1 萬以下/.test(z.budget)&&(has(s,"sx_stone")||has(s,"is_lux")||has(s,"sl_dim")))A("warn","Stage 0 品牌預算低於 1 萬港元，但空間選了高成本項目（石材、輕奢或可調光）；裝修預算通常是另一個數量級，請另行確認。")}
  return out}

// ---------- 輸出 ----------
function draft(s){const L=(k,n)=>labels(k,s).slice(0,n).join("、")||"［尚未選擇］";const P=d=>{const o=picked(s,d);return o?o.zh:"［未定］"};
  return `${brandName(s)} 的 UI／UX 與空間體驗：UI「${L("uiStyle",2)}」（${P("density")}、${P("themeMode")}），UX「${L("uxPattern",2)}」，元件 ${count("components",s)} 項、無障礙目標「${P("a11yTarget")}」；空間「${L("spaceType",1)}」風格「${L("interiorStyle",2)}」，燈光「${P("cctPolicy")}」，客流「${P("crowdPolicy")}」。${count("avoidUX",s)?"禁區："+labels("avoidUX",s).slice(0,4).join("、")+"。":""}`}
function negatives(s){const n=[...labels("avoidUX",s)];if(s.s1)n.push(...s.s1.anti);if(s.s2)n.push(...s.s2.anti,...s.s2.avoid);if(s.s4a)n.push(...s.s4a.avoid);if(s.s4b)n.push(...s.s4b.avoid);return [...new Set(n)]}
function uiTokensCSS(s){const ths=themes(s),tk=tokens(s),sm=sem(s);if(!ths.length)return "/* 尚未填寫主色、文字色與背景色 */\n";const L=ths[0],D=ths[1];const cv=(t)=>`  --color-bg:${t.bg};\n  --color-fg:${t.fg};\n  --color-primary:${t.primary};\n  --color-secondary:${t.secondary};\n  --color-accent:${t.accent};\n  --color-focus:${pickRing(t)};`;
  let css=`:root{\n${cv(L)}\n  --color-error:${sm.error};\n  --color-success:${sm.success};\n  --color-warning:${sm.warning};\n  --color-info:${sm.info};\n  --radius-sm:${tk.rad.sm}px;\n  --radius-md:${tk.rad.md}px;\n  --radius-lg:${tk.rad.lg}px;\n  --shadow-sm:${tk.shadow.sm};\n  --shadow-md:${tk.shadow.md};\n  --shadow-lg:${tk.shadow.lg};\n  --border-width:${tk.border}px;\n  --focus-width:${tk.focus}px;\n  --focus-offset:${tk.focusOff}px;\n  --control-height:${tk.h}px;\n  --control-padding-x:${tk.pad}px;\n  --target-min:${tk.targetMin}px;\n  --space-unit:${tk.space}px;\n  --text-base:${tk.text}px;\n`;
  if(s.s4c)Object.entries(s.s4c.tokens).filter(([k])=>/^--(duration|ease|stagger)/.test(k)).forEach(([k,v])=>{css+=`  ${k}:${v};\n`});css+="}\n";
  if(D){const tm=picked(s,"themeMode");css+=`/* 深色主題：所有對比須重測 */\n:root[data-theme="dark"]{\n${cv(D)}\n}\n`;if(tm&&tm.id==="th_auto")css+=`@media (prefers-color-scheme: dark){\n  :root:not([data-theme="light"]){\n${cv(D).replace(/^/gm,"  ")}\n  }\n}\n`}
  css+=`/* 焦點外框（鍵盤焦點） */\n:focus-visible{outline:var(--focus-width) solid var(--color-focus);outline-offset:var(--focus-offset)}\n`;css+=`/* 觸控目標 */\nbutton,[role="button"],input,select,textarea,a.btn{min-height:var(--control-height);min-width:var(--target-min)}\n`;
  const fp=picked(s,"focusPolicy");if(fp&&fp.id==="fp_always")css+=`:focus{outline:var(--focus-width) solid var(--color-focus);outline-offset:var(--focus-offset)}\n`;
  css+=`@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}\n`;return css}
function componentSpec(s){const ths=themes(s),tk=tokens(s);return {schema:"headx.component-spec/v1",status:"draft",note:"對比數值只涵蓋顏色；鍵盤、螢幕閱讀器與行為須另行測試。WCAG 門檻僅作設計檢查，不等於已符合。",brand:brandName(s),density:(picked(s,"density")||{}).zh||null,tokens:{radius:tk.rad,border:tk.border,focus:tk.focus,focus_offset:tk.focusOff,shadow:tk.shadow,control_height:tk.h,target_min:tk.targetMin,space:tk.space,text:tk.text,from_4b:!tk.defaults},states:labels("uiStates",s),
  components:specAll(s).map(c=>({id:c.id,name:c.name,theme:c.theme,sizes:c.sizes,checks:c.rows.map(r=>({item:r.item,state:r.state,fg:r.fg,bg:r.bg,rule:COLORKIND[r.kind],contrast:Math.floor(r.ratio*100)/100,pass:r.pass,note:r.note||null}))})),failures:specFails(s).length,approval:{state:"draft",approved_by:null}}}
function a11yPlan(s){const md=[`# ${brandName(s)} · 無障礙測試計畫（draft）\n`,"> 目標："+((picked(s,"a11yTarget")||{zh:"尚未決定"}).zh)+"。設計門檻僅供檢查，不等於已符合或已通過審核。SC 編號請對照 W3C WCAG 2.2 原文。\n"];
  md.push("## 測試項目\n");items("a11yTests",s).forEach(t=>md.push(`- [ ] **${t.zh}**：${t.desc}　常見問題：${t.avoid||"—"}　（${t.note||"手動"}）`));if(!s.a11yTests.length)md.push("（尚未選擇）");
  md.push("\n## 元件與狀態\n");const fails=specFails(s);md.push(`元件：${labels("components",s).join("、")||"（未選）"}\n\n狀態：${labels("uiStates",s).join("、")||"（未選）"}\n\n顏色對比未達門檻：${fails.length} 項`);fails.slice(0,30).forEach(f=>md.push(`- ${f.comp}／${f.item}（${f.state}${f.theme==="深色"?"，深色":""}）：${f.fg} / ${f.bg} = ${fr(f.ratio)}:1（需 ${f.req}:1）`));
  md.push("\n## 每個互動元件都要逐項測試\n\n- [ ] 鍵盤可到達與操作\n- [ ] 焦點可見（對相鄰顏色 3:1）且不被其他內容遮住\n- [ ] 名稱、角色、狀態由程式提供\n- [ ] 觸控目標至少 24×24 CSS px（目標政策："+((picked(s,"targetPolicy")||{zh:"未定"}).zh)+"）\n- [ ] 錯誤與狀態不只靠顏色\n- [ ] 減少動態設定下仍可使用\n");return md.join("\n")}
function journeyCSV(s){return "階段,觸點,顧客行動,前台（可見）,後台（不可見）,情緒(1-5),痛點,改善機會\n"+journeyRows(s).map(r=>[r.stage,r.tp,r.act,r.front,r.back,r.emo,r.pain,r.opp].map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n")}
function spaceSpec(s){const P=d=>{const o=picked(s,d);return o?o.zh:null};return {schema:"headx.space-spec/v1",status:"draft-needs-professional-validation",warning:"本檔案只記錄空間體驗方向。建築、消防、電氣、衛生、無障礙與規管要求必須由註冊專業人士確認，不是法律意見。",brand:brandName(s),type:labels("spaceType",s),style:labels("interiorStyle",s),zones:labels("zones",s),materials:labels("spaceMat",s),lighting:{items:labels("spaceLight",s),policy:P("cctPolicy"),cct_k:num(s,"sp_cct",null)},sensory:labels("spaceSensory",s),cleaning:P("cleanPolicy"),crowd:P("crowdPolicy"),wayfinding:{items:labels("wayfinding",s),language:P("signageLang")},accessibility:{items:labels("spaceAccess",s),dimensions_mm:{door:num(s,"sp_door",null),corridor:num(s,"sp_corr",null),turning:num(s,"sp_turn",null)},reference:"建築署《設計手冊：暢通無阻的通道》公開摘錄（門淨寬不少於 800mm、建議 850mm；通道淨寬不應少於 1200mm；1500mm×1500mm 迴轉空間）；以最新版本與註冊專業人士判斷為準",comparison:bdCompare(s)},capacity:queueCalc(s),journey_moments:labels("serviceMoments",s),approval:{state:"draft",approved_by:null}}}
function uiPrompt(s){const L=k=>labels(k,s).join(", ")||"unspecified",P=d=>{const o=picked(s,d);return o?o.zh:"unspecified"};const p=palette(s),tk=tokens(s);const neg=negatives(s).join(", ")||"none specified";
  return `Design a UI screen for the brand "${brandName(s)}".\nUI style: ${L("uiStyle")}; UX pattern: ${L("uxPattern")}; navigation: ${P("navPattern")}; density: ${P("density")}; theme: ${P("themeMode")}.\nColours: primary ${p.c_primary||"?"}, secondary ${p.c_secondary||"?"}, accent ${p.c_accent||"?"}, text ${p.c_ink||"?"}, background ${p.c_paper||"?"}.\nTokens: radius ${tk.rad.sm}/${tk.rad.md}/${tk.rad.lg}px, border ${tk.border}px, focus ring ${tk.focus}px offset ${tk.focusOff}px, control height ${tk.h}px, minimum target ${tk.targetMin}px.\nComponents to show with states (${L("uiStates")}): ${L("components")}.\nKey moments: 1) ${T_(s,"ks1")||"unspecified"} 2) ${T_(s,"ks2")||"unspecified"} 3) ${T_(s,"ks3")||"unspecified"}.\nRequirements: text contrast at least 4.5:1, UI component boundaries and focus at least 3:1, never rely on colour alone, visible labels (no placeholder-only), errors in text with icon.\nNegative constraints (must NOT appear): ${neg}. No dark patterns (hidden cancel, pre-ticked options, shaming copy). No gibberish text, no watermarks.\nNote: concept mock-up only; it has not been tested for accessibility and must be verified with real tools and users.`}
function spacePrompt(s){const L=k=>labels(k,s).join(", ")||"unspecified",P=d=>{const o=picked(s,d);return o?o.zh:"unspecified"};const neg=negatives(s).join(", ")||"none specified";const p=palette(s);
  return `Create an interior concept render for the brand "${brandName(s)}".\nSpace type: ${L("spaceType")}${T_(s,"sp_area")?" (about "+T_(s,"sp_area")+" m²)":""}; style: ${L("interiorStyle")}; zones: ${L("zones")}.\nMaterials: ${L("spaceMat")}; lighting: ${L("spaceLight")} (${P("cctPolicy")}); sensory: ${L("spaceSensory")}.\nBrand colours: primary ${p.c_primary||"?"}, secondary ${p.c_secondary||"?"}, accent ${p.c_accent||"?"}.\nWayfinding: ${L("wayfinding")}; accessibility features visible: ${L("spaceAccess")}.\nKey moments: 1) ${T_(s,"ks1")||"unspecified"} 2) ${T_(s,"ks2")||"unspecified"} 3) ${T_(s,"ks3")||"unspecified"}.\nNegative constraints (must NOT appear): ${neg}. No fake logos, no gibberish text, no watermarks.\nNote: concept visual only; it is not an architectural drawing and has not been reviewed for building, fire, electrical, hygiene or accessibility requirements by a registered professional.`}
function buildGuide(s){const L=k=>labels(k,s),P=d=>{const o=picked(s,d);return o?`${o.zh}（${o.desc}）`:"（未定義）"};const md=[],H=t=>md.push("\n## "+t+"\n");const tk=tokens(s);
  md.push(`# ${brandName(s)} · UI／UX 與空間體驗指南（ui-space-guide）`);md.push(`\n> ${T_(s,"statement")||draft(s)}\n`);md.push("> 草稿，不等於核准。無障礙門檻僅作設計檢查；實體空間要求須由註冊專業人士確認；本指南不是法律意見。");
  H("1. UI 風格與基礎");md.push(`風格：${L("uiStyle").join("、")||"（未選）"}\n\n密度：${P("density")}\n\n間距：${P("spacingBase")}\n\n字級：${P("typeBase")}\n\n主題：${P("themeMode")}\n\n圖示：${P("iconStyle")}\n\n無障礙目標：${P("a11yTarget")}`);
  H("2. 表面 tokens（來自 4B）");md.push(`圓角 ${tk.rad.sm}／${tk.rad.md}／${tk.rad.lg}px｜邊框 ${tk.border}px｜焦點外框 ${tk.focus}px，偏移 ${tk.focusOff}px｜控制項高度 ${tk.h}px｜最小目標 ${tk.targetMin}px${tk.defaults?"（部分為預設值，尚未由 4B 提供）":""}`);
  H("3. UX 模式");md.push(`${L("uxPattern").join("、")||"（未選）"}\n\n導覽：${P("navPattern")}\n\n標籤：${P("labelPos")}\n\n錯誤：${P("errorPattern")}`);
  H("4. 元件規範");const sa=specAll(s);md.push(`狀態：${L("uiStates").join("、")||"（未選）"}\n\n目標大小：${P("targetPolicy")}\n\n焦點：${P("focusPolicy")}`);sa.forEach(c=>{md.push(`\n### ${c.name}（${c.theme}）\n\n高度 ${c.sizes.height||"—"}｜圓角 ${c.sizes.radius}px｜邊框 ${c.sizes.border}px｜陰影 ${c.sizes.shadow}\n\n| 項目 | 狀態 | 前景 | 背景 | 規則 | 對比 | 結果 |\n|---|---|---|---|---|---|---|\n`+c.rows.map(r=>`| ${r.item} | ${r.state} | ${r.fg} | ${r.bg} | ${COLORKIND[r.kind]} | ${fr(r.ratio)}:1 | ${r.kind==="info"?"參考":r.pass?"通過":"未通過"} |`).join("\n"))});
  H("5. 無障礙測試");md.push(L("a11yTests").map(x=>"- "+x).join("\n")||"（未選）");
  H("6. 旅程與服務藍圖");md.push("| 階段 | 觸點 | 顧客行動 | 前台 | 後台 | 情緒 | 痛點 | 機會 |\n|---|---|---|---|---|---|---|---|\n"+journeyRows(s).map(r=>`| ${r.stage} | ${r.tp||"—"} | ${r.act||"—"} | ${r.front||"—"} | ${r.back||"—"} | ${EMO[parseInt(r.emo)]||"—"} | ${r.pain||"—"} | ${r.opp||"—"} |`).join("\n"));
  H("7. 空間（須註冊專業人士確認）");md.push(`類型：${L("spaceType").join("、")||"（未選）"}\n\n風格：${L("interiorStyle").join("、")||"（未選）"}\n\n分區：${L("zones").join("、")||"（未選）"}\n\n材質：${L("spaceMat").join("、")||"（未選）"}\n\n燈光：${L("spaceLight").join("、")||"（未選）"}（${P("cctPolicy")}）\n\n感官：${L("spaceSensory").join("、")||"（未選）"}\n\n清潔：${P("cleanPolicy")}\n\n客流：${P("crowdPolicy")}\n\n尋路：${L("wayfinding").join("、")||"（未選）"}\n\n無障礙：${L("spaceAccess").join("、")||"（未選）"}`);const q=queueCalc(s);if(q)md.push(`\n容量：${q.rooms} 間，每節循環 ${q.cyc} 分鐘，每小時約 ${q.perHour.toFixed(1)} 人，每日約 ${q.daily} 人${q.seats!=null?`；高峰等候約 ${q.L.toFixed(1)} 人（Little's law：L＝λW），建議座位至少 ${q.seats}`:""}`);
  H("8. 禁區");md.push(negatives(s).map(x=>"- "+x).join("\n")||"（未定義）");H("9. 3 個關鍵時刻");md.push(KEYS.map(([id,l])=>`- ${l}：${T_(s,id)||"（未填）"}`).join("\n"));return md.join("\n")}
function buildSystem(s){const L=k=>labels(k,s).join("、")||"（未定義）",P=d=>{const o=picked(s,d);return o?o.zh:"（未定義）"};const tk=tokens(s);
  return `你是「${brandName(s)}」的 UI／UX 與空間體驗設計 Agent。所有介面設計、元件規範、使用者旅程、服務藍圖、空間概念與生成提示詞，必須遵守以下規範。\n${s.s4a&&s.s4a.statement?"視覺語言（4A）："+s.s4a.statement+"\n":""}${s.s4b&&s.s4b.statement?"表面系統（4B）："+s.s4b.statement+"\n":""}${s.s3&&s.s3.statement?"語氣（Stage 3）："+s.s3.statement+"\n":""}\n【一句話】${T_(s,"statement")||draft(s)}\n【UI】風格 ${L("uiStyle")}；密度 ${P("density")}；主題 ${P("themeMode")}；字級 ${P("typeBase")}；無障礙目標 ${P("a11yTarget")}\n【tokens】圓角 ${tk.rad.sm}/${tk.rad.md}/${tk.rad.lg}px；邊框 ${tk.border}px；焦點 ${tk.focus}px 偏移 ${tk.focusOff}px；控制項高度 ${tk.h}px；最小目標 ${tk.targetMin}px\n【UX】模式 ${L("uxPattern")}；導覽 ${P("navPattern")}；標籤 ${P("labelPos")}；錯誤 ${P("errorPattern")}\n【元件與狀態】${L("components")}；${L("uiStates")}\n【旅程】觸點 ${L("touchpoints")}；服務時刻 ${L("serviceMoments")}\n【空間】類型 ${L("spaceType")}；風格 ${L("interiorStyle")}；分區 ${L("zones")}；材質 ${L("spaceMat")}；燈光 ${L("spaceLight")}（${P("cctPolicy")}）；感官 ${L("spaceSensory")}；尋路 ${L("wayfinding")}；無障礙 ${L("spaceAccess")}\n\n【絕對禁止】${negatives(s).join("、")||"（未定義）"}\n\n【工作規則】\n1) 文字與背景對比至少 4.5:1（大字 3:1）；元件邊界、狀態與焦點外框對相鄰顏色至少 3:1；不可只靠顏色傳達資訊；佔位文字不可取代標籤。\n2) 每個互動元件都要定義預設、懸停、焦點、按下、禁用，表單另加錯誤與成功；焦點必須清楚可見且不被遮住；目標大小不低於所選政策。\n3) 對比數值只涵蓋顏色；鍵盤、螢幕閱讀器與行為須由人類測試，不可宣稱『已符合 WCAG』或『已通過無障礙審核』。\n4) 不可使用暗黑模式（隱藏取消、預選加購、羞辱式拒絕文案、假倒數）；健康或個人資料的收集須最少化並取得適當同意；AI 對話須披露並提供人工出口。\n5) 空間設計只作方向：建築、消防、電氣、衛生、無障礙與規管要求須由註冊專業人士確認；不可編造尺寸、法規或認證；引用建築署手冊的數值須標示來源並以最新版為準。\n6) 旅程與服務藍圖須標明每個階段的觸點、前台與後台、情緒與改善機會，不可自行虛構使用者研究結果。\n7) 遇到規範沒有涵蓋或互相衝突的情況，請回報人類，不要自行決定。\n8) 所有輸出標示為『AI 提案，待人類核准』。`}
function hints(s){const H=[],A=(st,f,t,w)=>H.push({stage:st,field:f,text:t,why:w});
  A("4F 行銷內容與廣告","落地頁與廣告","把元件規範與 UX 模式用在落地頁、表單與廣告承接頁；轉化頁不可使用暗黑模式","UI 與 UX 規則");
  A("4F 行銷內容與廣告","空間內容","把空間分區、燈光與材質轉為店內陳列、社群與活動物料的拍攝與製作簡報","空間體驗");
  A("4G 跨媒體使用與治理","治理","建立元件庫版本、無障礙測試紀錄（日期、測試者、工具、結果）、空間專業人士與核准紀錄；規範何時可偏離","元件與空間規範");
  if(s.a11yTests.length)A("4G 跨媒體使用與治理","無障礙審稿","把無障礙測試計畫變成上線前的審稿清單與例外處理流程","已選測試："+labels("a11yTests",s).join("、"));
  A("4H 風格庫與 AI 生成契約","風格庫","把 UI tokens、元件規範、旅程模板與空間概念存成可重用條目，附 UI Prompt、空間 Prompt 與負面約束","供 AI 生成使用");
  return H}
function completeness(s){const p=palette(s),jf=journeyRows(s).filter(r=>r.tp||r.act).length;const c=[
  ["ui","UI 風格與基礎（密度、間距、字級、主題、圖示）",count("uiStyle",s)>=1&&["density","spacingBase","typeBase","themeMode","iconStyle"].every(d=>picked(s,d))],["palette","5 個色值",Object.keys(p).length===5],["ux","UX 模式、導覽、標籤與錯誤",count("uxPattern",s)>=1&&["navPattern","labelPos","errorPattern"].every(d=>picked(s,d))],
  ["comp","元件（至少 5 個）與狀態",count("components",s)>=5&&count("uiStates",s)>=4],["target","目標大小、焦點與無障礙目標",["targetPolicy","focusPolicy","a11yTarget"].every(d=>picked(s,d))],["a11y","無障礙測試（至少 5 項）",count("a11yTests",s)>=5],
  ["journey","觸點與旅程表（至少填 4 個階段）",count("touchpoints",s)>=1&&jf>=4],["moments","服務時刻",count("serviceMoments",s)>=1],["space","空間類型、風格與分區",count("spaceType",s)>=1&&count("interiorStyle",s)>=1&&count("zones",s)>=1],
  ["spmat","空間材質、燈光、感官與清潔",["spaceMat","spaceLight","spaceSensory"].every(k=>count(k,s)>=1)&&!!picked(s,"cctPolicy")&&!!picked(s,"cleanPolicy")],["flow","客流與容量",!!picked(s,"crowdPolicy")&&!!queueCalc(s)],["way","尋路、標示語言與無障礙空間",count("wayfinding",s)>=1&&count("spaceAccess",s)>=1&&!!picked(s,"signageLang")],
  ["avoid","禁區（至少 5 個）",count("avoidUX",s)>=5],["moments3","3 個關鍵時刻",!!(T_(s,"ks1")&&T_(s,"ks2")&&T_(s,"ks3"))]];
  const done=c.filter(x=>x[2]).length;return {done,total:c.length,pct:Math.round(done/c.length*100),missing:c.filter(x=>!x[2]).map(x=>({key:x[0],label:x[1]}))}}
function buildBrief(s){const c=completeness(s),pk=k=>items(k,s).map(i=>({id:i.id,name:i.zh,note:i.desc}));const dm={};DIMS.forEach(d=>{const o=picked(s,d.id);if(o)dm[d.id]={id:o.id,name:o.zh,note:o.desc}});const tx={};TEXTS.forEach(t=>{if(T_(s,t.id))tx[t.id]=T_(s,t.id)});const tk=tokens(s);
  return {schema:"brand/stage4e-ui-ux-space/v1",status:c.missing.length?"incomplete":"complete",completeness:c.pct,missing:c.missing,approval:{state:"draft",approved_by:null,note:"草稿；AI 提案與表單填寫不等於人類核准；無障礙須實測；空間須註冊專業人士確認。"},
   stage_context:{stage0:s.s0||null,stage1:s.s1||null,stage2:s.s2||null,stage3:s.s3||null,stage4a:s.s4a||null,stage4b:s.s4b||null,stage4c:s.s4c||null,stage4d:s.s4d||null},brand_name:brandName(s),
   ui:{styles:pk("uiStyle"),density:dm.density||null,spacing:dm.spacingBase||null,type_base:dm.typeBase||null,theme:dm.themeMode||null,icons:dm.iconStyle||null,a11y_target:dm.a11yTarget||null,palette:palette(s),semantic:sem(s),tokens:{radius:tk.rad,border:tk.border,focus:tk.focus,focus_offset:tk.focusOff,shadow:tk.shadow,control_height:tk.h,target_min:tk.targetMin,from_4b:!tk.defaults},overrides:{radius:tx.u_radius||null,border:tx.u_border||null,focus:tx.u_focus||null}},
   ux:{patterns:pk("uxPattern"),navigation:dm.navPattern||null,label_position:dm.labelPos||null,error_pattern:dm.errorPattern||null},components:{selected:pk("components"),states:pk("uiStates"),target_policy:dm.targetPolicy||null,focus_policy:dm.focusPolicy||null,spec:componentSpec(s)},a11y_tests:pk("a11yTests"),
   journey:{touchpoints:pk("touchpoints"),service_moments:pk("serviceMoments"),stages:journeyRows(s)},
   space:{types:pk("spaceType"),style:pk("interiorStyle"),zones:pk("zones"),materials:pk("spaceMat"),lighting:pk("spaceLight"),cct_policy:dm.cctPolicy||null,sensory:pk("spaceSensory"),cleaning:dm.cleanPolicy||null,crowd:dm.crowdPolicy||null,wayfinding:pk("wayfinding"),signage_language:dm.signageLang||null,accessibility:pk("spaceAccess"),inputs:{area:tx.sp_area||null,rooms:tx.sp_rooms||null,session:tx.sp_session||null,buffer:tx.sp_buffer||null,hours:tx.sp_hours||null,peak:tx.sp_peak||null,wait:tx.sp_wait||null,cct:tx.sp_cct||null,door:tx.sp_door||null,corridor:tx.sp_corr||null,turning:tx.sp_turn||null},capacity:queueCalc(s),bd_comparison:bdCompare(s),spec:spaceSpec(s)},
   avoid:pk("avoidUX"),combined_negatives:negatives(s),key_moments:{k1:tx.ks1||null,k2:tx.ks2||null,k3:tx.ks3||null},notes:tx.st_note||null,statement:{text:T_(s,"statement")||draft(s),source:T_(s,"statement")?"human":"auto-draft"},
   ui_tokens_css:uiTokensCSS(s),ui_prompt:uiPrompt(s),space_prompt:spacePrompt(s),a11y_plan_md:a11yPlan(s),consistency_checks:checks(s),downstream_hints:hints(s),guide_md:buildGuide(s),system_prompt:buildSystem(s),
   agent_rules:["所有 UI、UX 與空間輸出必須符合 system_prompt、guide_md 與 ui_tokens_css。","文字對比至少 4.5:1（大字 3:1），元件邊界與焦點對相鄰顏色至少 3:1，不可只靠顏色，佔位文字不可取代標籤。","對比檢查只涵蓋顏色；不可宣稱已符合 WCAG 或已通過無障礙審核；鍵盤、螢幕閱讀器與真人測試須由人類執行。","combined_negatives 中的任何一項都不可出現；不使用暗黑模式；個人與健康資料須最少化並取得適當同意。","空間設計只作方向；建築、消防、電氣、衛生、無障礙與規管要求須由註冊專業人士確認；手冊數值以最新版為準。","不可虛構使用者研究結果或旅程數據；旅程與藍圖須由人類填寫或驗證。","consistency_checks 中 level 為 warn 或 error 的項目須先由人類確認，才可進入 4F–4H。","approval.state 為 draft 時，不得視為已核准；不得自行把狀態改為已核准。","status 為 incomplete 時，缺少的欄位不得自行補寫。","本階段不提供風格相符度分數。"]}}

// ---------- 貼回 ----------
function matchItem(k,name){const n=norm(name);if(!n)return null;const L=flat(k);return L.find(i=>i.id===name||norm(i.zh)===n)||L.find(i=>n.length>=2&&(norm(i.zh).includes(n)||(norm(i.zh).length>=2&&n.includes(norm(i.zh)))))||null}
function matchOpt(d,name){const dm=DIM(d);if(!dm)return null;const n=norm(name);return dm.opts.find(o=>o.id===name||norm(o.zh)===n)||dm.opts.find(o=>n.length>=2&&(norm(o.zh).includes(n)||(norm(o.zh).length>=2&&n.includes(norm(o.zh)))))||null}
function extractJSON(text){const f=text.match(/```(?:json)?\s*([\s\S]*?)```/i);return JSON.parse(f?f[1]:text.slice(text.indexOf("{"),text.lastIndexOf("}")+1))}
function normalizeBrief(j){if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4e"))return j;const n=a=>(a||[]).map(x=>x.name);const o={},ui=j.ui||{},ux=j.ux||{},cp=j.components||{},sp=j.space||{};
  o.uiStyle=n(ui.styles);o.uxPattern=n(ux.patterns);o.components=n(cp.selected);o.uiStates=n(cp.states);o.a11yTests=n(j.a11y_tests);o.touchpoints=n((j.journey||{}).touchpoints);o.serviceMoments=n((j.journey||{}).service_moments);o.spaceType=n(sp.types);o.interiorStyle=n(sp.style);o.zones=n(sp.zones);o.spaceMat=n(sp.materials);o.spaceLight=n(sp.lighting);o.spaceSensory=n(sp.sensory);o.wayfinding=n(sp.wayfinding);o.spaceAccess=n(sp.accessibility);o.avoidUX=n(j.avoid);
  o.dims={};const d=(k,x)=>{if(x)o.dims[k]=x.name};d("density",ui.density);d("spacingBase",ui.spacing);d("typeBase",ui.type_base);d("themeMode",ui.theme);d("iconStyle",ui.icons);d("a11yTarget",ui.a11y_target);d("navPattern",ux.navigation);d("labelPos",ux.label_position);d("errorPattern",ux.error_pattern);d("targetPolicy",cp.target_policy);d("focusPolicy",cp.focus_policy);d("cctPolicy",sp.cct_policy);d("cleanPolicy",sp.cleaning);d("crowdPolicy",sp.crowd);d("signageLang",sp.signage_language);
  o.text={};const t=(k,x)=>{if(x!=null&&x!=="")o.text[k]=String(x)};Object.entries(ui.palette||{}).forEach(([k,v])=>t(k,v));const sm=ui.semantic||{};t("c_error",sm.error);t("c_success",sm.success);t("c_warning",sm.warning);t("c_info",sm.info);const ov=ui.overrides||{};t("u_radius",ov.radius);t("u_border",ov.border);t("u_focus",ov.focus);const si=sp.inputs||{};[["sp_area","area"],["sp_rooms","rooms"],["sp_session","session"],["sp_buffer","buffer"],["sp_hours","hours"],["sp_peak","peak"],["sp_wait","wait"],["sp_cct","cct"],["sp_door","door"],["sp_corr","corridor"],["sp_turn","turning"]].forEach(([k,v])=>t(k,si[v]));const km=j.key_moments||{};t("ks1",km.k1);t("ks2",km.k2);t("ks3",km.k3);t("st_note",j.notes);t("brandName",j.brand_name);if(j.statement&&j.statement.source==="human")t("statement",j.statement.text);
  o.journey={};((j.journey||{}).stages||[]).forEach((r,i)=>{o.journey[i]={tp:r.tp||"",act:r.act||"",front:r.front||"",back:r.back||"",emo:r.emo||"",pain:r.pain||"",opp:r.opp||""}});return o}
function applyPaste(text,s){const out={applied:[],custom:[],errors:[]};let j;
  try{j=normalizeBrief(extractJSON(text))}catch(e){out.errors.push("找不到可解析的 JSON 區塊（請連同 ```json 區塊一起貼上）");return out}
  CAT_KEYS.forEach(k=>{if(!Array.isArray(j[k]))return;const ids=[],cu=[];j[k].forEach(n=>{const m=matchItem(k,n);if(m){if(!ids.includes(m.id))ids.push(m.id)}else if(String(n).trim()&&!cu.includes(String(n).trim()))cu.push(String(n).trim())});s[k]=ids;s.custom[k]=cu;out.applied.push(`${CAT[k].title.replace(/（.*/,"")}：${ids.length} 項`+(cu.length?`＋自訂 ${cu.length} 項`:""));cu.forEach(c=>out.custom.push(c))});
  const dd=Object.assign({},j.dims||{});DIMS.forEach(d=>{if(typeof j[d.id]==="string"||(j[d.id]&&j[d.id].name))dd[d.id]=typeof j[d.id]==="string"?j[d.id]:j[d.id].name});let c=0;Object.entries(dd).forEach(([d,v])=>{if(!DIM(d))return;const o=matchOpt(d,v);if(o){s.dims[d]=o.id;c++}else out.errors.push(`「${d}」的值「${v}」不在清單內，未套用`)});if(c)out.applied.push(`單選規則：${c} 項`);
  const tx=Object.assign({},j.text||{});TEXTS.forEach(t=>{if(typeof j[t.id]==="string"||typeof j[t.id]==="number")tx[t.id]=j[t.id]});let tc=0;Object.entries(tx).forEach(([k,v])=>{if(TEXT_BY[k]&&(typeof v==="string"||typeof v==="number")){s.text[k]=String(v);tc++}});if(tc)out.applied.push(`文字欄：${tc} 項`);
  const jo=j.journey;if(jo&&typeof jo==="object"){const arr=Array.isArray(jo)?jo:Object.values(jo);arr.forEach((r,i)=>{if(i<STAGES.length&&r&&typeof r==="object")s.journey[i]={tp:r.tp||r["觸點"]||"",act:r.act||r["顧客行動"]||"",front:r.front||r["前台"]||"",back:r.back||r["後台"]||"",emo:String(r.emo||r["情緒"]||""),pain:r.pain||r["痛點"]||"",opp:r.opp||r["機會"]||""}});if(arr.length)out.applied.push("旅程表："+Math.min(arr.length,STAGES.length)+" 個階段")}
  if(!out.applied.length)out.errors.push("JSON 內沒有可辨識的欄位");return out}
