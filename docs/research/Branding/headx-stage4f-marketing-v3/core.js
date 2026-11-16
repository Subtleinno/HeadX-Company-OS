
const KEY="brand_stage4f_v1";
const BK={s0:"brand_brief_stage0",s1:"brand_brief_stage1",s2:"brand_brief_stage2",s3:"brand_brief_stage3",s4a:"brand_brief_stage4a",s4b:"brand_brief_stage4b",s4c:"brand_brief_stage4c",s4d:"brand_brief_stage4d",s4e:"brand_brief_stage4e"};
const norm=t=>String(t||"").replace(/\s+/g,"").toLowerCase();
const emptyState=()=>{const s={s0:null,s1:null,s2:null,s3:null,s4a:null,s4b:null,s4c:null,s4d:null,s4e:null,dims:{},text:{},pubs:[],custom:{}};CAT_KEYS.forEach(k=>{s[k]=[];s.custom[k]=[]});return s};
function load(){let s=emptyState();try{const r=JSON.parse(localStorage.getItem(KEY)||"null");if(r){const e=emptyState();s=Object.assign(e,r);s.custom=Object.assign(e.custom,r.custom||{});s.dims=r.dims||{};s.text=r.text||{};CAT_KEYS.forEach(k=>{if(!Array.isArray(s[k]))s[k]=[];if(!Array.isArray(s.custom[k]))s.custom[k]=[]});if(!Array.isArray(s.pubs))s.pubs=[]}}catch(x){}if(!Array.isArray(s.pubs))s.pubs=[];return autoImport(s)}
function autoImport(s){Object.keys(BK).forEach(n=>{if(s[n])return;try{const raw=localStorage.getItem(BK[n]);if(raw){const p=PARSE[n](raw);if(p){s[n]=p;fillFrom(s,n,p)}}}catch(x){}});return s}
function setIf(s,k,v){if(v!=null&&String(v).trim()&&!String(s.text[k]||"").trim())s.text[k]=String(v)}
function fillFrom(s,n,p){if(n==="s4a")Object.entries(p.palette||{}).forEach(([k,v])=>{if(/^c_/.test(k)&&hex(v))setIf(s,k,v)});if(n==="s4b"){const g=p.grad||{};setIf(s,"g_a",g.a);setIf(s,"g_b",g.b);setIf(s,"g_c",g.c);setIf(s,"g_angle",g.angle)}if(n==="s1")setIf(s,"pos_line",p.statement)}
function save(s){try{localStorage.setItem(KEY,JSON.stringify(s))}catch(x){}}
const flat=k=>CAT[k].groups.flatMap(g=>g.items);
const byId=(k,id)=>flat(k).find(i=>i.id===id);
const labels=(k,s)=>[...s[k].map(id=>(byId(k,id)||{zh:id}).zh),...s.custom[k]];
const items=(k,s)=>[...s[k].map(id=>byId(k,id)||{id,zh:id,desc:"",t:[],conf:[],risk:false,pro:false,inter:false,note:"",cost:0,n1:0,n2:0}),...s.custom[k].map(t=>({id:"custom",zh:t,desc:"（自訂）",t:[],conf:[],risk:false,pro:false,inter:false,note:"",cost:0,n1:0,n2:0}))];
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
const esc=t=>String(t).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));

// ---------- 前階段匯入 ----------
function parseS0(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage0"))return null;const ch=j.choices||{},sel=j.selections||{},d=j.derived||{};return {name:(j.text||{}).trading||(j.text||{}).legalZh||"",budget:(ch.brandBudget||{}).name||"",priceTier:(ch.priceTier||{}).name||"",industry:nameList(sel.industry),delivery:nameList(sel.delivery),markets:nameList(sel.markets),languages:nameList(sel.languages),flags:d.flags||[],claims:!!d.claims_risk}}
function parseS1(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage1"))return null;return {name:j.brand_name||"",statement:(j.positioning_statement||{}).text||"",dials:((j.core_tension||{}).dials||[]).map(d=>({id:d.id,left:d.left,right:d.right,position:d.position})),anti:nameList(j.anti_persona)}}
function parseS2(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage2"))return null;return {statement:(j.sensory_statement||{}).text||"",keywords:nameList(j.mood_keywords),anti:nameList(j.anti_keywords)}}
function parseS3(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage3"))return null;const dials={};(j.tone_dials||[]).forEach(d=>dials[d.id]=d.position);return {statement:(j.voice_statement||{}).text||"",personality:nameList(j.personality),dials,script:((j.language_rules||{}).script||{}).name||""}}
function parseS4a(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4a"))return null;return {statement:(j.visual_statement||{}).text||"",avoid:nameList(j.visual_avoid),palette:(j.color||{}).palette||{}}}
function parseS4b(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4b"))return null;const g=(j.gradient||{}).spec||{},pt=j.pattern||{};return {statement:(j.surface_statement||{}).text||"",grad:{a:g.a,b:g.b,c:g.c,mid:g.mid,angle:g.angle},gradTypes:nameList((j.gradient||{}).types),colorways:(j.colorways||[]).map(c=>({id:c.id,name:c.name,bg:c.background,fg:c.foreground,ac:c.accent})),tile:pt.tile_svg||"",patternMotifs:nameList(pt.motifs),avoid:nameList(j.surface_avoid)}}
function parseS4c(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4c"))return null;const v=j.video||{};return {statement:(j.statement||{}).text||"",formats:nameList(v.formats),caption:((v.captions||{}).style||{}).name||"",hook:(v.hook||{}).name||"",avoid:nameList((j.avoid||{}).motion).concat(nameList((j.avoid||{}).audio_video))}}
function parseS4d(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4d"))return null;const p=j.product||{};return {statement:(j.statement||{}).text||"",compliance:nameList(p.compliance),appearance:nameList(p.appearance),avoid:nameList(j.avoid)}}
function parseS4e(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4e"))return null;const tk=(j.ui||{}).tokens||{};return {statement:(j.statement||{}).text||"",radius:tk.radius||{},focus:tk.focus,targetMin:tk.target_min,avoid:nameList(j.avoid)}}
const PARSE={s0:parseS0,s1:parseS1,s2:parseS2,s3:parseS3,s4a:parseS4a,s4b:parseS4b,s4c:parseS4c,s4d:parseS4d,s4e:parseS4e};
function importBrief(text,s){const j=J(text);if(!j||typeof j.schema!=="string")return null;const m=j.schema.match(/^brand\/stage(\d)([abcde]?)/);if(!m)return null;const k="s"+m[1]+m[2];if(!PARSE[k])return null;const p=PARSE[k](j);if(!p)return null;s[k]=p;fillFrom(s,k,p);try{localStorage.setItem(BK[k],JSON.stringify(j))}catch(e){}return k}
function ctxStages(s){const a=[];
  a.push(s.s0?`【Stage 0 業務】行業：${s.s0.industry.join("、")||"（無）"}｜價格定位：${s.s0.priceTier||"（無）"}｜預算：${s.s0.budget||"（無）"}｜市場：${s.s0.markets.join("、")||"（無）"}｜語言：${s.s0.languages.join("、")||"（無）"}｜規管提示：${s.s0.flags.join("、")||"（無）"}｜健康宣稱風險：${s.s0.claims?"有":"無"}`:"【Stage 0 業務】（尚未匯入）");
  a.push(s.s1?`【Stage 1 定位】品牌：${s.s1.name||"（尚未命名）"}｜宣言：${s.s1.statement||"（無）"}｜絕對不要像：${s.s1.anti.join("、")||"（無）"}`:"【Stage 1 定位】（尚未匯入）");
  a.push(s.s2?`【Stage 2 感官】${s.s2.statement||"（無）"}｜關鍵字：${s.s2.keywords.join("、")||"（無）"}｜反關鍵字：${s.s2.anti.join("、")||"（無）"}`:"【Stage 2 感官】（尚未匯入）");
  a.push(s.s3?`【Stage 3 語言】${s.s3.statement||"（無）"}｜性格：${s.s3.personality.join("、")||"（無）"}｜書寫語言：${s.s3.script||"（無）"}`:"【Stage 3 語言】（尚未匯入）");
  a.push(s.s4a?`【Stage 4A 視覺語言】${s.s4a.statement||"（無）"}｜視覺禁區：${s.s4a.avoid.join("、")||"（無）"}`:"【Stage 4A 視覺語言】（尚未匯入）");
  a.push(s.s4b?`【Stage 4B 表面系統】${s.s4b.statement||"（無）"}｜漸變：${s.s4b.gradTypes.join("、")||"（無）"}｜配色變體：${s.s4b.colorways.map(c=>c.name).join("、")||"（無）"}｜圖案：${s.s4b.patternMotifs.join("、")||"（無）"}｜表面禁區：${s.s4b.avoid.join("、")||"（無）"}`:"【Stage 4B 表面系統】（尚未匯入）");
  a.push(s.s4c?`【Stage 4C 動態影片】${s.s4c.statement||"（無）"}｜格式：${s.s4c.formats.join("、")||"（無）"}｜字幕：${s.s4c.caption||"（未定）"}｜開頭規則：${s.s4c.hook||"（未定）"}`:"【Stage 4C 動態影片】（尚未匯入）");
  a.push(s.s4d?`【Stage 4D 3D 與產品】${s.s4d.statement||"（無）"}｜認證提醒：${s.s4d.compliance.join("、")||"（無）"}`:"【Stage 4D 3D 與產品】（尚未匯入）");
  a.push(s.s4e?`【Stage 4E UI／UX 與空間】${s.s4e.statement||"（無）"}｜圓角：${JSON.stringify(s.s4e.radius)}`:"【Stage 4E UI／UX 與空間】（尚未匯入）");
  return a.join("\n")}
function ctxMkt(s){const L=k=>labels(k,s).join("、")||"（尚未選擇）",P=d=>{const o=picked(s,d);return o?o.zh:"（尚未選擇）"},X=id=>T_(s,id)||"（尚未填寫）";
  return [`目標：${L("adGoal")}｜漏斗 ${L("funnel")}｜受眾 ${L("targeting")}｜定位 ${X("pos_line")}｜受眾描述 ${X("aud")}`,`渠道：${L("channels")}｜廣告格式 ${L("adFormats")}｜模板 ${L("templateTypes")}`,
  `視覺：背景 ${P("tplBg")}｜對齊 ${P("tplAlign")}｜CTA ${P("ctaStyle")}｜邊距 ${P("safeMargin")}｜標題 ${P("headlineScale")}｜圖案 ${P("patOverlay")}｜標誌 ${P("logoPos")}｜色值 主 ${X("c_primary")}／輔 ${X("c_secondary")}／點綴 ${X("c_accent")}／文字 ${X("c_ink")}／背景 ${X("c_paper")}`,
  `文案：Hook ${L("hooks")}｜CTA ${L("ctas")}｜框架 ${L("copyFramework")}｜支柱 ${L("pillars")}｜主 Hook「${X("hook")}」｜副標「${X("sub")}」｜CTA「${X("cta_text")}」`,
  `披露與宣稱：披露 ${L("disclosures")}｜宣稱 ${L("claimTypes")}｜審稿 ${P("reviewFlow")}｜Alt ${P("altText")}｜表情 ${P("emojiPolicy")}｜語言 ${P("adLang")}`,`簡報：${L("slides")}｜指標 ${L("kpis")}｜預算 ${X("b_budget")} HKD`,`禁區：${L("adAvoid")}`].join("\n")}

// ---------- 色彩與漸變 ----------
function hex(v){const m=String(v||"").trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);if(!m)return null;let h=m[1];if(h.length===3)h=h.split("").map(c=>c+c).join("");return "#"+h.toUpperCase()}
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const lin=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
const lum=h=>{const [r,g,b]=rgb(h).map(v=>lin(v/255));return .2126*r+.7152*g+.0722*b};
const fr=x=>(Math.floor(x*100)/100).toFixed(2);
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
function mixHex(a,b,u){const A=rgb(a),B=rgb(b);return "#"+A.map((v,k)=>Math.round(v+(B[k]-v)*u).toString(16).padStart(2,"0")).join("").toUpperCase()}
function palette(s){const o={};COLS.forEach(([id])=>{const h=hex(s.text[id]);if(h)o[id]=h});return o}
function gradStops(s){const a=hex(s.text.g_a),b=hex(s.text.g_b),c=hex(s.text.g_c);if(!a||!c)return null;const st=[{hex:a,pos:0}];if(b)st.push({hex:b,pos:50});st.push({hex:c,pos:100});return st}
function sampleGrad(st,t){t=t*100;let i=0;while(i<st.length-2&&t>st[i+1].pos)i++;const a=st[i],b=st[i+1];return mixHex(a.hex,b.hex,cl((t-a.pos)/Math.max(1,b.pos-a.pos)))}
function minRatioGrad(st,tx){let mn={r:99,at:0,c:""};for(let i=0;i<=20;i++){const c=sampleGrad(st,i/20),r=ratio(c,tx);if(r<mn.r)mn={r,at:i*5,c}}return mn}
function bestOn(cands,bgs){return cands.map(c=>[c,Math.min(...bgs.map(b=>ratio(c,b)))]).sort((a,b)=>b[1]-a[1])[0]}
function cwList(s){const out=[],p=palette(s);if(p.c_paper&&p.c_ink)out.push({name:"預設（品牌色）",bg:p.c_paper,fg:p.c_ink,ac:p.c_primary||p.c_ink});(s.s4b?s.s4b.colorways:[]).forEach(c=>{const bg=hex(c.bg),fg=hex(c.fg),ac=hex(c.ac);if(bg&&fg)out.push({name:c.name,bg,fg,ac:ac||fg})});return out}
function cwPick(s){const l=cwList(s),n=s.text.tpl_cw;return l.find(x=>x.name===n)||l[0]||null}

// ---------- 模板引擎 ----------
function cw_(c){return Math.abs(c.charCodeAt(0))>255?1:/[A-Z0-9]/.test(c)?.62:/[ ]/.test(c)?.3:.55}
function tw(str,fs){let w=0;for(const c of str)w+=cw_(c);return w*fs}
function wrap(str,maxW,fs){const lines=[];String(str||"").split(/\n/).forEach(par=>{let cur="";for(const c of par){if(tw(cur+c,fs)>maxW&&cur){lines.push(cur);cur=c}else cur+=c}lines.push(cur)});return lines.filter((l,i)=>l.length||i===0)}
function tileInfo(s){const t=s.s4b&&s.s4b.tile;if(t&&/<svg/.test(t)){const w=parseFloat((t.match(/width="([\d.]+)"/)||[])[1])||48,h=parseFloat((t.match(/height="([\d.]+)"/)||[])[1])||48;return {svg:t,w,h,real:true}}const p=palette(s),c=p.c_primary||"#888888";return {svg:`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="4" fill="${c}"/></svg>`,w:48,h:48,real:false}}
function ctaColors(s,cw){const p=palette(s);const bg=cw.ac&&ratio(cw.ac,cw.bg)>=3?cw.ac:(p.c_primary||cw.fg);const fg=bestOn([cw.bg,cw.fg,"#FFFFFF","#111111"],[bg])[0];return {bg,fg,ratio:ratio(fg,bg)}}
function tplSVG(s,sz,o){o=o||{};const cw=cwPick(s);if(!cw)return null;const W=sz.w,H=sz.h,kind=(picked(s,"tplBg")||{id:"tb_solid"}).id,align=(picked(s,"tplAlign")||{id:"ta_left"}).id,ctaS=(picked(s,"ctaStyle")||{id:"cs_fill"}).id;
  const mp=picked(s,"safeMargin"),mg=mp?parseFloat(mp.tok["--margin"]):.08,h1d=picked(s,"headlineScale")?parseFloat(picked(s,"headlineScale").tok["--h1"]):72,po=picked(s,"patOverlay")?parseFloat(picked(s,"patOverlay").tok["--pat"]):0,lg=(picked(s,"logoPos")||{id:"lg_tl"}).id;
  const banner=H<=100,isPpt=sz.id==="ppt";const sc=banner?1:Math.min(W/1080,H/1080*(H>W?1.25:1));const safe=sz.safe||{top:0,bottom:0,side:0};const m=Math.max(W*mg,6);const x0=m+W*(safe.side||0),x1=W-x0,y0=m+H*(safe.top||0),y1=H-m-H*(safe.bottom||0);
  const font=(T_(s,"f_head")||"Noto Sans TC")+",'PingFang HK','Noto Sans TC',sans-serif";const tk=s.s4e&&s.s4e.radius&&s.s4e.radius.md!=null?s.s4e.radius.md:8;
  let defs="",bgEl="",txt=cw.fg,effBgs=[cw.bg],note="";const st=gradStops(s);
  if(kind==="tb_grad"&&st){const a=(parseFloat(T_(s,"g_angle"))||135)*Math.PI/180,sx=Math.sin(a),cx=Math.cos(a);defs+=`<linearGradient id="g" x1="${.5-.5*sx}" y1="${.5+.5*cx}" x2="${.5+.5*sx}" y2="${.5-.5*cx}">${st.map(x=>`<stop offset="${x.pos}%" stop-color="${x.hex}"/>`).join("")}</linearGradient>`;bgEl=`<rect width="${W}" height="${H}" fill="url(#g)"/>`;const smp=[];for(let i=0;i<=10;i++)smp.push(sampleGrad(st,i/10));const b=bestOn([cw.fg,cw.bg,"#FFFFFF","#111111"],smp);txt=b[0];effBgs=smp}
  else if(kind==="tb_pattern"){const ti=tileInfo(s),uri="data:image/svg+xml,"+encodeURIComponent(ti.svg);defs+=`<pattern id="pt" width="${ti.w*(W/1080)*1.2}" height="${ti.h*(W/1080)*1.2}" patternUnits="userSpaceOnUse"><image href="${uri}" width="${ti.w*(W/1080)*1.2}" height="${ti.h*(W/1080)*1.2}"/></pattern>`;bgEl=`<rect width="${W}" height="${H}" fill="${cw.bg}"/><rect width="${W}" height="${H}" fill="url(#pt)" opacity="${Math.max(po,.05)}"/>`;const pc=hex((ti.svg.match(/fill="(#[0-9a-fA-F]{6})"/)||[])[1])||cw.ac;effBgs=[cw.bg,mixHex(cw.bg,pc,Math.max(po,.05))];note=ti.real?"":"4B 沒有提供圖案單元，使用示意圓點"}
  else if(kind==="tb_photo"){defs+=`<linearGradient id="ph" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#555"/><stop offset="1" stop-color="#222"/></linearGradient><linearGradient id="sc" x1="0" y1="0" x2="0" y2="1"><stop offset=".3" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".65"/></linearGradient>`;bgEl=`<rect width="${W}" height="${H}" fill="url(#ph)"/><rect width="${W}" height="${H}" fill="url(#sc)"/><text x="${W/2}" y="${H*.3}" font-size="${28*sc}" fill="#aaa" text-anchor="middle" font-family="${font}">［照片位置］</text>`;txt="#FFFFFF";effBgs=["#000000"];note="照片對比須用實際照片測試"}
  else{bgEl=`<rect width="${W}" height="${H}" fill="${cw.bg}"/>`}
  const cta=ctaColors(s,{...cw,fg:txt===cw.fg?cw.fg:txt});const ctaBg=kind==="tb_photo"?"#FFFFFF":cta.bg,ctaFg=kind==="tb_photo"?"#111111":cta.fg;
  const anchor=align==="ta_center"?"middle":"start",ax=align==="ta_center"?W/2:x0;let h1=h1d*sc*(isPpt?1.15:1),bodyS=Math.max(h1*.5,12),discS=Math.max(h1*.3,8);const title=o.title!=null?o.title:T_(s,"hook"),body=o.body!=null?o.body:T_(s,"sub"),ctaT=o.cta!=null?o.cta:T_(s,"cta_text"),disc=o.disc!=null?o.disc:T_(s,"disc_text");const maxW=x1-x0;
  let svg="",metrics={},overflow=false,shrink=1;
  const brandT=brandName(s),logoS=Math.max(26*sc,8);
  if(banner){const fs=Math.max(H*.34,7),btnW=tw(ctaT||"了解更多",fs*.8)+fs,btnH=H*.62;svg=`${bgEl}<text x="${m}" y="${H/2+fs*.35}" font-size="${fs}" font-weight="700" fill="${txt}" font-family="${font}">${esc(wrap(title||brandT,W-btnW-3*m,fs)[0])}</text>${ctaT?`<rect x="${W-btnW-m}" y="${(H-btnH)/2}" width="${btnW}" height="${btnH}" rx="${Math.min(tk*sc+2,btnH/2)}" fill="${ctaBg}"/><text x="${W-btnW/2-m}" y="${H/2+fs*.8*.35}" font-size="${fs*.8}" font-weight="700" fill="${ctaFg}" text-anchor="middle" font-family="${font}">${esc(ctaT)}</text>`:""}`;metrics={h1px:fs,body:0}}
  else{
    let layout=()=>{const lh=1.3;const tl=wrap(title,maxW,h1),bl=body?wrap(body,maxW,bodyS):[],dl=disc?wrap(disc,maxW,discS):[];const logoH=logoS*2;const ctaH=ctaT?Math.max(bodyS*2.1,18):0;const hh=tl.length*h1*lh,bh=bl.length*bodyS*1.5,dh=dl.length*discS*1.4;const need=logoH+hh+(bl.length?bodyS*.8+bh:0)+(ctaT?ctaH+bodyS*1.2:0)+(dl.length?discS*.8+dh:0)+h1*.5;return {tl,bl,dl,logoH,ctaH,hh,bh,dh,need,avail:y1-y0}};
    let L=layout();while(L.need>L.avail&&shrink>.6){shrink-=.06;h1=h1d*sc*(isPpt?1.15:1)*shrink;bodyS=Math.max(h1*.5,12);discS=Math.max(h1*.3,8);L=layout()}overflow=L.need>L.avail;
    let y=y0;const lx=lg==="lg_tr"?x1:lg==="lg_bc"?W/2:x0,la=lg==="lg_tr"?"end":lg==="lg_bc"?"middle":"start";const ly=lg==="lg_bc"?y1-L.dh-(L.dl.length?discS:0):y0+logoS;
    svg=bgEl+`<text x="${lx}" y="${ly}" font-size="${logoS}" font-weight="700" fill="${txt}" text-anchor="${la}" font-family="${font}" letter-spacing="1">${esc(brandT)}</text>`;
    if(o.pageLabel)svg+=`<text x="${x1}" y="${y0+logoS}" font-size="${logoS*.8}" fill="${txt}" opacity=".7" text-anchor="end" font-family="${font}">${esc(o.pageLabel)}</text>`;
    const top=y0+L.logoH+(L.avail-L.need)*.25;y=top+h1;
    svg+=L.tl.map((l,i)=>`<text x="${ax}" y="${y+i*h1*1.3}" font-size="${h1}" font-weight="800" fill="${txt}" text-anchor="${anchor}" font-family="${font}">${esc(l)}</text>`).join("");y+=(L.tl.length-1)*h1*1.3+bodyS*1.4;
    if(L.bl.length){svg+=L.bl.map((l,i)=>`<text x="${ax}" y="${y+i*bodyS*1.5}" font-size="${bodyS}" fill="${txt}" opacity=".92" text-anchor="${anchor}" font-family="${(T_(s,"f_body")||"Noto Sans TC")+",'PingFang HK',sans-serif"}">${esc(l)}</text>`).join("");y+=L.bl.length*bodyS*1.5}
    if(ctaT){const bw=tw(ctaT,bodyS)+bodyS*2.2,bx=align==="ta_center"?(W-bw)/2:x0,by=Math.min(y+bodyS*.6,y1-L.dh-(L.dl.length?discS*.8:0)-L.ctaH);const r=Math.min(tk*sc*1.2,L.ctaH/2);
      if(ctaS==="cs_fill")svg+=`<rect x="${bx}" y="${by}" width="${bw}" height="${L.ctaH}" rx="${r}" fill="${ctaBg}"/><text x="${bx+bw/2}" y="${by+L.ctaH/2+bodyS*.35}" font-size="${bodyS}" font-weight="700" fill="${ctaFg}" text-anchor="middle" font-family="${font}">${esc(ctaT)}</text>`;
      else if(ctaS==="cs_outline")svg+=`<rect x="${bx}" y="${by}" width="${bw}" height="${L.ctaH}" rx="${r}" fill="none" stroke="${txt}" stroke-width="${Math.max(2*sc,1.5)}"/><text x="${bx+bw/2}" y="${by+L.ctaH/2+bodyS*.35}" font-size="${bodyS}" font-weight="700" fill="${txt}" text-anchor="middle" font-family="${font}">${esc(ctaT)}</text>`;
      else svg+=`<text x="${bx}" y="${by+L.ctaH/2+bodyS*.35}" font-size="${bodyS}" font-weight="700" fill="${txt}" font-family="${font}" text-decoration="underline">${esc(ctaT)} →</text>`}
    if(L.dl.length){const dy=y1-L.dh+discS;svg+=L.dl.map((l,i)=>`<text x="${ax}" y="${dy+i*discS*1.4}" font-size="${discS}" fill="${txt}" opacity=".85" text-anchor="${anchor}" font-family="${font}">${esc(l)}</text>`).join("")}
    metrics={h1px:h1,body:bodyS,disc:discS,shrink,overflow}}
  if(o.showSafe&&sz.safe)svg+=`<rect x="${W*(sz.safe.side)}" y="${H*sz.safe.top}" width="${W*(1-2*sz.safe.side)}" height="${H*(1-sz.safe.top-sz.safe.bottom)}" fill="none" stroke="#FF2D55" stroke-width="${3*sc}" stroke-dasharray="${12*sc} ${8*sc}"/>`;
  const head=bestOn([txt],effBgs)[1];const phone=W>360&&!isPpt?360/W:1;
  return {svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs}</defs>${svg}</svg>`,metrics:Object.assign(metrics,{W,H,id:sz.id,txt,contrast:head,ctaRatio:ctaT?(kind==="tb_photo"?ratio("#111111","#FFFFFF"):cta.ratio):null,phoneH1:(metrics.h1px||0)*phone,phoneDisc:(metrics.disc||0)*phone,phoneBody:(metrics.body||0)*phone,isPpt,overflow,note,kind})}}
function sizeBy(id){return SIZES.find(x=>x.id===id)}
function carouselSlides(s){const lines=String(s.text.car_slides||"").split(/\n+/).map(x=>x.trim()).filter(Boolean);return lines.map((l,i)=>{const [t,b]=l.split(/[｜|]/).map(x=>(x||"").trim());return {i,title:t||"",body:b||"",role:i===0?"cover":i===lines.length-1?"cta":"content"}})}
function carouselSVGs(s,sizeId){const sl=carouselSlides(s),sz=sizeBy(sizeId||"ig45");return sl.map(x=>{const r=tplSVG(s,sz,{title:x.title,body:x.body,cta:x.role==="cta"?T_(s,"cta_text")||x.title:"",disc:x.role==="cta"?T_(s,"disc_text"):"",pageLabel:`${x.i+1}/${sl.length}`});return r?{...x,...r}:null}).filter(Boolean)}
function pptSVGs(s){const lines=String(s.text.ppt_lines||"").split(/\n+/).map(x=>x.trim()).filter(Boolean).map(l=>{const [t,b]=l.split(/[｜|]/).map(x=>(x||"").trim());return {title:t||"",body:b||""}});const sz=sizeBy("ppt");if(!lines.length)return [];const pick=[["封面",lines[0]],["內容",lines[1]||lines[0]],["圖表",lines[2]||lines[0]],["結語",lines[lines.length-1]]];return pick.map(([n,l],i)=>{const r=tplSVG(s,sz,{title:l.title,body:l.body,cta:i===3?T_(s,"cta_text"):"",disc:i===3?T_(s,"disc_text"):"",pageLabel:`${n}`});return r?{name:n,...r}:null}).filter(Boolean)}
function bannerSVGs(s){return ["mrec","lb","mob","sky"].map(id=>{const sz=sizeBy(id),r=tplSVG(s,sz,{});return r?{id,name:sz.name,...r}:null}).filter(Boolean)}
function channelSizes(s){const m={ch_ig:["ig45"],ch_igr:["story"],ch_tt:["story"],ch_fb:["link"],ch_li:["link"],ch_web:["link"],ch_th:["ig45"],ch_xhs:["xhs34"],ch_x:["x169"],ch_edm:["edmh"],ch_yt:["yt169"],ch_ppt:["ppt"],ch_meta:["ig45","story","sq"]};const ids=new Set();s.channels.forEach(c=>(m[c]||[]).forEach(x=>ids.add(x)));if(!ids.size)["ig45","story","sq","link"].forEach(x=>ids.add(x));return [...ids]}
function templatePack(s){const out=[];channelSizes(s).forEach(id=>{const sz=sizeBy(id),r=tplSVG(s,sz,{showSafe:false});if(r)out.push({name:`${sz.name}（主模板）`,file:`tpl-${id}.svg`,svg:r.svg,metrics:r.metrics})});carouselSVGs(s).forEach(c=>out.push({name:`Carousel 第 ${c.i+1} 頁（${c.role}）`,file:`carousel-${c.i+1}.svg`,svg:c.svg,metrics:c.metrics}));if(has(s,"ch_gads")||has(s,"af_display")||has(s,"tp_banner"))bannerSVGs(s).forEach(b=>out.push({name:b.name,file:`banner-${b.id}.svg`,svg:b.svg,metrics:b.metrics}));if(has(s,"ch_ppt")||s.slides.length)pptSVGs(s).forEach((p,i)=>out.push({name:`簡報 ${p.name}`,file:`ppt-${i+1}.svg`,svg:p.svg,metrics:p.metrics}));return out}

// ---------- 宣稱關鍵字掃描（提示，不是判斷） ----------
const SCAN=[
 {cat:"health",claim:"cl_health",re:/治療|治癒|根治|療效|治病|抗癌|防癌|癌症|糖尿|高血壓|降血壓|降血糖|血糖|血脂|膽固醇|消炎|殺菌|抗病毒|增強免疫|提升免疫|減肥|瘦身|壯陽|豐胸|生髮|助眠治|失眠治/g,note:"健康或療效宣稱關鍵字：香港《不良醫藥廣告條例》（第 231 章）限制或禁止可能誘使人使用藥物、外科器械或治療以預防或治療指定疾病的廣告，並限制口服產品的特定功效宣稱；須人類合規審核"},
 {cat:"absolute",claim:null,re:/100%|保證|絕對|永久|終身|零風險|無副作用|唯一|全港第一|第一名|最好|最強|最平|最低價|史上最/g,note:"絕對或最高級宣稱須有可證明的依據（《商品說明條例》第 362 章涉及虛假商品說明與誤導性遺漏）"},
 {cat:"urgency",claim:"cl_scarce",re:/限時|倒數|最後機會|僅剩|只剩|限量|今日止|即將售罄|搶購|名額有限/g,note:"限時、限量與倒數須真實；虛假或高壓手法可能涉及誤導、具威嚇性的營商手法或餌誘式廣告"},
 {cat:"price",claim:"cl_price",re:/免費|HK\$|\$\d|折|優惠|半價|特價|買一送一|送你|贈/g,note:"價格與優惠須列明條款（資格、期限、數量、總價與附加費用）；廣告價格須能真實供應（餌誘式廣告）"},
 {cat:"testimonial",claim:"cl_testi",re:/見證|用家|客人說|真實分享|前後|before|after|變美|變瘦|效果顯著|立竿見影/gi,note:"見證與前後對比：須真實、已獲同意、不暗示保證效果；不可偽造"},
 {cat:"compare",claim:"cl_compare",re:/優於|勝過|取代|比.{1,6}好|勝出/g,note:"比較宣稱須公平並有依據"},
 {cat:"award",claim:"cl_award",re:/獲獎|獎項|認證|冠軍|醫生推薦|專家推薦|專家認證|權威/g,note:"獎項、認證與推薦須可查證且在有效期內"}];
function scanText(t){const out=[];if(!t)return out;SCAN.forEach(r=>{const m=String(t).match(r.re);if(m)out.push({cat:r.cat,claim:r.claim,words:[...new Set(m)].slice(0,6),note:r.note})});return out}
function scanAll(s){const fields=[["hook","Hook"],["sub","副標題"],["cta_text","CTA"],["disc_text","條款與披露"],["car_slides","Carousel"],["ppt_lines","簡報"]];const res=[];fields.forEach(([id,l])=>scanText(T_(s,id)).forEach(h=>res.push({field:l,...h})));return res}

// ---------- 計算 ----------
function kpiCalc(s){const b=num(s,"b_budget",NaN),cpm=num(s,"b_cpm",NaN),ctr=num(s,"b_ctr",NaN),cvr=num(s,"b_cvr",NaN),val=num(s,"b_value",NaN),mar=num(s,"b_margin",NaN);if(![b,cpm,ctr,cvr].every(isFinite)||cpm<=0)return null;const imp=b/cpm*1000,clicks=imp*ctr/100,conv=clicks*cvr/100;const o={b,cpm,ctr,cvr,imp,clicks,conv,cpc:clicks>0?b/clicks:null,cpa:conv>0?b/conv:null};if(isFinite(val)){o.val=val;o.roas=conv*val/b}if(isFinite(mar)){o.mar=mar;o.profit=conv*mar-b;o.breakCPA=mar}return o}
const slug=t=>String(t||"").trim().toLowerCase().replace(/[^a-z0-9_\-]+/g,"_").replace(/^_+|_+$/g,"");
function utmRows(s){const base=T_(s,"u_base"),camp=T_(s,"u_campaign");if(!base)return [];const content=s.templateTypes[0]?s.templateTypes[0].replace(/^tp_/,""):"post";const rows=[];s.channels.forEach(c=>{const m=UTM_MAP[c];if(!m)return;let u;try{u=new URL(base)}catch(e){return}u.searchParams.set("utm_source",m[0]);u.searchParams.set("utm_medium",m[1]);u.searchParams.set("utm_campaign",slug(camp)||"campaign");u.searchParams.set("utm_content",content);rows.push({channel:anyName(c),source:m[0],medium:m[1],campaign:slug(camp)||"campaign",content,url:u.toString()})});return rows}
function calendarRows(s){const ppw=Math.max(1,Math.min(14,Math.round(num(s,"ppw",3)))),pl=s.pillars.length?s.pillars:[],tt=s.templateTypes.length?s.templateTypes:[],ch=s.channels.filter(c=>UTM_MAP[c]&&!["ch_edm","ch_kol","ch_print"].includes(c));const days=["週一","週三","週五","週二","週四","週六","週日"];const rows=[];let n=0;for(let w=1;w<=4;w++)for(let i=0;i<ppw;i++){rows.push({week:w,day:days[i%7],channel:ch.length?anyName(ch[n%ch.length]):"（未選渠道）",pillar:pl.length?anyName(pl[n%pl.length]):"（未選支柱）",template:tt.length?anyName(tt[n%tt.length]):"（未選模板）"});n++}return rows}

// ---------- 檢查 ----------
function selTags(s){const out={};CAT_KEYS.filter(k=>!["adAvoid","claimTypes","disclosures","kpis","funnel"].includes(k)).forEach(k=>items(k,s).forEach(i=>(i.t||[]).forEach(t=>{(out[t]=out[t]||[]).push(i.zh)})));DIMS.forEach(d=>{const o=picked(s,d.id);if(o)(o.t||[]).forEach(t=>{(out[t]=out[t]||[]).push(o.zh)})});return out}
const ANTI_TAG={"冰冷醫院感":["clinical","cold"],"廉價促銷感":["loud","anxiety"],"過度科技炫技":["neon","loud","digital"],"炫富浮誇":["flashy","loud"],"陰暗沉重":["dark"],"過度幼稚":["childish"],"製造焦慮／恐嚇":["anxiety"],"限時倒數壓迫":["anxiety","loud"],"網紅爆款保健品":["loud"],"推銷式連鎖美容院":["loud","flashy"],"廉價模板感":["cheap"]};
const KW_AVOID=[[/克制|安靜|沉穩|沉靜|平靜|從容|舒緩/,["loud","bold","anxiety"],"偏張揚或壓迫"],[/溫暖|溫潤|親切|柔和/,["cold","clinical"],"偏冰冷"],[/優雅/,["loud","childish","flashy"],"偏浮誇或幼稚"]];
function checks(s){
  const out=[],A=(l,m)=>out.push({level:l,msg:m});const tags=selTags(s),T=t=>tags[t]||[],J2=a=>[...new Set(a)].join("、");const p=palette(s);
  CAT_KEYS.forEach(k=>{if(CAT[k].max<90&&count(k,s)>CAT[k].max)A("warn",`「${CAT[k].title.replace(/（.*/,"")}」選了 ${count(k,s)} 個，超過建議的 ${CAT[k].max} 個。`)});
  if(count("adAvoid",s)>0&&count("adAvoid",s)<5)A("info","行銷與廣告禁區建議至少 5 個。");
  COLS.forEach(([id,l])=>{if(T_(s,id)&&!p[id])A("warn",`「${l}」不是有效的 HEX 色值。`)});
  const hr=s.s0&&(s.s0.claims||s.s0.flags.some(f=>/health|medical|device/.test(f)));
  // 目標、漏斗、CTA
  if(has(s,"ag_aware")&&has(s,"ct_buy")&&!has(s,"ag_convert"))A("warn","目標是品牌認知，但 CTA 選了『立即購買』；認知階段的 CTA 應是低門檻（了解更多、觀看）。");
  if(has(s,"ag_convert")&&!has(s,"fn_convert"))A("info","目標包含轉化，但漏斗階段沒有『轉化』。");
  if(s.adGoal.length>2)A("info","一個活動追多於兩個目標會讓素材與指標失焦。");
  if(s.ctas.length>1)A("info","一則內容只放一個主要 CTA；選了多個 CTA 時請說明各用在哪個內容類型。");
  if((has(s,"ag_lead")||has(s,"ct_dl")||has(s,"ct_sub")||has(s,"af_lead"))&&!has(s,"ds_data"))A("warn","收集名單、下載或訂閱，但沒有『個人資料收集聲明』；須說明用途並取得適當同意（香港適用《個人資料（私隱）條例》；不是法律意見）。");
  // 渠道
  if(has(s,"ch_edm")){A("info","EDM 與商業電子訊息可能涉及《非應邀電子訊息條例》（第 593 章）：寄件人資料、同意與退訂；請向專業人士確認。");if(!has(s,"ds_data"))A("warn","選了 EDM，但沒有個人資料收集聲明。")}
  if(has(s,"ch_wa")&&!has(s,"ds_data"))A("warn","WhatsApp 廣播須有同意與退訂方式，並說明個人資料用途。");
  if((has(s,"ch_kol")||has(s,"af_native"))&&!has(s,"ds_coop"))A("warn","有 KOL 或原生合作，但沒有『商業合作披露』。不披露商業意圖，可能構成《商品說明條例》（第 362 章）的誤導性遺漏。");
  if(has(s,"ch_xhs")&&!has(s,"ds_coop"))A("info","小紅書的商業合作須按平台規則標示；請核對最新政策。");
  if((has(s,"ch_meta")||has(s,"ch_gads"))&&hr)A("warn","在 Meta 或 Google 投放健康或醫療相關廣告：平台政策與《不良醫藥廣告條例》都可能限制；請查最新政策並由人類合規審核。");
  if(s.channels.length>6)A("warn","渠道超過 6 個，內容與維護成本會快速增加。");
  if(s.channels.length&&!s.templateTypes.length)A("info","已選渠道，但還沒選模板類型。");
  // 模板與宣稱
  const risky=["tp_ba","tp_testi","tp_promo"].filter(i=>has(s,i)),rf=picked(s,"reviewFlow");
  if(risky.length){if(!rf||rf.id!=="rf_comp")A("warn",`選了高風險模板（${risky.map(anyName).join("、")}），但審稿流程不是『第二人審稿＋人類合規審核』。`)}
  if(has(s,"tp_ba")&&!has(s,"cl_ba"))A("warn","選了前後對比模板，但宣稱類型沒有勾選『前後對比』。");
  if(has(s,"tp_testi")&&!has(s,"cl_testi"))A("warn","選了客人見證模板，但宣稱類型沒有勾選『客人見證』。");
  if(has(s,"tp_promo")&&!has(s,"cl_price"))A("warn","選了優惠推廣模板，但宣稱類型沒有勾選『價格與優惠』。");
  if((has(s,"tp_promo")||has(s,"cl_price"))&&!(has(s,"ds_terms")||has(s,"ds_price")))A("warn","涉及價格與優惠，但沒有『優惠條款』或『價格含費用說明』。價格廣告須真實可供應，費用與條件須清楚（餌誘式廣告與誤導性遺漏風險）。");
  if(has(s,"cl_scarce")&&!has(s,"ds_terms"))A("warn","有限時或限量宣稱，但沒有條款披露（期限、數量）。");
  if(has(s,"cl_health")){A("warn","勾選了健康或療效宣稱：須人類合規審核，並避免任何治療或預防疾病的承諾；香港《不良醫藥廣告條例》（第 231 章）對廣告有限制或禁止。");if(!rf||rf.id!=="rf_comp")A("warn","有健康宣稱，但審稿流程不是人類合規審核。")}
  if(has(s,"cl_face")&&!/同意|授權|肖像/.test(T_(s,"st_note")))A("info","涉及肖像或兒童，但備註沒有記錄同意與授權。");
  if(has(s,"cl_music")&&!/授權|licen/i.test(T_(s,"st_note")))A("info","涉及音樂與素材，但備註沒有記錄授權來源。");
  // Hook
  if(has(s,"hk_time")){if(!has(s,"cl_scarce"))A("warn","選了時效 Hook，但宣稱類型沒有勾選『限時、限量與倒數』。");A("info","時效 Hook 須真實：虛假倒數或限量會損害信任並可能違規。")}
  if(has(s,"hk_proof")&&!(has(s,"cl_award")||has(s,"cl_testi")))A("info","選了社會證明 Hook，請在宣稱類型勾選獎項或見證，並保存證據。");
  if(has(s,"hk_compare")&&!has(s,"cl_compare"))A("warn","選了對比 Hook，但宣稱類型沒有勾選『比較廣告』。");
  if(has(s,"hk_num"))A("info","數字 Hook 的數據須有來源與日期，並在內容中標示。");
  if(has(s,"hk_pain")||has(s,"cf_pas")){if(s.s1&&s.s1.anti.some(x=>/焦慮|恐嚇|壓迫/.test(x)))A("warn","Stage 1 要避免製造焦慮或壓迫，但 Hook 或文案框架選了痛點或 PAS（放大問題）。")}
  if(has(s,"hk_time")&&s.s1&&s.s1.anti.some(x=>/限時|倒數|壓迫/.test(x)))A("warn","Stage 1 要避免限時倒數壓迫，但 Hook 選了時效。");
  // 文案掃描
  const hits=scanAll(s);hits.forEach(h=>{A(h.cat==="health"?"warn":"info",`${h.field}出現「${h.words.join("、")}」：${h.note}。關鍵字提示，不是法律判斷。`);if(h.claim&&!has(s,h.claim))A("warn",`${h.field}出現${h.cat==="health"?"健康宣稱":h.cat==="urgency"?"限時限量":h.cat==="price"?"價格優惠":h.cat==="testimonial"?"見證或前後":h.cat==="compare"?"比較":"獎項認證"}相關字詞，但宣稱類型沒有勾選對應項目。`)});
  if(hits.some(h=>h.cat==="absolute"))A("warn","文案有絕對或最高級字詞（如保證、第一、100%）：須有證據，否則可能構成不實或誤導。");
  if(hr&&hits.some(h=>h.cat==="health"))A("error","業務涉及健康或醫療，且文案出現健康宣稱關鍵字：發布前必須人類合規審核。");
  const hk=T_(s,"hook");if(hk&&[...hk].length>26)A("info",`主 Hook 有 ${[...hk].length} 個字，社群上建議更短（約 20 字內），否則手機上會換成很多行。`);
  const ct=T_(s,"cta_text");if(ct&&[...ct].length>10)A("info","CTA 文字偏長；按鈕上建議 2–8 個中文字。");
  if(T_(s,"disc_text")==="" &&(has(s,"cl_price")||has(s,"cl_scarce")||has(s,"cl_health")))A("warn","有需要披露的宣稱，但『條款與披露』欄位是空的。");
  // 模板視覺
  const cw=cwPick(s),pb=picked(s,"tplBg");
  if(s.templateTypes.length&&!cw)A("info","還沒填主色、文字色與背景色，無法預覽模板與檢查對比。");
  if(pb&&pb.id==="tb_grad"&&!gradStops(s))A("warn","背景選了漸變，但沒有漸變色標（匯入 4B 會自動帶入）。");
  if(pb&&pb.id==="tb_pattern"&&!(s.s4b&&s.s4b.tile))A("info","背景選了圖案，但 4B 沒有提供圖案單元（需匯入含圖案的 4B brief），預覽使用示意圓點。");
  if(pb&&pb.id==="tb_photo")A("info","照片背景：須確認照片授權（含模特兒肖像）；對比須用實際照片與遮罩測試；AI 生成人物須披露。");
  if(cw&&s.s4b&&!s.s4b.colorways.length)A("info","4B 沒有配色變體，只有預設色可選。");
  if(cw){const sizes=[...new Set([...channelSizes(s),"story"])];sizes.forEach(id=>{const sz=sizeBy(id);if(!sz||sz.id==="ppt")return;const r=tplSVG(s,sz,{});if(!r)return;const m=r.metrics;if(m.contrast<4.5)A(m.contrast<3?"error":"warn",`模板「${sz.name}」：標題色對背景最差約 ${fr(m.contrast)}:1，一般文字需 4.5:1（大字 3:1）。${m.kind==="tb_grad"?"漸變須縮小幅度或加遮罩。":""}`);if(m.ctaRatio!=null&&m.ctaRatio<4.5)A("warn",`模板「${sz.name}」：CTA 文字對按鈕底約 ${fr(m.ctaRatio)}:1，需 4.5:1。`);if(m.phoneH1<14&&m.phoneH1>0&&sz.h>100)A("warn",`模板「${sz.name}」：標題在手機（約 360px 寬）上約 ${m.phoneH1.toFixed(0)}px，偏小。`);if(m.phoneDisc&&m.phoneDisc<9&&T_(s,"disc_text"))A("warn",`模板「${sz.name}」：條款小字在手機上約 ${m.phoneDisc.toFixed(1)}px，幾乎無法閱讀；披露須顯眼可讀。`);if(m.overflow)A("warn",`模板「${sz.name}」：文字太多，縮小到 ${(m.shrink*100).toFixed(0)}% 仍放不下；請精簡文案。`)});
    if(has(s,"ch_gads")||has(s,"af_display")||has(s,"tp_banner")){bannerSVGs(s).forEach(b=>{if(b.metrics.h1px<9)A("warn",`展示廣告 ${b.name}：標題字級只有約 ${b.metrics.h1px.toFixed(0)}px，太小；考慮只用品牌與 CTA 的極簡版。`)})}
    const cr=ctaColors(s,cw);if(cr.ratio<4.5)A("warn",`CTA 按鈕色：文字對按鈕底只有約 ${fr(cr.ratio)}:1，請調整。`)}
  if(has(s,"tp_story")||has(s,"ch_igr")||has(s,"ch_tt")||has(s,"tp_video"))A("info","9:16 內容的上方約 14%、下方約 35%、左右約 6% 常被平台介面遮擋（公開指南的保守做法，各平台不同）；模板預覽可顯示這個安全區，標題、字幕與 CTA 須在區內。");
  // 4C 4D 4E
  if(has(s,"tp_video")||has(s,"af_vid")||has(s,"ch_igr")||has(s,"ch_tt")||has(s,"ch_yt")){if(s.s4c){if(!s.s4c.caption)A("info","4C 尚未決定字幕政策；影片內容有人聲須有字幕。");if(s.s4c.hook&&!has(s,"hk_value")&&false)A("info","")}else A("info","尚未匯入 4C，影片字幕、格式與音樂授權規則無法對照。")}
  if(s.s4d&&s.s4d.compliance.some(x=>/醫療器材/.test(x))&&(has(s,"cl_health")||hits.some(h=>h.cat==="health")))A("warn","4D 提到醫療器材分類：產品功效宣稱須與分類與證據一致，廣告不可超出。");
  if(!s.s4e)A("info","尚未匯入 4E：CTA 按鈕圓角使用預設值（8px）。");
  const alt=picked(s,"altText");if(s.templateTypes.length&&!alt)A("info","還沒決定替代文字（Alt）政策；圖片內的文字須同時出現在說明文字或 Alt 中。");if(alt&&alt.id==="at_none")A("warn","不附替代文字：螢幕閱讀器使用者無法得知圖片內容；Carousel 每頁尤其。");
  const em=picked(s,"emojiPolicy");if(em&&em.id==="em_many"&&s.s1&&s.s1.anti.some(x=>/幼稚|廉價/.test(x)))A("warn","大量表情符號與 Stage 1 的禁區（幼稚或廉價）有衝突風險，螢幕閱讀器也會逐個朗讀。");
  const lang=picked(s,"adLang");if(lang&&lang.id==="al_bi"&&s.s3&&!/雙語|英/.test(s.s3.script))A("info","文案選了中英雙語，但 Stage 3 的書寫語言規則沒有提到雙語。");
  // 4A / 4B 禁區
  if(s.s4a)s.s4a.avoid.forEach(v=>{if(/素材庫|假照片/.test(v)&&has(s,"tb_photo"))A("info",`4A 視覺禁區有「${v}」，照片背景須用真實或原創照片。`)});
  if(s.s4b)s.s4b.avoid.forEach(v=>{if(/光暈|科技漸變|漸變/.test(v)&&pb&&pb.id==="tb_grad")A("warn",`4B 表面禁區有「${v}」，但模板背景選了漸變。`)});
  // Stage 1/2/3
  const q=s.s1;
  if(q){q.anti.forEach(x=>{const hit=J2((ANTI_TAG[x]||[]).flatMap(t=>T(t)));if(hit)A("warn",`Stage 1 要避免「${x}」，但你選的 ${hit} 容易帶來這種感覺。`)});q.dials.forEach(d=>{if(d.id==="quiet_bold"&&d.position<=-1&&(T("loud").length||T("bold").length))A("warn",`Stage 1 傾向「低調克制」，但 ${J2([...T("loud"),...T("bold")])} 偏張揚。`);if(d.id==="premium_access"&&d.position<=-1&&(has(s,"tp_promo")||has(s,"hk_time")))A("warn","Stage 1 傾向「高端稀有」，但選了優惠推廣或時效 Hook；折扣與倒數容易損害高端感。")})}
  else A("info","尚未匯入 Stage 1，無法對照定位與禁區。");
  if(s.s2)s.s2.keywords.forEach(k=>KW_AVOID.forEach(([re,tg,msg])=>{if(re.test(k)){const hit=J2(tg.flatMap(t=>T(t)));if(hit)A("warn",`Stage 2 的關鍵字「${k}」，但 ${hit} ${msg}。`)}}));
  if(s.s3){if(s.s3.personality.some(x=>/專業|嚴謹|可靠/.test(x))&&T("childish").length)A("warn",`Stage 3 的說話性格偏專業，但 ${J2(T("childish"))} 偏孩子氣。`)}
  else A("info","尚未匯入 Stage 3，無法對照文案語氣。");
  if(!T_(s,"pos_line"))A("info","還沒寫市場定位一句話；所有 Hook 與廣告都應回到這句話。");
  // 受眾與資料
  if(has(s,"tg_list")||has(s,"tg_retarget")||has(s,"tg_lookalike"))A("warn","自訂名單、再行銷與類似受眾會使用個人資料或追蹤：須有合法基礎、私隱聲明與同意，並遵守平台政策；不是法律意見。");
  // KPI
  const k=kpiCalc(s);
  if(k){if(k.cpa!=null&&k.mar!=null&&k.cpa>k.mar)A("warn",`在你的假設下，每次獲取成本約 ${k.cpa.toFixed(0)} HKD，高於每次轉化的毛利 ${k.mar} HKD，這個活動會虧本。`);if(k.roas!=null&&k.roas<1)A("warn",`在你的假設下，廣告回報率約 ${k.roas.toFixed(2)}，低於 1（收入少於廣告費）。`);if(k.conv<10)A("info",`在你的假設下，預期轉化只有約 ${k.conv.toFixed(1)} 次，數據太少，難以判讀哪個素材有效；可提高預算、縮短目標，或改以更前端的指標評估。`);if(k.ctr>10||k.cvr>40)A("info","點擊率或轉化率的假設偏高，請確認不是輸入錯誤；這些數字只是你的假設，不是行業基準。")}
  else if(s.kpis.length)A("info","已選成效指標，但還沒填預算、CPM、CTR 與轉化率，無法試算。");
  if(has(s,"ag_convert")&&!has(s,"kp_cpa")&&!has(s,"kp_roas"))A("info","目標含轉化，但成效指標沒有每次獲取成本或廣告回報率。");
  if(has(s,"ag_aware")&&s.kpis.length&&s.kpis.every(x=>["kp_cvr","kp_cpa","kp_roas"].includes(x)))A("info","目標是認知，但指標都是轉化型，會低估認知活動的價值。");
  if(s.kpis.length&&s.kpis.every(x=>["kp_reach","kp_eng"].includes(x)))A("info","只看觸及與互動很容易被虛榮指標誤導；建議至少加一個連到生意的指標（預約、成本或回報）。");
  // UTM 與日曆
  if(T_(s,"u_campaign")&&T_(s,"u_campaign")!==slug(T_(s,"u_campaign")))A("warn",`活動名稱含大寫、空格或特殊字元，UTM 會改成「${slug(T_(s,"u_campaign"))}」；建議一開始就用小寫英文與底線，並統一命名。`);
  if(T_(s,"u_base")){try{new URL(T_(s,"u_base"))}catch(e){A("warn","落地頁網址格式不正確（須含 https://）。")}}else if(s.channels.some(c=>UTM_MAP[c]))A("info","已選渠道，但還沒填落地頁網址，無法產生 UTM 連結。");
  const ppw=num(s,"ppw",NaN);if(isFinite(ppw)&&ppw>7)A("warn",`每個渠道每週 ${ppw} 則，工作量與觀眾疲勞風險都偏高。`);if(isFinite(ppw)&&ppw*s.channels.filter(c=>UTM_MAP[c]).length>14)A("info","每週總發文數超過 14 則，請確認人手與審稿流程。");
  if(!s.pillars.length&&s.channels.length)A("info","還沒選內容支柱，內容日曆無法分配主題。");
  // 簡報
  if(s.slides.length&&!String(s.text.ppt_lines||"").trim())A("info","選了簡報版型，但還沒填各頁標題。");
  if(has(s,"sl_chart"))A("info","圖表頁須有標題、單位、來源與日期；顏色須通過 4E 的對比與色盲檢查。");
  if(has(s,"sl_team")&&!has(s,"cl_face"))A("info","簡報有團隊頁：肖像與個人資料須取得同意。");
  const car=carouselSlides(s);if(has(s,"tp_carousel")&&car.length<4)A("info","Carousel 建議至少 4 頁（封面、2 頁以上內容、CTA）；請在上方填各頁內容。");if(car.length>10)A("info","Carousel 頁數偏多，後面的頁面通常很少人看；首頁必須自己能成立。");
  if(has(s,"tp_carousel")&&car.length&&car[0].title&&[...car[0].title].length>26)A("info","Carousel 封面標題偏長。");
  return out}

// ---------- 輸出 ----------
function draft(s){const L=(k,n)=>labels(k,s).slice(0,n).join("、")||"［尚未選擇］";const P=d=>{const o=picked(s,d);return o?o.zh:"［未定］"};
  return `${brandName(s)} 的行銷內容與廣告：目標「${L("adGoal",2)}」，渠道「${L("channels",3)}」，模板「${L("templateTypes",3)}」，背景「${P("tplBg")}」，Hook「${L("hooks",2)}」，CTA「${L("ctas",2)}」，審稿「${P("reviewFlow")}」。${count("adAvoid",s)?"禁區："+labels("adAvoid",s).slice(0,4).join("、")+"。":""}`}
function negatives(s){const n=[...labels("adAvoid",s)];if(s.s1)n.push(...s.s1.anti);if(s.s2)n.push(...s.s2.anti);if(s.s4a)n.push(...s.s4a.avoid);if(s.s4b)n.push(...s.s4b.avoid);if(s.s4c)n.push(...s.s4c.avoid);return [...new Set(n)]}
function tokensCSS(s){const p=palette(s),cw=cwPick(s);const mp=picked(s,"safeMargin"),h1=picked(s,"headlineScale"),po=picked(s,"patOverlay");if(!cw)return "/* 尚未填寫色值 */\n";const st=gradStops(s);
  let css=`:root{\n  --tpl-bg:${cw.bg};\n  --tpl-fg:${cw.fg};\n  --tpl-accent:${cw.ac};\n`;Object.entries(p).forEach(([k,v])=>css+=`  --brand-${k.slice(2)}:${v};\n`);if(st)css+=`  --tpl-gradient:linear-gradient(${parseFloat(T_(s,"g_angle"))||135}deg, ${st.map(x=>x.hex+" "+x.pos+"%").join(", ")});\n`;
  css+=`  --tpl-margin:${mp?parseFloat(mp.tok["--margin"])*100:8}%;\n  --tpl-h1:${h1?h1.tok["--h1"]:72}px;\n  --tpl-pattern-opacity:${po?po.tok["--pat"]:0};\n  --tpl-cta-radius:${s.s4e&&s.s4e.radius.md!=null?s.s4e.radius.md:8}px;\n  --tpl-font-head:'${T_(s,"f_head")||"Noto Sans TC"}';\n  --tpl-font-body:'${T_(s,"f_body")||"Noto Sans TC"}';\n}\n`;
  css+=`/* 9:16 安全區（公開指南的保守做法，各平台不同） */\n.safe-9x16{padding:14% 6% 35% 6%}\n`;s.s4b&&s.s4b.colorways.forEach(c=>{css+=`.cw-${slug(c.id||c.name)||"x"}{--tpl-bg:${c.bg};--tpl-fg:${c.fg};--tpl-accent:${c.ac}}\n`});return css}
function copyDeck(s){const md=[`# ${brandName(s)} · 文案稿（copy-deck，draft）\n`,"> 草稿，須人類審稿。關鍵字掃描只是提示，不是法律判斷；健康、優惠、見證與比較內容須人類合規審核。\n"];
  md.push(`## 定位\n\n${T_(s,"pos_line")||"（未填）"}\n\n受眾：${T_(s,"aud")||"（未填）"}\n\n## 主文案\n\n- Hook：${T_(s,"hook")||"（未填）"}\n- 副標：${T_(s,"sub")||"（未填）"}\n- CTA：${T_(s,"cta_text")||"（未填）"}\n- 條款與披露：${T_(s,"disc_text")||"（未填）"}\n`);
  md.push("## Carousel\n");carouselSlides(s).forEach(c=>md.push(`${c.i+1}. （${c.role}）${c.title}｜${c.body}`));md.push("\n## 簡報\n");String(s.text.ppt_lines||"").split(/\n+/).filter(Boolean).forEach((l,i)=>md.push(`${i+1}. ${l}`));
  md.push("\n## 披露項目\n\n"+(labels("disclosures",s).map(x=>"- "+x).join("\n")||"（未選）"));md.push("\n## 宣稱與證據\n");const hits=scanAll(s);md.push(labels("claimTypes",s).map(x=>"- [ ] "+x+"：證據與審核者＿＿＿").join("\n")||"（未選）");if(hits.length){md.push("\n### 關鍵字提示\n");hits.forEach(h=>md.push(`- ${h.field}：「${h.words.join("、")}」— ${h.note}`))}return md.join("\n")}
function campaignPlan(s){const P=d=>{const o=picked(s,d);return o?o.zh:null};return {schema:"headx.campaign-plan/v1",status:"draft",note:"成效數字是你輸入的假設，不是行業基準；平台尺寸、字數與政策以最新說明為準；宣稱須人類合規審核。",brand:brandName(s),positioning:T_(s,"pos_line")||null,audience:T_(s,"aud")||null,goals:labels("adGoal",s),funnel:labels("funnel",s),targeting:labels("targeting",s),channels:labels("channels",s),ad_formats:labels("adFormats",s),templates:labels("templateTypes",s),hooks:labels("hooks",s),ctas:labels("ctas",s),copy_framework:labels("copyFramework",s),pillars:labels("pillars",s),
  copy:{hook:T_(s,"hook")||null,sub:T_(s,"sub")||null,cta:T_(s,"cta_text")||null,disclosure:T_(s,"disc_text")||null},claims:labels("claimTypes",s),disclosures:labels("disclosures",s),review_flow:P("reviewFlow"),alt_text:P("altText"),kpis:labels("kpis",s),forecast:kpiCalc(s),utm:utmRows(s),calendar:calendarRows(s),claim_scan:scanAll(s).map(h=>({field:h.field,category:h.cat,words:h.words})),approval:{state:"draft",approved_by:null}}}
function utmCSV(s){return "渠道,source,medium,campaign,content,URL\n"+utmRows(s).map(r=>[r.channel,r.source,r.medium,r.campaign,r.content,r.url].map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n")}
function calendarCSV(s){return "週,日,渠道,內容支柱,模板類型,主題／文案,審稿狀態\n"+calendarRows(s).map(r=>[r.week,r.day,r.channel,r.pillar,r.template,"","待審"].map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n")}
function adPrompt(s){const L=k=>labels(k,s).join(", ")||"unspecified",P=d=>{const o=picked(s,d);return o?o.zh:"unspecified"};const p=palette(s),neg=negatives(s).join(", ")||"none specified";
  return `Design a social/ad creative for the brand "${brandName(s)}".\nPositioning: ${T_(s,"pos_line")||"unspecified"}. Audience: ${T_(s,"aud")||"unspecified"}.\nGoal: ${L("adGoal")}; funnel: ${L("funnel")}; channels: ${L("channels")}; template: ${L("templateTypes")}.\nHook: "${T_(s,"hook")||"unspecified"}"; subhead: "${T_(s,"sub")||"unspecified"}"; CTA: "${T_(s,"cta_text")||"unspecified"}"; small print: "${T_(s,"disc_text")||"none"}".\nVisual system: background ${P("tplBg")}, alignment ${P("tplAlign")}, CTA ${P("ctaStyle")}, margin ${P("safeMargin")}, headline ${P("headlineScale")}, pattern overlay ${P("patOverlay")}, logo ${P("logoPos")}.\nColours: primary ${p.c_primary||"?"}, secondary ${p.c_secondary||"?"}, accent ${p.c_accent||"?"}, text ${p.c_ink||"?"}, background ${p.c_paper||"?"}.\nRequirements: headline contrast at least 4.5:1; keep text inside platform safe zones (for 9:16 avoid roughly the top 14% and bottom 35%); small print must be legible; one primary CTA only.\nNegative constraints (must NOT appear): ${neg}. No fake countdowns, no unverifiable claims, no before/after implying guaranteed results, no health or treatment claims, no gibberish text, no watermarks, no undisclosed AI-generated people.\nNote: concept only; claims, offers and testimonials must be verified and approved by a human before publishing.`}
function buildGuide(s){const L=k=>labels(k,s),P=d=>{const o=picked(s,d);return o?`${o.zh}（${o.desc}）`:"（未定義）"};const md=[],H=t=>md.push("\n## "+t+"\n");
  md.push(`# ${brandName(s)} · 行銷內容與廣告指南（marketing-guide）`);md.push(`\n> ${T_(s,"statement")||draft(s)}\n`);md.push("> 草稿，不等於核准。關鍵字掃描與合規提醒只是提示，不是法律意見；平台規格與政策以最新說明為準；成效數字是假設。");
  H("1. 策略");md.push(`定位：${T_(s,"pos_line")||"（未填）"}\n\n受眾：${T_(s,"aud")||"（未填）"}\n\n目標：${L("adGoal").join("、")||"（未選）"}\n\n漏斗：${L("funnel").join("、")||"（未選）"}\n\n受眾策略：${L("targeting").join("、")||"（未選）"}`);
  H("2. 渠道、格式與模板");md.push(`渠道：${L("channels").join("、")||"（未選）"}\n\n廣告格式：${L("adFormats").join("、")||"（未選）"}\n\n模板：${L("templateTypes").join("、")||"（未選）"}`);
  H("3. 模板規則（來自 4B 與 4E）");md.push(`背景：${P("tplBg")}\n\n對齊：${P("tplAlign")}\n\nCTA：${P("ctaStyle")}\n\n邊距：${P("safeMargin")}\n\n標題：${P("headlineScale")}\n\n圖案：${P("patOverlay")}\n\n標誌：${P("logoPos")}\n\n字體：標題 ${T_(s,"f_head")||"（未填）"}／內文 ${T_(s,"f_body")||"（未填）"}（授權須涵蓋廣告與社群）`);
  H("4. 文案");md.push(`Hook 類型：${L("hooks").join("、")||"（未選）"}\n\nCTA 類型：${L("ctas").join("、")||"（未選）"}\n\n框架：${L("copyFramework").join("、")||"（未選）"}\n\n支柱：${L("pillars").join("、")||"（未選）"}\n\n主 Hook：${T_(s,"hook")||"（未填）"}\n\nCTA：${T_(s,"cta_text")||"（未填）"}`);
  H("5. 披露、宣稱與審稿");md.push(`披露：${L("disclosures").join("、")||"（未選）"}\n\n宣稱：${L("claimTypes").join("、")||"（未選）"}\n\n審稿：${P("reviewFlow")}\n\nAlt：${P("altText")}\n\n表情：${P("emojiPolicy")}\n\n語言：${P("adLang")}`);
  H("6. 簡報");md.push(L("slides").join("、")||"（未選）");H("7. 成效與預算（假設）");const k=kpiCalc(s);md.push(`指標：${L("kpis").join("、")||"（未選）"}`);if(k)md.push(`\n預算 ${k.b} HKD → 曝光約 ${Math.round(k.imp).toLocaleString()}、點擊約 ${Math.round(k.clicks).toLocaleString()}、轉化約 ${k.conv.toFixed(1)}${k.cpa!=null?`、CPA 約 ${k.cpa.toFixed(0)} HKD`:""}${k.roas!=null?`、ROAS 約 ${k.roas.toFixed(2)}`:""}（皆為假設）`);
  H("8. 禁區");md.push(negatives(s).map(x=>"- "+x).join("\n")||"（未定義）");H("9. 3 個代表性內容");md.push(ADS.map(([id,l])=>`- ${l}：${T_(s,id)||"（未填）"}`).join("\n"));return md.join("\n")}
function buildSystem(s){const L=k=>labels(k,s).join("、")||"（未定義）",P=d=>{const o=picked(s,d);return o?o.zh:"（未定義）"};
  return `你是「${brandName(s)}」的行銷內容與廣告設計 Agent。所有社群貼文、Carousel、短影片腳本、廣告文案、簡報版面與生成提示詞，必須遵守以下規範。\n${s.s1&&s.s1.statement?"定位（Stage 1）："+s.s1.statement+"\n":""}${s.s3&&s.s3.statement?"語氣（Stage 3）："+s.s3.statement+"\n":""}${s.s4b&&s.s4b.statement?"表面系統（4B）："+s.s4b.statement+"\n":""}\n【一句話】${T_(s,"statement")||draft(s)}\n【定位】${T_(s,"pos_line")||"（未定義）"}；受眾：${T_(s,"aud")||"（未定義）"}\n【目標與渠道】${L("adGoal")}；漏斗 ${L("funnel")}；渠道 ${L("channels")}；模板 ${L("templateTypes")}\n【模板規則】背景 ${P("tplBg")}；對齊 ${P("tplAlign")}；CTA ${P("ctaStyle")}；邊距 ${P("safeMargin")}；標題 ${P("headlineScale")}；圖案 ${P("patOverlay")}；標誌 ${P("logoPos")}\n【文案】Hook ${L("hooks")}；CTA ${L("ctas")}；框架 ${L("copyFramework")}；披露 ${L("disclosures")}\n\n【絕對禁止】${negatives(s).join("、")||"（未定義）"}\n\n【工作規則】\n1) 標題與文字對背景對比至少 4.5:1（大字 3:1）；9:16 內容須避開頂部約 14%、底部約 35% 的介面遮擋區；條款小字須在手機上可讀；一則內容只放一個主要 CTA。\n2) 不可作出治療、預防疾病或保證效果的宣稱；不可偽造見證、評論、數字、獎項或倒數；價格與優惠須真實可供應並列明條款；商業合作須清楚披露；AI 生成的人物與見證須披露。\n3) 健康、美容、優惠、見證、前後對比與比較內容，發布前必須由人類合規審核；你的關鍵字提示不是法律判斷。香港相關規管包括《不良醫藥廣告條例》（第 231 章）與《商品說明條例》（第 362 章），具體合規須由專業人士確認。\n4) 收集名單、再行銷與電郵／WhatsApp 推廣須有合法基礎、私隱聲明、同意與退訂；不可自行假設已獲同意。\n5) 平台尺寸、字數與政策會改變，須以最新平台說明為準，不可編造規格；成效數字是使用者的假設，不可當成行業基準或承諾。\n6) 圖片須有替代文字；影片須有字幕；不依賴顏色或表情符號傳達關鍵資訊。\n7) 遇到規範沒有涵蓋或互相衝突的情況，請回報人類，不要自行決定。\n8) 所有輸出標示為『AI 提案，待人類核准』。`}
function hints(s){const H=[],A=(st,f,t,w)=>H.push({stage:st,field:f,text:t,why:w});
  A("4G 跨媒體使用與治理","模板庫與核准","把模板、文案稿與披露規則放入模板庫並記錄版本；建立宣稱證據檔案（來源、日期、審核者）與下架流程","模板與宣稱");
  A("4G 跨媒體使用與治理","授權與同意","登記素材、音樂、字體、肖像與 KOL 合約的授權範圍與期限；記錄名單同意與退訂","行銷素材與資料");
  if(s.claimTypes.length)A("4G 跨媒體使用與治理","合規審核","為高風險內容（"+labels("claimTypes",s).join("、")+"）建立固定的合規審核與留存紀錄","宣稱類型");
  A("4H 風格庫與 AI 生成契約","風格庫","把模板、Hook 庫、CTA 庫、廣告 Prompt 與負面約束存成可重用條目，並標示『高風險內容須人類審核』","供 AI 生成使用");
  A("4H 風格庫與 AI 生成契約","評估集","準備一組含有違規與合規範例的測試稿，用來驗證 AI 不會產出療效承諾、虛假倒數或偽造見證","行銷 AI 的守門");
  return H}
function completeness(s){const car=carouselSlides(s).length,ppt=String(s.text.ppt_lines||"").split(/\n+/).filter(x=>x.trim()).length,pp=palette(s);const c=[
  ["strategy","目標、漏斗、受眾與定位",count("adGoal",s)>=1&&count("funnel",s)>=1&&count("targeting",s)>=1&&!!T_(s,"pos_line")&&!!T_(s,"aud")],["channels","渠道、廣告格式與模板類型",count("channels",s)>=1&&count("adFormats",s)>=1&&count("templateTypes",s)>=1],
  ["tokens","色值與模板視覺規則",Object.keys(pp).length===5&&["tplBg","tplAlign","ctaStyle","safeMargin","headlineScale","patOverlay","logoPos"].every(d=>picked(s,d))],["hook","Hook、CTA 與文案框架（類型）",count("hooks",s)>=1&&count("ctas",s)>=1&&count("copyFramework",s)>=1],["copy","主文案（Hook、副標、CTA、披露）",["hook","sub","cta_text","disc_text"].every(id=>T_(s,id))],
  ["carousel","Carousel（至少 4 頁）",car>=4],["slides","簡報版型與頁面（至少 3 頁）",count("slides",s)>=1&&ppt>=3],["compliance","披露、宣稱、審稿與 Alt",count("disclosures",s)>=1&&count("claimTypes",s)>=1&&!!picked(s,"reviewFlow")&&!!picked(s,"altText")],
  ["kpi","成效指標與試算",count("kpis",s)>=1&&!!kpiCalc(s)],["utm","UTM 與內容日曆",!!T_(s,"u_base")&&!!T_(s,"u_campaign")&&count("pillars",s)>=1],["avoid","禁區（至少 5 個）",count("adAvoid",s)>=5],["ads","3 個代表性內容",ADS.every(([id])=>T_(s,id))],["style","表情與語言政策",!!picked(s,"emojiPolicy")&&!!picked(s,"adLang")]];
  const done=c.filter(x=>x[2]).length;return {done,total:c.length,pct:Math.round(done/c.length*100),missing:c.filter(x=>!x[2]).map(x=>({key:x[0],label:x[1]}))}}
function buildBrief(s){const c=completeness(s),pk=k=>items(k,s).map(i=>({id:i.id,name:i.zh,note:i.desc}));const dm={};DIMS.forEach(d=>{const o=picked(s,d.id);if(o)dm[d.id]={id:o.id,name:o.zh,note:o.desc}});const tx={};TEXTS.forEach(t=>{if(T_(s,t.id))tx[t.id]=T_(s,t.id)});
  return {schema:"brand/stage4f-marketing/v1",status:c.missing.length?"incomplete":"complete",completeness:c.pct,missing:c.missing,approval:{state:"draft",approved_by:null,note:"草稿；AI 提案與表單填寫不等於人類核准；宣稱與合規須人類審核；成效數字是假設。"},
   stage_context:{stage0:s.s0||null,stage1:s.s1||null,stage2:s.s2||null,stage3:s.s3||null,stage4a:s.s4a||null,stage4b:s.s4b?Object.assign({},s.s4b,{tile:s.s4b.tile?"(svg)":""}):null,stage4c:s.s4c||null,stage4d:s.s4d||null,stage4e:s.s4e||null},brand_name:brandName(s),
   strategy:{positioning:tx.pos_line||null,audience:tx.aud||null,goals:pk("adGoal"),funnel:pk("funnel"),targeting:pk("targeting")},channels:{selected:pk("channels"),ad_formats:pk("adFormats"),templates:pk("templateTypes")},
   template_rules:{background:dm.tplBg||null,align:dm.tplAlign||null,cta_style:dm.ctaStyle||null,margin:dm.safeMargin||null,headline:dm.headlineScale||null,pattern_overlay:dm.patOverlay||null,logo:dm.logoPos||null,palette:palette(s),gradient:{a:tx.g_a||null,b:tx.g_b||null,c:tx.g_c||null,angle:tx.g_angle||null},fonts:{head:tx.f_head||null,body:tx.f_body||null},colorway:tx.tpl_cw||null},
   copy:{hooks:pk("hooks"),ctas:pk("ctas"),framework:pk("copyFramework"),pillars:pk("pillars"),hook:tx.hook||null,sub:tx.sub||null,cta:tx.cta_text||null,disclosure:tx.disc_text||null,carousel:carouselSlides(s),ppt_lines:tx.ppt_lines||null,claim_scan:scanAll(s).map(h=>({field:h.field,category:h.cat,words:h.words}))},
   compliance:{disclosures:pk("disclosures"),claims:pk("claimTypes"),review_flow:dm.reviewFlow||null,alt_text:dm.altText||null,emoji:dm.emojiPolicy||null,language:dm.adLang||null},slides:pk("slides"),
   performance:{kpis:pk("kpis"),inputs:{budget:tx.b_budget||null,cpm:tx.b_cpm||null,ctr:tx.b_ctr||null,cvr:tx.b_cvr||null,value:tx.b_value||null,margin:tx.b_margin||null},forecast:kpiCalc(s)},tracking:{base:tx.u_base||null,campaign:tx.u_campaign||null,posts_per_week:tx.ppw||null,utm:utmRows(s),calendar:calendarRows(s)},
   avoid:pk("adAvoid"),combined_negatives:negatives(s),key_content:{c1:tx.ad1||null,c2:tx.ad2||null,c3:tx.ad3||null},notes:tx.st_note||null,statement:{text:T_(s,"statement")||draft(s),source:T_(s,"statement")?"human":"auto-draft"},
   template_tokens_css:tokensCSS(s),campaign_plan:campaignPlan(s),copy_deck_md:copyDeck(s),ad_prompt:adPrompt(s),template_pack:templatePack(s).map(t=>({name:t.name,file:t.file,svg:t.svg,metrics:{contrast:Math.floor((t.metrics.contrast||0)*100)/100,phone_headline_px:Math.round((t.metrics.phoneH1||0)*10)/10}})),
   consistency_checks:checks(s),downstream_hints:hints(s),guide_md:buildGuide(s),system_prompt:buildSystem(s),
   agent_rules:["所有行銷內容與廣告輸出必須符合 system_prompt、guide_md 與 template_tokens_css。","不可作出治療、預防疾病或保證效果的宣稱；不可偽造見證、評論、數字、獎項或倒數；價格與優惠須真實可供應並列明條款；商業合作須披露；AI 生成人物與見證須披露。","健康、美容、優惠、見證、前後對比與比較內容，發布前必須由人類合規審核；關鍵字掃描只是提示，不是法律判斷。","標題對比至少 4.5:1；9:16 內容避開安全區外的介面遮擋區；條款小字須可讀；一則內容一個主要 CTA。","名單、再行銷與電郵／WhatsApp 推廣須有合法基礎、私隱聲明、同意與退訂；不可假設已獲同意。","平台規格與政策以最新說明為準；成效數字是使用者假設，不是行業基準或承諾。","combined_negatives 中的任何一項都不可出現；不確定時回報人類。","consistency_checks 中 level 為 warn 或 error 的項目須先由人類確認，才可進入 4G–4H。","approval.state 為 draft 時，不得視為已核准；不得自行把狀態改為已核准。","status 為 incomplete 時，缺少的欄位不得自行補寫。","本階段不提供風格相符度分數。"]}}

// ---------- 貼回 ----------
function matchItem(k,name){const n=norm(name);if(!n)return null;const L=flat(k);return L.find(i=>i.id===name||norm(i.zh)===n)||L.find(i=>n.length>=2&&(norm(i.zh).includes(n)||(norm(i.zh).length>=2&&n.includes(norm(i.zh)))))||null}
function matchOpt(d,name){const dm=DIM(d);if(!dm)return null;const n=norm(name);return dm.opts.find(o=>o.id===name||norm(o.zh)===n)||dm.opts.find(o=>n.length>=2&&(norm(o.zh).includes(n)||(norm(o.zh).length>=2&&n.includes(norm(o.zh)))))||null}
function extractJSON(text){const sl=text.slice(text.indexOf("{"),text.lastIndexOf("}")+1);try{return JSON.parse(sl)}catch(e){const f=text.match(/```(?:json)?\s*([\s\S]*?)```/i);return JSON.parse(f?f[1]:sl)}}
function normalizeBrief(j){if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4f"))return j;const n=a=>(a||[]).map(x=>x.name);const o={},st=j.strategy||{},ch=j.channels||{},tr=j.template_rules||{},cp=j.copy||{},co=j.compliance||{},pf=j.performance||{},tk=j.tracking||{};
  o.adGoal=n(st.goals);o.funnel=n(st.funnel);o.targeting=n(st.targeting);o.channels=n(ch.selected);o.adFormats=n(ch.ad_formats);o.templateTypes=n(ch.templates);o.hooks=n(cp.hooks);o.ctas=n(cp.ctas);o.copyFramework=n(cp.framework);o.pillars=n(cp.pillars);o.disclosures=n(co.disclosures);o.claimTypes=n(co.claims);o.slides=n(j.slides);o.kpis=n(pf.kpis);o.adAvoid=n(j.avoid);
  o.dims={};const d=(k,x)=>{if(x)o.dims[k]=x.name};d("tplBg",tr.background);d("tplAlign",tr.align);d("ctaStyle",tr.cta_style);d("safeMargin",tr.margin);d("headlineScale",tr.headline);d("patOverlay",tr.pattern_overlay);d("logoPos",tr.logo);d("reviewFlow",co.review_flow);d("altText",co.alt_text);d("emojiPolicy",co.emoji);d("adLang",co.language);
  o.text={};const t=(k,x)=>{if(x!=null&&x!=="")o.text[k]=String(x)};t("pos_line",st.positioning);t("aud",st.audience);Object.entries(tr.palette||{}).forEach(([k,v])=>t(k,v));const g=tr.gradient||{};t("g_a",g.a);t("g_b",g.b);t("g_c",g.c);t("g_angle",g.angle);const f=tr.fonts||{};t("f_head",f.head);t("f_body",f.body);t("tpl_cw",tr.colorway);t("hook",cp.hook);t("sub",cp.sub);t("cta_text",cp.cta);t("disc_text",cp.disclosure);t("ppt_lines",cp.ppt_lines);if(Array.isArray(cp.carousel)&&cp.carousel.length)t("car_slides",cp.carousel.map(c=>(c.title||"")+"｜"+(c.body||"")).join("\n"));
  const inp=pf.inputs||{};[["b_budget","budget"],["b_cpm","cpm"],["b_ctr","ctr"],["b_cvr","cvr"],["b_value","value"],["b_margin","margin"]].forEach(([k,v])=>t(k,inp[v]));t("u_base",tk.base);t("u_campaign",tk.campaign);t("ppw",tk.posts_per_week);const kc=j.key_content||{};t("ad1",kc.c1);t("ad2",kc.c2);t("ad3",kc.c3);t("st_note",j.notes);t("brandName",j.brand_name);if(j.statement&&j.statement.source==="human")t("statement",j.statement.text);return o}
function applyPaste(text,s){const out={applied:[],custom:[],errors:[]};let j;
  try{j=normalizeBrief(extractJSON(text))}catch(e){out.errors.push("找不到可解析的 JSON 區塊（請連同 ```json 區塊一起貼上）");return out}
  CAT_KEYS.forEach(k=>{if(!Array.isArray(j[k]))return;const ids=[],cu=[];j[k].forEach(n=>{const m=matchItem(k,n);if(m){if(!ids.includes(m.id))ids.push(m.id)}else if(String(n).trim()&&!cu.includes(String(n).trim()))cu.push(String(n).trim())});s[k]=ids;s.custom[k]=cu;out.applied.push(`${CAT[k].title.replace(/（.*/,"")}：${ids.length} 項`+(cu.length?`＋自訂 ${cu.length} 項`:""));cu.forEach(c=>out.custom.push(c))});
  const dd=Object.assign({},j.dims||{});DIMS.forEach(d=>{if(typeof j[d.id]==="string"||(j[d.id]&&j[d.id].name))dd[d.id]=typeof j[d.id]==="string"?j[d.id]:j[d.id].name});let c=0;Object.entries(dd).forEach(([d,v])=>{if(!DIM(d))return;const o=matchOpt(d,v);if(o){s.dims[d]=o.id;c++}else out.errors.push(`「${d}」的值「${v}」不在清單內，未套用`)});if(c)out.applied.push(`單選規則：${c} 項`);
  const tx=Object.assign({},j.text||{});TEXTS.forEach(t=>{if(typeof j[t.id]==="string"||typeof j[t.id]==="number")tx[t.id]=j[t.id]});if(typeof j.tpl_cw==="string")tx.tpl_cw=j.tpl_cw;let tc=0;Object.entries(tx).forEach(([k,v])=>{if((TEXT_BY[k]||k==="tpl_cw")&&(typeof v==="string"||typeof v==="number")){s.text[k]=String(v);tc++}});if(tc)out.applied.push(`文字欄：${tc} 項`);
  if(Array.isArray(j.pubs)&&j.pubs.length){s.pubs=j.pubs.filter(r=>r&&typeof r==="object").map(r=>{const o={};PUBCOLS.forEach(([id])=>o[id]=r[id]!=null?String(r[id]):"");return o});out.applied.push("發佈與成效紀錄："+s.pubs.length+" 筆")}
  if(!out.applied.length)out.errors.push("JSON 內沒有可辨識的欄位");return out}
