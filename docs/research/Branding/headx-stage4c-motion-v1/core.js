
const KEY="brand_stage4c_v1";
const BK={s0:"brand_brief_stage0",s1:"brand_brief_stage1",s2:"brand_brief_stage2",s3:"brand_brief_stage3",s4a:"brand_brief_stage4a",s4b:"brand_brief_stage4b"};
const norm=t=>String(t||"").replace(/\s+/g,"").toLowerCase();
const emptyState=()=>{const s={s0:null,s1:null,s2:null,s3:null,s4a:null,s4b:null,dims:{},text:{},custom:{}};CAT_KEYS.forEach(k=>{s[k]=[];s.custom[k]=[]});return s};
function load(){let s=emptyState();try{const r=JSON.parse(localStorage.getItem(KEY)||"null");if(r){const e=emptyState();s=Object.assign(e,r);s.custom=Object.assign(e.custom,r.custom||{});s.dims=r.dims||{};s.text=r.text||{};CAT_KEYS.forEach(k=>{if(!Array.isArray(s[k]))s[k]=[];if(!Array.isArray(s.custom[k]))s.custom[k]=[]})}}catch(x){}return autoImport(s)}
function autoImport(s){Object.keys(BK).forEach(n=>{if(s[n])return;try{const raw=localStorage.getItem(BK[n]);if(raw){const p=PARSE[n](raw);if(p){s[n]=p;if(n==="s4b")fillFrom4b(s,p)}}}catch(x){}});return s}
function fillFrom4b(s,p){const g=p.grad||{};[["g_a","a"],["g_b","b"],["g_c","c"],["g_mid","mid"],["g_angle","angle"],["g_txt","text_color"]].forEach(([k,v])=>{if(g[v]&&!String(s.text[k]||"").trim())s.text[k]=String(g[v])})}
function save(s){try{localStorage.setItem(KEY,JSON.stringify(s))}catch(x){}}
const flat=k=>CAT[k].groups.flatMap(g=>g.items);
const byId=(k,id)=>flat(k).find(i=>i.id===id);
const labels=(k,s)=>[...s[k].map(id=>(byId(k,id)||{zh:id}).zh),...s.custom[k]];
const items=(k,s)=>[...s[k].map(id=>byId(k,id)||{id,zh:id,desc:"",t:[],conf:[],n1:0,n2:0}),...s.custom[k].map(t=>({id:"custom",zh:t,desc:"（自訂）",t:[],conf:[],n1:0,n2:0}))];
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
function parseS0(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage0"))return null;const ch=j.choices||{},sel=j.selections||{},d=j.derived||{};return {name:(j.text||{}).trading||(j.text||{}).legalZh||"",budget:(ch.brandBudget||{}).name||"",priceTier:(ch.priceTier||{}).name||"",delivery:nameList(sel.delivery),languages:nameList(sel.languages),markets:nameList(sel.markets),claims:!!d.claims_risk}}
function parseS1(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage1"))return null;return {name:j.brand_name||"",statement:(j.positioning_statement||{}).text||"",dials:((j.core_tension||{}).dials||[]).map(d=>({id:d.id,left:d.left,right:d.right,position:d.position})),anti:nameList(j.anti_persona)}}
function parseS2(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage2"))return null;const rules={};Object.entries(j.physics_rules||{}).forEach(([k,v])=>rules[k]=(v&&v.name)||"");const pt=j.physics_tokens||{};return {statement:(j.sensory_statement||{}).text||"",keywords:nameList(j.mood_keywords),anti:nameList(j.anti_keywords),avoid:nameList(j.avoid_materials),motionsound:nameList(j.motion_sound),rules,duration:pt["--motion-duration"]||"",easing:pt["--motion-easing"]||""}}
function parseS3(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage3"))return null;const dials={};(j.tone_dials||[]).forEach(d=>dials[d.id]=d.position);return {statement:(j.voice_statement||{}).text||"",personality:nameList(j.personality),dials,script:((j.language_rules||{}).script||{}).name||""}}
function parseS4a(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4a"))return null;return {statement:(j.visual_statement||{}).text||"",logoStyle:nameList((j.logo||{}).style),colorStyle:nameList((j.color||{}).style),photo:nameList((j.photography||{}).style),model:nameList((j.photography||{}).people),avoid:nameList(j.visual_avoid),palette:(j.color||{}).palette||{}}}
function parseS4b(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4b"))return null;const g=(j.gradient||{}).spec||{};return {statement:(j.surface_statement||{}).text||"",gradTypes:nameList((j.gradient||{}).types),grad:{a:g.a,b:g.b,c:g.c,mid:g.mid,angle:g.angle,text_color:g.text_color,css:g.css},texture:nameList((j.texture||{}).specs),pattern:nameList((j.pattern||{}).motifs),avoid:nameList(j.surface_avoid),colorways:(j.colorways||[]).map(c=>c.name)}}
const PARSE={s0:parseS0,s1:parseS1,s2:parseS2,s3:parseS3,s4a:parseS4a,s4b:parseS4b};
function importBrief(text,s){const j=J(text);if(!j||typeof j.schema!=="string")return null;const m=j.schema.match(/^brand\/stage(\d)([ab]?)/);if(!m)return null;const k="s"+m[1]+m[2];if(!PARSE[k])return null;const p=PARSE[k](j);if(!p)return null;s[k]=p;if(k==="s4b")fillFrom4b(s,p);try{localStorage.setItem(BK[k],JSON.stringify(j))}catch(e){}return k}
function ctxStages(s){const a=[];
  a.push(s.s0?`【Stage 0 業務】價格定位：${s.s0.priceTier||"（無）"}｜品牌預算：${s.s0.budget||"（無）"}｜交付：${s.s0.delivery.join("、")||"（無）"}｜語言：${s.s0.languages.join("、")||"（無）"}｜市場：${s.s0.markets.join("、")||"（無）"}｜健康宣稱風險：${s.s0.claims?"有":"無"}`:"【Stage 0 業務】（尚未匯入）");
  a.push(s.s1?`【Stage 1 定位】品牌：${s.s1.name||"（尚未命名）"}｜宣言：${s.s1.statement||"（無）"}｜張力刻度：${s.s1.dials.map(d=>`${d.left}↔${d.right}=${d.position}`).join("；")||"（無）"}｜絕對不要像：${s.s1.anti.join("、")||"（無）"}`:"【Stage 1 定位】（尚未匯入）");
  a.push(s.s2?`【Stage 2 感官】感官宣言：${s.s2.statement||"（無）"}｜關鍵字：${s.s2.keywords.join("、")||"（無）"}｜反關鍵字：${s.s2.anti.join("、")||"（無）"}｜動態與聲音：${s.s2.motionsound.join("、")||"（無）"}｜動態規則：${s.s2.rules.motion||"（無）"}（${s.s2.duration||"?"} ${s.s2.easing||""}）`:"【Stage 2 感官】（尚未匯入）");
  a.push(s.s3?`【Stage 3 語言】聲音宣言：${s.s3.statement||"（無）"}｜性格：${s.s3.personality.join("、")||"（無）"}｜書寫語言：${s.s3.script||"（無）"}｜刻度：${Object.entries(s.s3.dials).map(([k,v])=>k+"="+v).join("；")||"（無）"}`:"【Stage 3 語言】（尚未匯入）");
  a.push(s.s4a?`【Stage 4A 視覺語言】一句話：${s.s4a.statement||"（無）"}｜Logo 風格：${s.s4a.logoStyle.join("、")||"（無）"}｜色彩：${s.s4a.colorStyle.join("、")||"（無）"}｜攝影：${s.s4a.photo.join("、")||"（無）"}｜人物：${s.s4a.model.join("、")||"（無）"}｜視覺禁區：${s.s4a.avoid.join("、")||"（無）"}`:"【Stage 4A 視覺語言】（尚未匯入）");
  a.push(s.s4b?`【Stage 4B 表面系統】一句話：${s.s4b.statement||"（無）"}｜漸變：${s.s4b.gradTypes.join("、")||"（無）"}｜紋理：${s.s4b.texture.join("、")||"（無）"}｜圖案：${s.s4b.pattern.join("、")||"（無）"}｜表面禁區：${s.s4b.avoid.join("、")||"（無）"}`:"【Stage 4B 表面系統】（尚未匯入）");
  return a.join("\n")}
function ctxMotion(s){const L=k=>labels(k,s).join("、")||"（尚未選擇）",P=d=>{const o=picked(s,d);return o?o.zh:"（尚未選擇）"},X=id=>T_(s,id)||"（尚未填寫）";
  return [`動態風格：${L("motionStyle")}｜任務 ${L("motionRole")}｜緩動 ${P("easeStyle")}｜時長 ${P("motionScale")}｜編排 ${P("choreo")}｜位移 ${P("distance")}｜減少動態 ${P("reducedPolicy")}｜自動播放 ${P("autoplayPolicy")}`,
  `動態用法：${L("motionUse")}`,`漸變／紋理／形狀動態：${L("gradMotion")}｜屬性 ${P("gradProp")}｜循環 ${P("gradLoop")}｜週期 ${X("gm_dur")} 秒｜減少動態 ${P("gradReduced")}`,
  `影片：風格 ${L("videoStyle")}｜故事 ${L("storyStyle")}｜動畫 ${L("animStyle")}｜格式 ${L("videoFormat")}｜長度 ${X("v_len")} 秒｜幀率 ${X("v_fps")}｜開頭 ${P("hookRule")}`,
  `鏡頭：運鏡 ${L("shot")}｜構圖 ${L("composition")}｜燈光 ${L("lighting")}｜氣氛 ${L("mood")}｜剪接 ${L("editStyle")}｜節奏 ${L("rhythm")}｜表演 ${L("perform")}｜BPM ${X("v_bpm")}`,
  `字幕：${P("capStyle")}｜${P("capContrast")}｜說明 ${P("audioDesc")}`,
  `聲音：元素 ${L("soundEl")}｜音樂 ${L("musicStyle")}｜樂器 ${L("instrument")}｜音色 ${L("timbre")}｜旁白 ${L("voice")}（${L("voiceLang")}）｜UI 音效 ${L("uiSound")}（${P("uiSoundPolicy")}）｜靜默 ${P("silence")}｜音訊標誌 ${P("audioLogoLen")}｜響度 ${P("loudness")}｜來源 ${L("licenseSrc")}｜授權管理 ${P("licensePolicy")}`,
  `禁區：動態 ${L("motionAvoid")}｜影音 ${L("avoidAV")}`].join("\n")}

// ---------- 色彩與漸變 ----------
function hex(v){const m=String(v||"").trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);if(!m)return null;let h=m[1];if(h.length===3)h=h.split("").map(c=>c+c).join("");return "#"+h.toUpperCase()}
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const lin=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
const lum=h=>{const [r,g,b]=rgb(h).map(v=>lin(v/255));return .2126*r+.7152*g+.0722*b};
const fr=x=>(Math.floor(x*100)/100).toFixed(2);
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
function mixHex(a,b,u){const A=rgb(a),B=rgb(b);return "#"+A.map((v,k)=>Math.round(v+(B[k]-v)*u).toString(16).padStart(2,"0")).join("").toUpperCase()}
function stopsOf(a,b,c,mid){a=hex(a);c=hex(c);b=hex(b);if(!a||!c)return null;const m=cl(parseFloat(mid)||50,1,99);const st=[{hex:a,pos:0}];if(b)st.push({hex:b,pos:m});st.push({hex:c,pos:100});return st}
function gradStops(s){return stopsOf(s.text.g_a,s.text.g_b,s.text.g_c,s.text.g_mid)}
function altStops(s){const a=hex(s.text.gm_alt),c=hex(s.text.gm_alt2);if(!a||!c)return null;return [{hex:a,pos:0},{hex:c,pos:100}]}
function sampleGrad(st,t){t=t*100;let i=0;while(i<st.length-2&&t>st[i+1].pos)i++;const a=st[i],b=st[i+1];const u=cl((t-a.pos)/Math.max(1,b.pos-a.pos));return mixHex(a.hex,b.hex,u)}
function gradCSS(s,st){st=st||gradStops(s);if(!st)return null;const ang=isFinite(parseFloat(s.text.g_angle))?parseFloat(s.text.g_angle):135;return `linear-gradient(${ang}deg, ${st.map(x=>`${x.hex} ${x.pos}%`).join(", ")})`}
function animContrast(s){const tx=hex(s.text.g_txt),st=gradStops(s);if(!tx||!st)return null;const alt=altStops(s);const rows=[];
  const scan=(stops,label)=>{let mn={ratio:99,at:0,color:""};for(let i=0;i<=20;i++){const c=sampleGrad(stops,i/20);const r=ratio(c,tx);if(r<mn.ratio)mn={ratio:r,at:i*5,color:c}}rows.push({label,...mn})};
  scan(st,"起始漸變（整條，涵蓋位移動畫的所有位置）");
  if(alt){scan(alt,"終點漸變（色標動畫的另一端）");const mid=st.map((x,i)=>({hex:mixHex(x.hex,alt[Math.min(i,alt.length-1)].hex,.5),pos:x.pos}));scan(mid,"中間狀態（兩組色各 50%）")}
  return rows}

// ---------- 動態計算 ----------
function bezierOf(s){const raw=T_(s,"m_bez");if(raw){const a=raw.split(/[,\s]+/).map(Number);if(a.length===4&&a.every(isFinite)&&a[0]>=0&&a[0]<=1&&a[2]>=0&&a[2]<=1)return a}const e=picked(s,"easeStyle");if(!e)return null;const m=String(e.tok["--ease-standard"]||"").match(/cubic-bezier\(([^)]+)\)/);return m?m[1].split(",").map(Number):null}
function durations(s){const m=picked(s,"motionScale");const g=k=>m?parseFloat(m.tok["--duration-"+k]):null;return {fast:g("fast"),base:g("base"),slow:g("slow")}}
function tokensOf(s){const t={};["easeStyle","motionScale","choreo","distance","reducedPolicy","loudness"].forEach(d=>{const o=picked(s,d);if(o)Object.assign(t,o.tok)});
  const b=bezierOf(s);if(b&&T_(s,"m_bez"))t["--ease-standard"]=`cubic-bezier(${b.join(",")})`;const st=num(s,"m_stag",NaN);if(isFinite(st))t["--stagger"]=st+"ms";Object.keys(t).forEach(k=>{if(t[k]==="?"||t[k]==="mute")delete t[k]});return t}
function useRows(s){const d=durations(s),ratio0=d.base?d.base/250:1;return items("motionUse",s).map(i=>{const base=i.n1||0;let dur=base;if(base>0&&base<1000)dur=Math.max(0,Math.round(base*ratio0/10)*10);
  const ease=/enter|page|toast|skel/.test(i.id)?"--ease-enter":/exit/.test(i.id)?"--ease-exit":"--ease-standard";const dist=picked(s,"distance");return {id:i.id,name:i.zh,duration_ms:dur,easing_token:base===0?null:ease,distance:dist&&/enter|exit|page|toast|scroll/.test(i.id)?dist.tok["--motion-distance"]:null,vestibular:!!i.vest,perf:i.perf||0,reduced:i.note||"",loop:base>=1000}})}
function reducedCSS(s){const p=picked(s,"reducedPolicy");if(!p)return "/* 尚未決定減少動態政策（必須有） */\n";const m=p.tok["--rm-mode"],d=durations(s);
  let body="";if(m==="static")body=`  :root{--duration-fast:0.01ms;--duration-base:0.01ms;--duration-slow:0.01ms;--motion-distance:0px;--stagger:0ms}\n  *,*::before,*::after{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important;scroll-behavior:auto!important}\n`;
  else if(m==="fade")body=`  :root{--motion-distance:0px;--stagger:0ms}\n  *,*::before,*::after{animation-iteration-count:1!important;scroll-behavior:auto!important}\n  [data-motion]{transform:none!important}\n  .parallax{transform:none!important}\n`;
  else body=`  :root{--duration-fast:${Math.round((d.fast||100)/2)}ms;--duration-base:${Math.round((d.base||200)/2)}ms;--duration-slow:${Math.round((d.slow||400)/2)}ms;--motion-distance:0px}\n  *,*::before,*::after{animation-iteration-count:1!important;scroll-behavior:auto!important}\n  .parallax{transform:none!important}\n`;
  let css=`@media (prefers-reduced-motion: reduce){\n${body}}\n`;if(m==="fade"||m==="short"||m==="static"){}
  if(p.id==="rm_user")css+=`/* 站內切換：在 <html> 加上 data-reduced-motion="true" */\n:root[data-reduced-motion="true"]{--motion-distance:0px;--stagger:0ms;--duration-fast:0.01ms;--duration-base:0.01ms;--duration-slow:0.01ms}\n:root[data-reduced-motion="true"] *{animation-iteration-count:1!important}\n`;return css}
function tokensCSS(s){const t=tokensOf(s);let css=":root{\n"+Object.entries(t).filter(([k])=>!/^--(rm-mode|lufs)/.test(k)).map(([k,v])=>`  ${k}:${v};`).join("\n")+"\n}\n";css+=reducedCSS(s);
  const g=gradCSS(s);if(g&&s.gradMotion.some(x=>["gm_shift","gm_breath","gm_shimmer","gm_hue"].includes(x))){const dur=num(s,"gm_dur",10);
    if(has(s,"gm_shift"))css+=`/* 漸變位移（背景位置）：背景放大 200% 後平移；循環超過 5 秒須提供暫停 */\n.grad-shift{background:${g};background-size:200% 200%;animation:grad-shift ${dur}s ease-in-out infinite alternate}\n@keyframes grad-shift{from{background-position:0% 50%}to{background-position:100% 50%}}\n`;
    if(has(s,"gm_breath"))css+=`/* 呼吸（透明度脈動）：週期建議 4 秒以上 */\n.grad-breath{animation:grad-breath ${Math.max(dur/2,4)}s ease-in-out infinite alternate}\n@keyframes grad-breath{from{opacity:.85}to{opacity:1}}\n`;
    if(has(s,"gm_shimmer"))css+=`/* 微光掃過（只在載入期間使用） */\n.shimmer{background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);background-size:200% 100%;animation:shimmer 1.6s linear infinite}\n@keyframes shimmer{from{background-position:200% 0}to{background-position:-200% 0}}\n`;
    css+=`.grad-paused,.grad-paused *{animation-play-state:paused!important}\n`}
  if(picked(s,"easeStyle")||picked(s,"motionScale"))css+=`.motion{transition:opacity var(--duration-base,250ms) var(--ease-standard,ease),transform var(--duration-base,250ms) var(--ease-standard,ease)}\n`;return css}
function pace(s){const bpm=num(s,"v_bpm",NaN),beats=num(s,"v_beats",NaN),fps=num(s,"v_fps",NaN),len=num(s,"v_len",NaN);if(!isFinite(bpm)||!isFinite(beats)||bpm<=0||beats<=0)return null;const sec=beats*60/bpm;const o={bpm,beats,sec,frames:isFinite(fps)?sec*fps:null,fps:isFinite(fps)?fps:null,cuts:isFinite(len)?Math.floor(len/sec):null,len:isFinite(len)?len:null};o.whole=o.frames!=null&&Math.abs(o.frames-Math.round(o.frames))<.01;return o}

// ---------- 標籤與檢查 ----------
function selTags(s){const out={};CAT_KEYS.filter(k=>!["motionAvoid","avoidAV"].includes(k)).forEach(k=>items(k,s).forEach(i=>(i.t||[]).forEach(t=>{(out[t]=out[t]||[]).push(i.zh)})));DIMS.forEach(d=>{const o=picked(s,d.id);if(o)(o.t||[]).forEach(t=>{(out[t]=out[t]||[]).push(o.zh)})});return out}
const ANTI_TAG={"冰冷醫院感":["clinical","cold"],"廉價促銷感":["loud","cheap"],"過度科技炫技":["neon","loud","digital"],"炫富浮誇":["flashy","loud"],"陰暗沉重":["dark"],"過度幼稚":["childish"],"製造焦慮／恐嚇":["anxiety"],"純科技冷硬品牌":["cold"],"老派藥房感":["dated"],"網紅爆款保健品":["loud"],"推銷式連鎖美容院":["loud"],"限時倒數壓迫":["anxiety","energetic"],"素材庫假照片":["stock"]};
const KW_AVOID=[[/克制|安靜|沉穩|沉靜|平靜|從容|舒緩/,["loud","bold","neon","energetic"],"偏張揚"],[/溫暖|溫潤|親切|柔和/,["cold","clinical"],"偏冰冷"],[/輕盈|空靈|通透/,["dark"],"偏沉重暗"],[/精準|精密|俐落/,["handmade"],"偏隨性手作"],[/優雅/,["loud","childish"],"偏浮誇或幼稚"]];
const ANTIKW=[[/冰冷|無菌|冷漠/,["cold","clinical"]],[/吵鬧|浮誇|刺眼|俗豔/,["loud","neon","flashy"]],[/廉價|單薄|粗劣/,["cheap","stock"]],[/幼稚/,["childish"]],[/陰鬱|沉重/,["dark"]],[/焦躁|焦慮/,["anxiety"]]];
const PAIRS=[["mt_still","mt_spring","error","「靜止」與「彈性活潑」是相反的動態風格，請擇一或說明各自場景。"],["mt_still","mt_glitch","error","「靜止」與「故障」互相矛盾。"],["mt_fade","mt_glitch","warn","柔和淡入與故障風格的性格相反。"],["mt_precise","mt_spring","warn","精準機械與彈性活潑方向相反，請定義各自用途。"],["gm_none","gm_shift","error","「無動態」與漸變位移互相矛盾。"],["gm_none","gm_fade","error","「無動態」與其他漸變動態同時選了。"],["gm_none","gm_hue","error","「無動態」與色標動畫同時選了。"],["gm_none","gm_breath","error","「無動態」與呼吸同時選了。"],["gm_none","gm_shimmer","error","「無動態」與微光掃過同時選了。"],["gm_none","gm_mesh","error","「無動態」與彌散漂浮同時選了。"],["ed_one","ed_cut","warn","一鏡到底與硬切互相矛盾。"],["rh_vslow","rh_fast","warn","極慢與快節奏方向相反，除非用『快慢對比』說明。"],["rh_slow","rh_fast","warn","慢與快節奏同時選了，請用『快慢對比』說明分段。"],["md_calm","md_vital","warn","寧靜與活力的氣氛相反。"],["md_calm","md_tense","warn","寧靜與緊張的氣氛相反。"],["lt_high","lt_low","warn","高調光與低調光方向相反，請定義各自場景。"],["us_none","us_click","error","「無聲」與其他介面聲音同時選了。"],["us_none","us_wood","error","「無聲」與其他介面聲音同時選了。"],["us_none","us_drop","error","「無聲」與其他介面聲音同時選了。"],["us_none","us_chime","error","「無聲」與其他介面聲音同時選了。"],["us_none","us_mech","error","「無聲」與其他介面聲音同時選了。"],["vo_none","vo_pro","error","「無旁白」與其他旁白類型同時選了。"],["vo_none","vo_friend","error","「無旁白」與其他旁白類型同時選了。"],["vo_none","vo_gentle","error","「無旁白」與其他旁白類型同時選了。"],["se_silence","se_amb","info","刻意靜默與環境聲同時選了，請說明何時靜默、何時有環境聲。"],["ms_amb","ms_house","warn","環境氛圍與 Deep House 方向相反。"],["ms_amb","ms_funk","warn","環境氛圍與 Funk／Groove 方向相反。"]];
const AVOIDMAT_MOTION=[["霓虹",["gm_hue","mt_glitch"]],["光暈",["gm_mesh"]],["廣告",[]]];
function checks(s){
  const out=[],A=(l,m)=>out.push({level:l,msg:m});const tags=selTags(s),T=t=>tags[t]||[],J2=a=>[...new Set(a)].join("、");const D=durations(s);
  CAT_KEYS.forEach(k=>{if(CAT[k].max<90&&count(k,s)>CAT[k].max)A("warn",`「${CAT[k].title.replace(/（.*/,"")}」選了 ${count(k,s)} 個，超過建議的 ${CAT[k].max} 個。`)});
  PAIRS.forEach(([a,b,l,m])=>{if(has(s,a)&&has(s,b))A(l,`「${anyName(a)}」＋「${anyName(b)}」：${m}`)});
  [["motionAvoid","動態禁區"],["avoidAV","影音禁區"]].forEach(([k,nm])=>{items(k,s).forEach(av=>{(av.conf||[]).forEach(c=>{if(has(s,c))A("error",`${nm}「${av.zh}」與你選的「${anyName(c)}」互相矛盾。`)})});if(count(k,s)>0&&count(k,s)<3)A("info",`${nm}建議至少 3 個。`)});
  // 減少動態與自動播放
  const anyMotion=s.motionStyle.some(x=>x!=="mt_still")||s.motionUse.length>0||s.gradMotion.some(x=>x!=="gm_none");
  const rp=picked(s,"reducedPolicy"),ap=picked(s,"autoplayPolicy");
  if(anyMotion&&!rp)A("error","有動態卻沒有『減少動態』政策。使用者開啟系統「減少動態」時必須有替代版本（漸變、紋理與形狀的動態尤其如此）。");
  const vest=[...items("motionUse",s),...items("gradMotion",s),...items("motionStyle",s),...items("shot",s)].filter(i=>i.vest);
  if(vest.length&&rp&&rp.id==="rm_short")A("warn",`${J2(vest.map(i=>i.zh))} 有前庭不適風險（視差、大位移、旋轉），『縮短但保留』不夠，建議移除或靜態化。`);
  const dist=picked(s,"distance");if(dist&&dist.id==="ds_large"&&(!rp||rp.id==="rm_short"))A("warn","大幅度位移搭配『縮短但保留』或沒有減少動態政策，風險較高。");
  const flashers=[...items("motionStyle",s),...items("gradMotion",s)].filter(i=>i.flash);
  if(flashers.length)A("warn",`${J2(flashers.map(i=>i.zh))} 可能產生閃爍：任何一秒內不可出現超過 3 次閃光（WCAG 2.3.1），且須提供安全版本；建議用 Photosensitive Epilepsy 分析工具檢測。`);
  const loopers=s.gradMotion.filter(x=>["gm_shift","gm_rotate","gm_breath","gm_shimmer","gm_mesh","sp_scroll","gm_loader","gm_hue","tx_flicker","tx_parallax"].includes(x));
  const gl=picked(s,"gradLoop");
  if(loopers.length){if(!gl)A("warn","選了會持續動的漸變／紋理／形狀動態，但還沒決定循環方式。");if(!picked(s,"gradProp"))A("info","選了漸變／紋理動態，但還沒決定動畫屬性（影響效能）。");if(!picked(s,"gradReduced"))A("warn","選了漸變／紋理動態，但還沒決定『減少動態』時顯示什麼。");
    if(gl&&["gl_slow"].includes(gl.id)&&(!ap||!["ap_ctrl","ap_muted"].includes(ap.id)))A("warn","漸變循環超過 5 秒且自動開始，須提供暫停、停止或隱藏的控制（WCAG 2.2.2）；請把自動播放政策設為『提供暫停控制』。");
    if(!ap)A("info","還沒決定自動播放政策。")}
  const heavy=[...items("gradMotion",s),...items("motionUse",s)].filter(i=>i.perf>=3);
  if(heavy.length)A("warn",`${J2(heavy.map(i=>i.zh))} 屬於較重的動態（大面積模糊、濾鏡或色標動畫）；請用瀏覽器開發工具實測幀率、重繪與電量，必要時改用預先渲染的影片或靜態圖。`);
  const gp=picked(s,"gradProp");if(gp&&["gp_prop","gp_filter"].includes(gp.id)&&s.gradMotion.some(x=>x!=="gm_none"))A("info",`漸變動畫屬性選了「${gp.zh}」，效能較重；若能改用透明度或位移較佳。`);
  if(has(s,"gm_mesh")&&gp&&gp.id==="gp_filter")A("warn","彌散漂浮加濾鏡動畫是最重的組合之一，不建議在行動裝置自動播放。");
  const gd=num(s,"gm_dur",NaN);if(isFinite(gd)&&loopers.length){if(gd<1&&(has(s,"gm_breath")||has(s,"gm_shimmer")||has(s,"gm_loader")))A("error",`動畫週期 ${gd} 秒，頻率超過每秒 1 次；明暗變化每秒超過 3 次會有閃爍風險，也會令人不適。`);else if(gd<4&&has(s,"gm_breath"))A("info","呼吸脈動的週期建議 4 秒以上，才會顯得平靜。");if(gd>5&&(!ap||ap.id==="ap_none"))A("info","動畫週期超過 5 秒；若自動循環，須有暫停控制。")}
  // 漸變對比
  const ac=animContrast(s);
  if(s.gradMotion.some(x=>x!=="gm_none")){if(!ac)A("info","選了漸變動態，但還沒填漸變色標與文字色，無法檢查動畫全程的對比。");else ac.forEach(r=>{if(r.ratio<4.5)A(r.ratio<3?"error":"warn",`${r.label}：文字色 ${hex(s.text.g_txt)} 與漸變的最差位置約 ${r.at}%（${r.color}）對比約 ${fr(r.ratio)}:1，一般文字需 4.5:1（大字 3:1）。動畫會經過這個位置，須縮小漸變幅度、加遮罩或讓文字避開。`)});if(has(s,"gm_hue")&&!altStops(s))A("info","選了色標動畫，但還沒填另一組終點色（gm_alt），無法檢查兩端與中間狀態的對比。")}
  // 動態用法
  if(s.motionUse.length<3&&anyMotion)A("info","動態用法建議至少定義 3 個（進場、退場、回饋）。");
  if(has(s,"mr_feedback")&&D.base&&D.base>400)A("warn",`動態任務包含回饋確認，但常用時長是 ${D.base}ms；回饋太慢會讓人懷疑是否按到。`);
  if(has(s,"mr_deco")&&s.motionRole.length===1)A("info","動態的任務只有『裝飾』；最容易被『減少動態』關掉，不可承載資訊。");
  if(has(s,"mu_parallax"))A("warn","視差是最常見的前庭不適來源，預設應關閉或提供開關，並遵循減少動態。");
  if(has(s,"mu_toast"))A("info","通知若自動消失，須給足夠時間閱讀或可保留（WCAG 2.2.1 時間調整）。");
  if(has(s,"mu_logo"))A("info","標誌動態不可阻擋進入，須可跳過，並先有靜態主標誌（減少動態時顯示靜態標誌）。");
  const sc=picked(s,"motionScale");if(sc&&sc.id==="ms_breath"&&s.motionUse.some(x=>["mu_hover","mu_press","mu_feedback"].includes(x)))A("warn","時長尺度是『呼吸』，但選了懸停、按壓或回饋；這些互動回饋應在約 100–250ms。");
  // 4A / 4B
  const a=s.s4a,b=s.s4b;
  if(a){if(a.logoStyle.some(x=>/動態標識/.test(x))&&!has(s,"mu_logo"))A("info","4A 的 Logo 風格有『動態標識』，但 4C 沒有定義標誌動態（mu_logo）。");
    a.avoid.forEach(v=>{if(/光暈|科技漸變/.test(v)&&(has(s,"gm_mesh")||has(s,"gm_hue")))A("warn",`4A 視覺禁區有「${v}」，但 4C 選了彌散漂浮或色標動畫。`);if(/霓虹|刺眼/.test(v)&&(has(s,"mt_glitch")||has(s,"lt_neon")))A("warn",`4A 視覺禁區有「${v}」，但 4C 選了故障風格或霓虹燈光。`);if(/過度濾鏡/.test(v)&&has(s,"mt_film"))A("info",`4A 視覺禁區有「${v}」，膠片節奏的顆粒與色偏須節制。`)});
    if(a.photo.some(x=>/低調戲劇/.test(x))&&(has(s,"lt_high")||has(s,"lt_soft")))A("warn","4A 的攝影風格是低調戲劇，但 4C 燈光選了高調光或柔光箱。");if(a.photo.some(x=>/高調明亮/.test(x))&&(has(s,"lt_low")||has(s,"lt_split")||has(s,"lt_rem")))A("warn","4A 的攝影風格是高調明亮，但 4C 燈光選了低調、分割或倫勃朗光。");
    if(a.photo.some(x=>/顆粒膠片/.test(x))&&!has(s,"mt_film")&&!has(s,"tx_flicker")&&s.motionStyle.length)A("info","4A 的攝影風格是顆粒膠片，動態風格可考慮與膠片節奏呼應。");
    if(a.colorStyle.some(x=>/霓虹/.test(x))&&has(s,"md_calm"))A("info","4A 色彩是霓虹暗色，但氣氛選了寧靜，請確認。")}
  if(b){const none=b.gradTypes.some(x=>/不使用漸變/.test(x));if(none&&s.gradMotion.some(x=>["gm_shift","gm_hue","gm_breath","gm_shimmer","gm_mesh","gm_rotate","gm_fade"].includes(x)))A("warn","4B 決定不使用漸變，但 4C 選了漸變動態。");
    if(b.texture.some(x=>/不使用紋理/.test(x))&&s.gradMotion.some(x=>["tx_flicker","tx_parallax"].includes(x)))A("warn","4B 決定不使用紋理，但 4C 選了紋理動態。");
    if(b.pattern.length===0&&has(s,"sp_scroll"))A("warn","4B 沒有 Pattern 母題，但 4C 選了圖案漂移。");
    b.avoid.forEach(v=>{if(/光暈/.test(v)&&(has(s,"gm_mesh")||s.gradMotion.includes("gm_rotate")))A("warn",`4B 表面禁區有「${v}」，但 4C 選了彌散漂浮或錐形旋轉。`)})}
  // Stage 1
  const q=s.s1;
  if(q){q.anti.forEach(x=>{const hit=J2((ANTI_TAG[x]||[]).flatMap(t=>T(t)));if(hit)A("warn",`Stage 1 要避免「${x}」，但你選的 ${hit} 容易帶來這種感覺。`)});
    q.dials.forEach(d=>{if(d.id==="quiet_bold"&&d.position<=-1&&(T("loud").length||T("bold").length||T("neon").length))A("warn",`Stage 1 傾向「低調克制」，但 ${J2([...T("loud"),...T("bold"),...T("neon")])} 偏張揚。`);if(d.id==="calm_energy"&&d.position<=-1&&T("energetic").length)A("warn",`Stage 1 傾向「療癒安靜」，但 ${J2(T("energetic"))} 偏有活力。`);if(d.id==="calm_energy"&&d.position>=1&&T("quiet").length>=6&&!T("energetic").length)A("info","Stage 1 傾向「活力推動」，但動態、節奏與聲音選擇幾乎都偏安靜。");if(d.id==="premium_access"&&d.position<=-1&&(T("cheap").length||T("stock").length))A("warn",`Stage 1 傾向「高端稀有」，但 ${J2([...T("cheap"),...T("stock")])} 容易顯廉價。`)})}
  else A("info","尚未匯入 Stage 1，無法做定位交叉檢查。");
  // Stage 2
  const m=s.s2;
  if(m){m.keywords.forEach(k=>KW_AVOID.forEach(([re,tg,msg])=>{if(re.test(k)){const hit=J2(tg.flatMap(t=>T(t)));if(hit)A("warn",`Stage 2 的關鍵字「${k}」，但 ${hit} ${msg}。`)}}));
    m.anti.forEach(k=>ANTIKW.forEach(([re,tg])=>{if(re.test(k)){const hit=J2(tg.flatMap(t=>T(t)));if(hit)A("warn",`Stage 2 的反關鍵字「${k}」，但 ${hit} 容易帶來這種感覺。`)}}));
    const mr=m.rules.motion||"";
    if(/靜止/.test(mr)&&s.motionStyle.some(x=>x!=="mt_still"))A("warn",`Stage 2 動態規則是「${mr}」，但 4C 動態風格不是靜止。`);
    if(/淡入/.test(mr)&&(has(s,"mt_spring")||has(s,"mt_glitch")))A("warn",`Stage 2 動態規則是「${mr}」，但 4C 選了彈性或故障風格。`);
    if(/精準線性/.test(mr)&&has(s,"mt_spring"))A("warn",`Stage 2 動態規則是「${mr}」，但 4C 選了彈性活潑。`);
    if(/彈性/.test(mr)&&has(s,"mt_still"))A("info",`Stage 2 動態規則是「${mr}」，但 4C 選了靜止。`);
    const sd=parseFloat(m.duration);if(isFinite(sd)&&sd>0&&D.base&&(D.base>sd*2||D.base<sd/2))A("info",`Stage 2 的動態時長是 ${m.duration}，4C 常用時長是 ${D.base}ms，相差超過一倍，請確認是否有意。`);
    const names=m.motionsound||[];const mapSnd={"無聲":["us_none"],"機械咔嗒":["us_mech"],"木質敲擊":["us_wood"],"水滴":["us_drop"],"風鈴／鐘聲":["us_chime"],"低頻嗡鳴":["us_hum"],"紙張翻動":["us_paper"],"輕柔環境音":["se_amb"]};
    if(names.includes("無聲")&&s.uiSound.some(x=>x!=="us_none"))A("warn","Stage 2 的聲音定調是『無聲』，但 4C 選了介面音效。");
    const snd=names.filter(n=>n!=="無聲").flatMap(n=>mapSnd[n]||[]);if(snd.length&&s.uiSound.length&&!s.uiSound.some(x=>snd.includes(x))&&!s.uiSound.includes("us_none"))A("info",`Stage 2 的聲音定調是「${names.join("、")}」，但 4C 的介面音效是「${labels("uiSound",s).join("、")}」。`);
    if(m.keywords.some(k=>/木|溫潤|溫暖/.test(k))&&has(s,"tb_metal"))A("info","Stage 2 偏溫暖，但音色選了金屬閃亮。")}
  else A("info","尚未匯入 Stage 2，無法做感官交叉檢查。");
  // Stage 3
  const v=s.s3;
  if(v){const D3=v.dials,pers=v.personality.join("｜");
    if(D3.formal_casual<=-1&&(has(s,"vo_young")||has(s,"vo_friend")))A("warn","Stage 3 語氣偏正式，但旁白選了年輕活潑或親切朋友感。");
    if(D3.formal_casual>=1&&has(s,"vo_auth"))A("warn","Stage 3 語氣偏隨和，但旁白選了權威沉穩。");
    if(D3.serious_funny<=-1&&(has(s,"mt_spring")||has(s,"md_play")))A("warn","Stage 3 語氣偏嚴肅，但 4C 選了彈性活潑或俏皮氣氛。");
    if(D3.enth_fact<=-1&&has(s,"vo_gentle"))A("info","Stage 3 語氣偏熱情洋溢，但旁白選了溫柔療癒。");
    if(/專業|嚴謹|可靠/.test(pers)&&(T("childish").length))A("warn",`Stage 3 的說話性格有專業或嚴謹，但 ${J2(T("childish"))} 偏孩子氣。`);
    const sc=v.script;if(/廣東話|口語/.test(sc)&&!has(s,"vl_yue")&&s.voiceLang.length)A("info",`Stage 3 書寫語言是「${sc}」，但旁白語言沒有廣東話。`);
    if(/英文為主/.test(sc)&&!has(s,"vl_en")&&s.voiceLang.length)A("warn",`Stage 3 書寫語言是「${sc}」，但旁白語言沒有英語。`);
    if(/對照|夾雜/.test(sc)&&s.voiceLang.length<2&&!has(s,"vo_bi"))A("info",`Stage 3 書寫語言是「${sc}」；影片字幕與旁白如何對照，請明確。`);
    if(/書面/.test(sc)&&has(s,"vl_yue")&&!/字幕/.test(T_(s,"st_note")))A("info","Stage 3 是書面語，旁白用廣東話時，字幕是否用書面語或口語須決定。")}
  else A("info","尚未匯入 Stage 3，無法做語氣交叉檢查。");
  // Stage 0
  const z=s.s0;
  if(z){if(z.claims&&(has(s,"ss_client")||has(s,"ss_contrast")||has(s,"md_heal")))A("warn","業務涉及健康或效果宣稱：客人見證、前後對比與『治癒』類內容屬高風險；須書面同意、肖像授權並核對廣告規定（不是法律意見）。");
    const costly=[...flat0(s)].filter(i=>i.cost>=3);if(/1 萬以下/.test(z.budget)&&costly.length)A("warn",`Stage 0 品牌預算低於 1 萬港元，但選了成本等級偏高的項目（${J2(costly.map(i=>i.zh))}）。`);
    if(/平價/.test(z.priceTier)&&costly.some(i=>i.cost>=4))A("warn",`Stage 0 價格定位是『平價』，但選了成本等級最高的項目（${J2(costly.filter(i=>i.cost>=4).map(i=>i.zh))}）。`);
    if(z.markets.some(x=>/大灣區|內地/.test(x))&&s.voiceLang.length&&!has(s,"vl_cmn"))A("info","Stage 0 市場包含大灣區／內地，但旁白語言沒有普通話。");
    if(z.delivery.some(x=>/視像|雲端|網站/.test(x))&&!s.uiSound.length&&!picked(s,"uiSoundPolicy"))A("info","Stage 0 有線上或數碼交付：介面聲音政策（預設無聲或可開啟）建議明確。")}
  // 影片與字幕
  const hasVoice=s.voice.length&&!s.voice.every(x=>x==="vo_none"),cs=picked(s,"capStyle");
  if(hasVoice&&(!cs||cs.id==="cap_none"))A("error","影片有人聲旁白，但沒有字幕（預錄影片的人聲須提供字幕；同時社群多為靜音觀看）。");
  if(cs&&cs.id!=="cap_none"&&!picked(s,"capContrast"))A("warn","有字幕，但還沒決定可讀性（底框或描邊；文字對底板需 4.5:1）。");
  if(has(s,"vf_916")&&cs&&(cs.id==="cap_burn"||cs.id==="cap_both"))A("info","直式 9:16 影片的燒錄字幕要避開底部約 35% 與頂部約 14%（公開指南的常見做法，各平台不同，須查最新說明）。");
  if(has(s,"vf_bg")){if(hasVoice||s.musicStyle.length)A("warn","網站背景影片應預設無聲；有旁白或音樂會違反『自動播放不應有聲音』的常見做法。");if(!ap||ap.id==="ap_none"||ap.id==="ap_short")A("info","網站背景影片通常循環，建議自動播放政策選『無聲背景影片＋暫停鍵＋靜態首幀』。")}
  if(!hasVoice&&!cs&&s.videoStyle.length&&!picked(s,"audioDesc"))A("info","影片沒有旁白也沒有字幕；若有只能靠畫面理解的資訊，須有文字稿或說明。");
  if(s.videoStyle.length&&!s.videoFormat.length)A("info","選了影片風格，但還沒選影片格式（比例與用途）。");
  if(s.videoStyle.length&&!picked(s,"hookRule")&&(has(s,"vf_916")||has(s,"vf_bump")||has(s,"vf_ad")))A("info","短影片與廣告的開頭很關鍵，建議決定『開頭 3 秒規則』。");
  if(has(s,"vf_bump")&&num(s,"v_len",6)>6)A("info","你選了約 6 秒的短廣告，但影片長度欄位大於 6 秒。");
  if(has(s,"vf_916")&&s.shot.some(x=>["sh_hand","sh_whip","sh_orbit"].includes(x)))A("info","手機直式小畫面看手持、急搖與環繞特別容易暈眩，請限制長度。");
  // 節奏換算
  const pc=pace(s);
  if(pc){const rs=s.rhythm;if(rs.includes("rh_slow")&&(pc.bpm<60||pc.bpm>90))A("warn",`節奏選了『慢（60–90 BPM）』，但 BPM 欄位是 ${pc.bpm}。`);if(rs.includes("rh_mid")&&(pc.bpm<100||pc.bpm>130))A("warn",`節奏選了『中（100–130 BPM）』，但 BPM 欄位是 ${pc.bpm}。`);if(rs.includes("rh_fast")&&pc.bpm<130)A("warn",`節奏選了『快（130+ BPM）』，但 BPM 欄位是 ${pc.bpm}。`);
    if(pc.sec<.5&&(T("quiet").length>=3))A("warn",`每 ${pc.beats} 拍剪一次，約 ${pc.sec.toFixed(2)} 秒就剪一刀，與安靜的選擇不協調。`);if(pc.sec<.34)A("warn",`剪接間隔約 ${pc.sec.toFixed(2)} 秒（每秒超過 3 次畫面切換），高對比畫面快速切換有閃爍風險。`);
    if(pc.frames!=null&&!pc.whole)A("info",`剪接點約 ${pc.frames.toFixed(2)} 幀，不在整幀上，剪接軟件會四捨五入，累積會與音樂漸漸對不上；可改拍數或幀率（${pc.fps} fps）。`)}
  if(has(s,"ed_beat")&&!pc)A("info","選了對拍音樂節拍，但還沒填 BPM 與每次剪接的拍數，無法換算剪接點。");
  // 聲音與授權
  const music=s.musicStyle.length>0;
  if((music||hasVoice||s.soundEl.length)&&!picked(s,"loudness"))A("info","有音樂或旁白，但還沒決定響度目標（LUFS）。各平台標準不同，須查最新說明。");
  if(picked(s,"loudness")&&picked(s,"loudness").id==="ld_pending")A("warn","響度目標待確認；確認前不可發布。");
  if((music||has(s,"se_logo")||has(s,"se_palette"))&&!s.licenseSrc.length)A("warn","有音樂或品牌聲音，但還沒決定來源與授權。音樂授權（媒體、地區、期限、商用與廣告）須書面確認。");
  const lp=picked(s,"licensePolicy");if(lp&&lp.id==="lp_pending")A("warn","授權保存與核准尚未建立；建立前不可商用發布。");if(!lp&&s.licenseSrc.length)A("info","已選聲音來源，但還沒決定授權保存與核准方式。");
  if(has(s,"ls_platform")&&(has(s,"vf_ad")||has(s,"vf_bump")))A("warn","平台內建音樂庫通常只限該平台的非商業或個人帳號使用，用於廣告前須核對條款。");
  if(has(s,"ls_ai"))A("warn","AI 生成音樂：須確認工具條款、可否商用、是否須披露，以及能否註冊為音訊標誌；僅建議作草稿。");
  if(has(s,"ls_cc"))A("info","免版稅或 CC 素材須核對署名、商用與改作條件，並保存來源證明。");
  if(has(s,"ls_pop")&&s.s0&&/1 萬以下|1–5 萬/.test(s.s0.budget))A("warn","現成流行音樂授權費高且複雜，與 Stage 0 的預算不符。");
  if(has(s,"vo_ai")){A("warn","AI 合成人聲須披露，並確認工具條款、授權與聲音權；發音與語氣須人類審核。");if(has(s,"ss_client"))A("error","AI 合成人聲不可用於客人見證。")}
  if(has(s,"se_logo")){const al=picked(s,"audioLogoLen"),alen=num(s,"a_len",NaN);if(!al||al.id==="al_none")A("info","選了音訊標誌，但沒決定長度規則。");if(al&&al.id==="al_mid"&&isFinite(alen)&&(alen<2||alen>5))A("warn",`音訊標誌規則是 2–5 秒，但長度欄位是 ${alen} 秒。`);if(al&&al.id==="al_short"&&isFinite(alen)&&alen>2)A("warn",`音訊標誌規則是 1–2 秒，但長度欄位是 ${alen} 秒。`);A("info","音訊標誌須有靜音版本，不可自動播放，並建議先確認可否註冊與授權（專業人士判斷）。")}
  const up=picked(s,"uiSoundPolicy");if(up&&up.id==="up_none"&&s.uiSound.some(x=>x!=="us_none"))A("warn","介面聲音政策是『預設無聲』，但選了介面音效；請改為『可由使用者開啟』並說明。");
  if(has(s,"se_ui")&&!s.uiSound.length)A("info","選了 UI 提示音，但還沒選音效類型。");
  if(s.uiSound.some(x=>x!=="us_none"))A("info","介面聲音不可是唯一的回饋，且不可自動播放；錯誤音不可刺耳。");
  if(s.instrument.includes("in_brass")&&T("quiet").length>=4)A("info","銅管偏莊重有力，與其他安靜的選擇不同，請確認。");
  if(has(s,"tb_bright")&&has(s,"md_calm"))A("info","明亮清脆的音色搭配寧靜氣氛，高頻可能刺耳。");
  if(s.musicStyle.length&&!s.rhythm.length)A("info","選了音樂風格，但還沒選節奏。");
  const costs=[...flat0(s)].filter(i=>i.cost>=3);if(costs.length>=4)A("info","同時選了 4 項以上成本偏高的項目，請先做小量樣片確認可行性。");
  if(has(s,"an_3d"))A("info","3D CGI 動畫的造型、材質與渲染規格在 4D 深化。");
  return out}
function flat0(s){const o=[];["videoStyle","animStyle","shot","lighting","soundEl","editStyle","musicStyle","motionStyle"].forEach(k=>items(k,s).forEach(i=>{if(i.cost)o.push(i)}));return o}

// ---------- 輸出 ----------
function draft(s){const L=(k,n)=>labels(k,s).slice(0,n).join("、")||"［尚未選擇］";const P=d=>{const o=picked(s,d);return o?o.zh:"［未定］"};
  return `${brandName(s)} 的動態、聲音與影片：動態「${L("motionStyle",2)}」（${P("easeStyle")}、${P("motionScale")}），減少動態「${P("reducedPolicy")}」；影片「${L("videoStyle",2)}」、運鏡「${L("shot",2)}」、氣氛「${L("mood",2)}」；音樂「${L("musicStyle",2)}」、旁白「${L("voice",1)}」、節奏「${L("rhythm",1)}」。${count("motionAvoid",s)+count("avoidAV",s)?"禁區："+[...labels("motionAvoid",s),...labels("avoidAV",s)].slice(0,4).join("、")+"。":""}`}
function negatives(s){const n=[...labels("motionAvoid",s),...labels("avoidAV",s)];if(s.s1)n.push(...s.s1.anti);if(s.s2)n.push(...s.s2.anti);if(s.s4a)n.push(...s.s4a.avoid);if(s.s4b)n.push(...s.s4b.avoid);return [...new Set(n)]}
function motionSpec(s){const rp=picked(s,"reducedPolicy"),ap=picked(s,"autoplayPolicy"),d=durations(s);
  return {schema:"headx.motion-spec/v1",status:"draft",note:"時長、緩動、效能等級為常見起點與一般經驗，須實看與實測。",brand:brandName(s),styles:labels("motionStyle",s),roles:labels("motionRole",s),tokens:tokensOf(s),durations_ms:d,easing_bezier:bezierOf(s),
   reduced_motion:{policy:rp?rp.zh:null,css:reducedCSS(s)},autoplay:ap?ap.zh:null,uses:useRows(s),
   gradient_texture_shape_motion:{items:items("gradMotion",s).map(i=>({id:i.id,name:i.zh,performance:PERF[i.perf]||"—",flash_risk:i.flash,vestibular_risk:i.vest})),property:(picked(s,"gradProp")||{}).zh||null,loop:(picked(s,"gradLoop")||{}).zh||null,period_s:num(s,"gm_dur",null),reduced_version:(picked(s,"gradReduced")||{}).zh||null,contrast_scan:animContrast(s)&&animContrast(s).map(r=>({state:r.label,worst_at_pct:r.at,worst_color:r.color,contrast:Math.floor(r.ratio*100)/100}))},approval:{state:"draft",approved_by:null}}}
function videoSpec(s){const fmt=items("videoFormat",s),cs=picked(s,"capStyle");
  return {schema:"headx.video-spec/v1",status:"draft",note:"畫面比例與安全區為公開指南的常見做法，各平台與年份不同，須以最新平台說明為準。",brand:brandName(s),styles:labels("videoStyle",s),stories:labels("storyStyle",s),animation:labels("animStyle",s),
   formats:fmt.map(f=>({id:f.id,name:f.zh,width:f.n1||null,height:f.n2||null,note:f.note||null})),length_s:num(s,"v_len",null),fps:num(s,"v_fps",null),hook:(picked(s,"hookRule")||{}).zh||null,
   camera:{moves:labels("shot",s),composition:labels("composition",s),lighting:labels("lighting",s),mood:labels("mood",s)},editing:{style:labels("editStyle",s),rhythm:labels("rhythm",s),bpm:num(s,"v_bpm",null),beats_per_cut:num(s,"v_beats",null),pace:pace(s)},performance:labels("perform",s),
   captions:{style:cs?cs.zh:null,contrast:(picked(s,"capContrast")||{}).zh||null,description:(picked(s,"audioDesc")||{}).zh||null},storyboard:TOUCH.map(([id,l])=>({frame:l,text:T_(s,id)||null})),avoid:labels("avoidAV",s),approval:{state:"draft",approved_by:null}}}
function soundSpec(s){return {schema:"headx.sound-spec/v1",status:"draft",note:"聲音設計（作曲、錄音、混音）須由專業人士完成；響度目標隨平台不同；授權須書面確認。",brand:brandName(s),elements:labels("soundEl",s),music:labels("musicStyle",s),instruments:labels("instrument",s),timbre:labels("timbre",s),
   voice:{type:labels("voice",s),language:labels("voiceLang",s),sample_line:T_(s,"vo_line")||null},ui_sounds:{policy:(picked(s,"uiSoundPolicy")||{}).zh||null,types:labels("uiSound",s)},silence:(picked(s,"silence")||{}).zh||null,
   audio_logo:{rule:(picked(s,"audioLogoLen")||{}).zh||null,length_s:num(s,"a_len",null),notes:T_(s,"a_key")||null},loudness:(picked(s,"loudness")||{}).zh||null,licensing:{sources:labels("licenseSrc",s),policy:(picked(s,"licensePolicy")||{}).zh||null,notes:T_(s,"st_note")||null},avoid:labels("avoidAV",s),approval:{state:"draft",approved_by:null}}}
function videoPrompt(s){const L=k=>labels(k,s).join(", ")||"unspecified",P=d=>{const o=picked(s,d);return o?o.zh:"unspecified"};const neg=negatives(s).join(", ")||"none specified";const a=s.s4a;
  return `Create a ${num(s,"v_len",15)}-second ${L("videoFormat")} video for the brand "${brandName(s)}".\nStyle: ${L("videoStyle")}; story: ${L("storyStyle")}; animation: ${L("animStyle")}.\nCamera: ${L("shot")}; composition: ${L("composition")}; lighting: ${L("lighting")}; mood: ${L("mood")}; performance: ${L("perform")}.\nEditing: ${L("editStyle")}; rhythm: ${L("rhythm")}${isFinite(num(s,"v_bpm",NaN))?" ("+num(s,"v_bpm")+" BPM)":""}; frame rate ${num(s,"v_fps",25)} fps; hook: ${P("hookRule")}.\nMotion language: ${L("motionStyle")}; easing ${P("easeStyle")}; durations ${P("motionScale")}.\n${a?"Visual language (4A): "+(a.statement||"")+"\n":""}Captions: ${P("capStyle")} (keep inside safe zones; high-contrast).\nStoryboard:\n1) ${T_(s,"sb1")||"opening: unspecified"}\n2) ${T_(s,"sb2")||"middle: unspecified"}\n3) ${T_(s,"sb3")||"closing: unspecified"}\nNegative constraints (must NOT appear): ${neg}. No flashing faster than 3 times per second. No fake logos, no gibberish text, no watermarks.\nNote: concept only; people, music and AI-generated assets require consent, licensing and disclosure review before use.`}
function audioPrompt(s){const L=k=>labels(k,s).join(", ")||"unspecified",P=d=>{const o=picked(s,d);return o?o.zh:"unspecified"};
  return `Compose a ${num(s,"a_len",30)}-second sound piece for the brand "${brandName(s)}".\nMusic style: ${L("musicStyle")}; instruments: ${L("instrument")}; timbre: ${L("timbre")}; rhythm: ${L("rhythm")}${isFinite(num(s,"v_bpm",NaN))?" ("+num(s,"v_bpm")+" BPM)":""}.\nMood: ${L("mood")}. Silence: ${P("silence")}. Brand sound elements: ${L("soundEl")}. Audio logo: ${P("audioLogoLen")}${T_(s,"a_key")?" ("+T_(s,"a_key")+")":""}.\nVoice: ${L("voice")} in ${L("voiceLang")}. Sample line: ${T_(s,"vo_line")||"unspecified"}.\nUI sounds: ${L("uiSound")} (policy: ${P("uiSoundPolicy")}).\nMix target: ${P("loudness")}.\nMust NOT include: ${labels("avoidAV",s).join(", ")||"none specified"}. No sudden loud sounds; speech must remain intelligible over music.\nNote: concept brief only; sound design must be done by a qualified professional, and licensing/AI disclosure must be confirmed.`}
function storyboardMD(s){return `# ${brandName(s)} · 影片分鏡（3 格靜態）\n\n| 格 | 內容 |\n|---|---|\n${TOUCH.map(([id,l])=>`| ${l} | ${T_(s,id)||"（未填）"} |`).join("\n")}\n\n格式：${labels("videoFormat",s).join("、")||"（未選）"}｜長度：${T_(s,"v_len")||"?"} 秒｜幀率：${T_(s,"v_fps")||"?"} fps｜字幕：${(picked(s,"capStyle")||{zh:"（未定）"}).zh}`}
function buildGuide(s){const L=k=>labels(k,s),P=d=>{const o=picked(s,d);return o?`${o.zh}（${o.desc}）`:"（未定義）"};const md=[],H=t=>md.push("\n## "+t+"\n");
  md.push(`# ${brandName(s)} · 動態、聲音與影片指南（motion-sound-video-guide）`);md.push(`\n> ${T_(s,"statement")||draft(s)}\n`);md.push("> 草稿，不等於核准。時長與緩動是起點；響度與平台規格以最新說明為準；聲音設計與影片製作須由專業人士完成；授權須書面確認。");
  H("1. 動態");md.push(`風格：${L("motionStyle").join("、")||"（未選）"}\n\n任務：${L("motionRole").join("、")||"（未選）"}\n\n緩動：${P("easeStyle")}\n\n時長：${P("motionScale")}\n\n編排：${P("choreo")}\n\n位移：${P("distance")}\n\n**減少動態：${P("reducedPolicy")}**\n\n自動播放：${P("autoplayPolicy")}`);
  const ur=useRows(s);md.push(ur.length?"\n| 用法 | 時長 | 緩動 | 位移 | 前庭風險 | 減少動態版本 |\n|---|---|---|---|---|---|\n"+ur.map(r=>`| ${r.name} | ${r.duration_ms}ms${r.loop?"（循環）":""} | ${r.easing_token||"—"} | ${r.distance||"—"} | ${r.vestibular?"有":"—"} | ${r.reduced||"—"} |`).join("\n"):"");
  H("2. 漸變、紋理與形狀的動態");md.push(`項目：${L("gradMotion").join("、")||"（未選）"}\n\n屬性：${P("gradProp")}\n\n循環：${P("gradLoop")}\n\n週期：${T_(s,"gm_dur")||"?"} 秒\n\n減少動態：${P("gradReduced")}`);const ac=animContrast(s);if(ac)md.push("\n| 狀態 | 最差位置 | 對比 |\n|---|---|---|\n"+ac.map(r=>`| ${r.label} | ${r.at}%（${r.color}） | ${fr(r.ratio)}:1 |`).join("\n"));
  H("3. 影片");md.push(`風格：${L("videoStyle").join("、")||"（未選）"}\n\n故事：${L("storyStyle").join("、")||"（未選）"}\n\n動畫：${L("animStyle").join("、")||"（未選）"}\n\n格式：${L("videoFormat").join("、")||"（未選）"}\n\n開頭：${P("hookRule")}`);
  H("4. 鏡頭語言");md.push(`運鏡：${L("shot").join("、")||"（未選）"}\n\n構圖：${L("composition").join("、")||"（未選）"}\n\n燈光：${L("lighting").join("、")||"（未選）"}\n\n氣氛：${L("mood").join("、")||"（未選）"}\n\n表演與服裝：${L("perform").join("、")||"（未選）"}`);
  H("5. 剪接與節奏");md.push(`剪接：${L("editStyle").join("、")||"（未選）"}\n\n節奏：${L("rhythm").join("、")||"（未選）"}`);const pc=pace(s);if(pc)md.push(`\nBPM ${pc.bpm}，每 ${pc.beats} 拍剪一次 ＝ ${pc.sec.toFixed(2)} 秒${pc.frames!=null?`（${pc.frames.toFixed(2)} 幀 @ ${pc.fps} fps）`:""}${pc.cuts!=null?`；${pc.len} 秒約 ${pc.cuts} 刀`:""}`);
  H("6. 字幕與無障礙");md.push(`字幕：${P("capStyle")}\n\n可讀性：${P("capContrast")}\n\n視覺說明：${P("audioDesc")}`);
  H("7. 聲音");md.push(`元素：${L("soundEl").join("、")||"（未選）"}\n\n音樂：${L("musicStyle").join("、")||"（未選）"}\n\n樂器：${L("instrument").join("、")||"（未選）"}\n\n音色：${L("timbre").join("、")||"（未選）"}\n\n旁白：${L("voice").join("、")||"（未選）"}（${L("voiceLang").join("、")||"語言未選"}）\n\n介面音效：${L("uiSound").join("、")||"（未選）"}（${P("uiSoundPolicy")}）\n\n靜默：${P("silence")}\n\n音訊標誌：${P("audioLogoLen")}\n\n響度：${P("loudness")}`);
  H("8. 授權");md.push(`來源：${L("licenseSrc").join("、")||"（未選）"}\n\n管理：${P("licensePolicy")}\n\n備註：${T_(s,"st_note")||"（無）"}`);
  H("9. 禁區");md.push(negatives(s).map(x=>"- "+x).join("\n")||"（未定義）");return md.join("\n")}
function buildSystem(s){const L=k=>labels(k,s).join("、")||"（未定義）",P=d=>{const o=picked(s,d);return o?o.zh:"（未定義）"};
  return `你是「${brandName(s)}」的動態、聲音與影片設計 Agent。所有動畫規格、影片分鏡、剪接、旁白、音樂與音效提案，以及生成影片與音訊的提示詞，必須遵守以下規範。\n${s.s4a&&s.s4a.statement?"視覺語言（4A）："+s.s4a.statement+"\n":""}${s.s4b&&s.s4b.statement?"表面系統（4B）："+s.s4b.statement+"\n":""}${s.s3&&s.s3.statement?"語氣："+s.s3.statement+"\n":""}\n【一句話】${T_(s,"statement")||draft(s)}\n【動態】風格 ${L("motionStyle")}；緩動 ${P("easeStyle")}；時長 ${P("motionScale")}；編排 ${P("choreo")}；位移 ${P("distance")}；減少動態 ${P("reducedPolicy")}；自動播放 ${P("autoplayPolicy")}\n【漸變／紋理／形狀動態】${L("gradMotion")}；屬性 ${P("gradProp")}；循環 ${P("gradLoop")}；減少動態 ${P("gradReduced")}\n【影片】${L("videoStyle")}；故事 ${L("storyStyle")}；格式 ${L("videoFormat")}；運鏡 ${L("shot")}；構圖 ${L("composition")}；燈光 ${L("lighting")}；氣氛 ${L("mood")}；剪接 ${L("editStyle")}；節奏 ${L("rhythm")}\n【字幕】${P("capStyle")}；${P("capContrast")}\n【聲音】音樂 ${L("musicStyle")}；樂器 ${L("instrument")}；音色 ${L("timbre")}；旁白 ${L("voice")}（${L("voiceLang")}）；介面音效 ${L("uiSound")}；響度 ${P("loudness")}；授權 ${L("licenseSrc")}\n\n【絕對禁止】${negatives(s).join("、")||"（未定義）"}\n\n【工作規則】\n1) 任何動態都必須附『減少動態』版本；循環或自動播放超過 5 秒的動態須有暫停、停止或隱藏控制。\n2) 任何一秒內不得出現超過 3 次閃光；大面積高對比快速切換須避免。\n3) 文字壓在漸變、影片或照片上，須列出動畫全程最差位置的對比比值；低於 4.5:1（大字 3:1）須調整。\n4) 有人聲的影片必須有字幕；字幕須避開平台安全區並有足夠對比。\n5) 不可自動播放有聲音；響度目標與平台規格以最新平台說明為準，不可編造。\n6) 音樂、人聲、肖像與 AI 生成素材須先確認授權與披露；AI 合成人聲不可用於客人見證；健康與效果相關的見證與前後對比須先經人類合規審核。\n7) 時長、緩動與效能等級只是起點，須實測；聲音設計與影片製作須交由專業人士完成。\n8) 遇到規範沒有涵蓋或互相衝突的情況，請回報人類，不要自行決定。\n9) 所有輸出標示為『AI 提案，待人類核准』。`}
function hints(s){const H=[],A=(st,f,t,w)=>H.push({stage:st,field:f,text:t,why:w});const L=k=>labels(k,s).join("、");
  if(has(s,"an_3d")||has(s,"mt_phys")||has(s,"sh_orbit"))A("4D 3D 與產品視覺","3D 動畫與運鏡","把 3D 動畫、轉盤與環繞運鏡轉為造型、材質、光照與渲染規格","已選："+[L("animStyle"),L("shot")].filter(Boolean).join("｜"));
  A("4E UI／UX 與空間體驗","互動動態","把動態用法清單（進場、懸停、載入、回饋）轉為元件狀態規範，並測試鍵盤、螢幕閱讀器與減少動態","動態用法："+(L("motionUse")||"未選"));
  if(s.uiSound.length||has(s,"se_ui"))A("4E UI／UX 與空間體驗","介面聲音","決定聲音與觸覺回饋的觸發情境、音量上限與關閉方式","介面音效："+L("uiSound"));
  if(s.s0&&s.s0.delivery.some(x=>/店|診所|現場/.test(x)))A("4E UI／UX 與空間體驗","空間聲音與燈光","把音樂、環境聲與燈光轉為空間的照明、聲學與背景音樂規格","Stage 0 有實體交付");
  A("4F 行銷內容與廣告","影片內容","把影片風格、開頭規則、字幕與格式轉為社群、廣告與直播的內容模板與實驗","影片格式："+(L("videoFormat")||"未選"));
  A("4G 跨媒體使用與治理","授權與核准","登記音樂、旁白、肖像與 AI 素材的授權範圍、期限、地區與核准者；建立減少動態與字幕的審稿清單","聲音與影片授權");
  A("4H 風格庫與 AI 生成契約","風格庫","把動態 token、影片 Prompt、音訊 Prompt 與負面約束存成可重用條目，並標示授權與披露要求","供 AI 生成使用");
  return H}
function completeness(s){const pace0=T_(s,"sb1")&&T_(s,"sb2")&&T_(s,"sb3");const c=[
  ["motion","動態風格與任務",count("motionStyle",s)>=1&&count("motionRole",s)>=1],["tokens","緩動、時長、編排、位移",["easeStyle","motionScale","choreo","distance"].every(d=>picked(s,d))],
  ["reduced","減少動態與自動播放政策",!!picked(s,"reducedPolicy")&&!!picked(s,"autoplayPolicy")],["uses","動態用法（至少 3 個）",count("motionUse",s)>=3],
  ["gradMotion","漸變／紋理／形狀動態（或選無動態）",count("gradMotion",s)>=1&&(s.gradMotion.every(x=>x==="gm_none")||(!!picked(s,"gradProp")&&!!picked(s,"gradLoop")&&!!picked(s,"gradReduced")))],
  ["video","影片風格、故事與格式",count("videoStyle",s)>=1&&count("storyStyle",s)>=1&&count("videoFormat",s)>=1],["camera","運鏡、構圖、燈光與氣氛",["shot","composition","lighting","mood"].every(k=>count(k,s)>=1)],
  ["edit","剪接、節奏、表演與開頭規則",count("editStyle",s)>=1&&count("rhythm",s)>=1&&count("perform",s)>=1&&!!picked(s,"hookRule")],["captions","字幕、可讀性與視覺說明",["capStyle","capContrast","audioDesc"].every(d=>picked(s,d))],
  ["sound","聲音元素、音樂、樂器與音色",count("soundEl",s)>=1&&count("musicStyle",s)>=1&&count("instrument",s)>=1&&count("timbre",s)>=1],["voice","旁白、語言與介面音效政策",count("voice",s)>=1&&count("voiceLang",s)>=1&&!!picked(s,"uiSoundPolicy")],
  ["mix","靜默、音訊標誌與響度",["silence","audioLogoLen","loudness"].every(d=>picked(s,d))],["license","聲音來源與授權管理",count("licenseSrc",s)>=1&&!!picked(s,"licensePolicy")],
  ["avoid","動態與影音禁區（各至少 3 個）",count("motionAvoid",s)>=3&&count("avoidAV",s)>=3],["board","3 格分鏡",!!pace0]];
  const done=c.filter(x=>x[2]).length;return {done,total:c.length,pct:Math.round(done/c.length*100),missing:c.filter(x=>!x[2]).map(x=>({key:x[0],label:x[1]}))}}
function buildBrief(s){const c=completeness(s),pk=k=>items(k,s).map(i=>({id:i.id,name:i.zh,note:i.desc}));const dm={};DIMS.forEach(d=>{const o=picked(s,d.id);if(o)dm[d.id]={id:o.id,name:o.zh,note:o.desc}});const tx={};TEXTS.forEach(t=>{if(T_(s,t.id))tx[t.id]=T_(s,t.id)});
  return {schema:"brand/stage4c-motion-sound-video/v1",status:c.missing.length?"incomplete":"complete",completeness:c.pct,missing:c.missing,approval:{state:"draft",approved_by:null,note:"草稿；AI 提案與表單填寫不等於人類核准；聲音設計、影片製作與授權須由專業人士與人類確認。"},
   stage_context:{stage0:s.s0||null,stage1:s.s1||null,stage2:s.s2||null,stage3:s.s3||null,stage4a:s.s4a||null,stage4b:s.s4b||null},brand_name:brandName(s),
   motion:{styles:pk("motionStyle"),roles:pk("motionRole"),easing:dm.easeStyle||null,durations:dm.motionScale||null,choreography:dm.choreo||null,distance:dm.distance||null,reduced_motion:dm.reducedPolicy||null,autoplay:dm.autoplayPolicy||null,uses:pk("motionUse"),use_table:useRows(s),custom:{bezier:tx.m_bez||null,stagger_ms:tx.m_stag||null}},
   gradient_texture_shape_motion:{items:pk("gradMotion"),property:dm.gradProp||null,loop:dm.gradLoop||null,reduced_version:dm.gradReduced||null,period_s:tx.gm_dur||null,spec:{a:tx.g_a||null,b:tx.g_b||null,c:tx.g_c||null,mid:tx.g_mid||null,angle:tx.g_angle||null,text_color:tx.g_txt||null,alt_a:tx.gm_alt||null,alt_b:tx.gm_alt2||null},contrast_scan:animContrast(s)&&animContrast(s).map(r=>({state:r.label,worst_at_pct:r.at,worst_color:r.color,contrast:Math.floor(r.ratio*100)/100}))},
   video:{styles:pk("videoStyle"),stories:pk("storyStyle"),animation:pk("animStyle"),formats:pk("videoFormat"),hook:dm.hookRule||null,length_s:tx.v_len||null,fps:tx.v_fps||null,camera:{moves:pk("shot"),composition:pk("composition"),lighting:pk("lighting"),mood:pk("mood")},editing:{style:pk("editStyle"),rhythm:pk("rhythm"),bpm:tx.v_bpm||null,beats_per_cut:tx.v_beats||null,pace:pace(s)},performance:pk("perform"),captions:{style:dm.capStyle||null,contrast:dm.capContrast||null,description:dm.audioDesc||null},storyboard:{frame1:tx.sb1||null,frame2:tx.sb2||null,frame3:tx.sb3||null}},
   sound:{elements:pk("soundEl"),music:pk("musicStyle"),instruments:pk("instrument"),timbre:pk("timbre"),voice:{types:pk("voice"),languages:pk("voiceLang"),sample_line:tx.vo_line||null},ui_sounds:{types:pk("uiSound"),policy:dm.uiSoundPolicy||null},silence:dm.silence||null,audio_logo:{rule:dm.audioLogoLen||null,length_s:tx.a_len||null,notes:tx.a_key||null},loudness:dm.loudness||null,licensing:{sources:pk("licenseSrc"),policy:dm.licensePolicy||null}},
   avoid:{motion:pk("motionAvoid"),audio_video:pk("avoidAV")},combined_negatives:negatives(s),notes:tx.st_note||null,
   statement:{text:T_(s,"statement")||draft(s),source:T_(s,"statement")?"human":"auto-draft"},motion_tokens:tokensOf(s),motion_css:tokensCSS(s),motion_spec:motionSpec(s),video_spec:videoSpec(s),sound_spec:soundSpec(s),video_prompt:videoPrompt(s),audio_prompt:audioPrompt(s),
   consistency_checks:checks(s),downstream_hints:hints(s),guide_md:buildGuide(s),system_prompt:buildSystem(s),
   agent_rules:["所有動態、影片與聲音輸出必須符合 system_prompt、guide_md 與 motion_tokens。","任何動態都必須有減少動態版本；自動播放或循環超過 5 秒須可暫停；任何一秒內不得超過 3 次閃光。","combined_negatives 中的任何一項都不可出現；不確定時回報人類。","文字壓在動態背景上須列出全程最差位置對比；有人聲的影片必須有字幕。","音樂、人聲、肖像與 AI 生成素材須先確認授權與披露；AI 合成人聲不可用於客人見證；健康與效果相關見證與前後對比須由人類合規審核。","時長、緩動、效能、響度與平台規格是起點或公開指南的常見值，須實測並以最新平台說明為準。","consistency_checks 中 level 為 warn 或 error 的項目須先由人類確認，才可進入 4D–4H。","approval.state 為 draft 時，不得視為已核准；不得自行把狀態改為已核准。","status 為 incomplete 時，缺少的欄位不得自行補寫。","本階段不提供風格相符度分數。"]}}

// ---------- 貼回 ----------
function matchItem(k,name){const n=norm(name);if(!n)return null;const L=flat(k);return L.find(i=>i.id===name||norm(i.zh)===n)||L.find(i=>n.length>=2&&(norm(i.zh).includes(n)||(norm(i.zh).length>=2&&n.includes(norm(i.zh)))))||null}
function matchOpt(d,name){const dm=DIM(d);if(!dm)return null;const n=norm(name);return dm.opts.find(o=>o.id===name||norm(o.zh)===n)||dm.opts.find(o=>n.length>=2&&(norm(o.zh).includes(n)||(norm(o.zh).length>=2&&n.includes(norm(o.zh)))))||null}
function extractJSON(text){const f=text.match(/```(?:json)?\s*([\s\S]*?)```/i);return JSON.parse(f?f[1]:text.slice(text.indexOf("{"),text.lastIndexOf("}")+1))}
function normalizeBrief(j){if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4c"))return j;const n=a=>(a||[]).map(x=>x.name);const o={};const m=j.motion||{},g=j.gradient_texture_shape_motion||{},v=j.video||{},sd=j.sound||{},cam=v.camera||{},ed=v.editing||{};
  o.motionStyle=n(m.styles);o.motionRole=n(m.roles);o.motionUse=n(m.uses);o.gradMotion=n(g.items);o.videoStyle=n(v.styles);o.storyStyle=n(v.stories);o.animStyle=n(v.animation);o.videoFormat=n(v.formats);o.shot=n(cam.moves);o.composition=n(cam.composition);o.lighting=n(cam.lighting);o.mood=n(cam.mood);o.editStyle=n(ed.style);o.rhythm=n(ed.rhythm);o.perform=n(v.performance);
  o.soundEl=n(sd.elements);o.musicStyle=n(sd.music);o.instrument=n(sd.instruments);o.timbre=n(sd.timbre);o.voice=n((sd.voice||{}).types);o.voiceLang=n((sd.voice||{}).languages);o.uiSound=n((sd.ui_sounds||{}).types);o.licenseSrc=n((sd.licensing||{}).sources);o.motionAvoid=n((j.avoid||{}).motion);o.avoidAV=n((j.avoid||{}).audio_video);
  o.dims={};const d=(k,x)=>{if(x)o.dims[k]=x.name};d("easeStyle",m.easing);d("motionScale",m.durations);d("choreo",m.choreography);d("distance",m.distance);d("reducedPolicy",m.reduced_motion);d("autoplayPolicy",m.autoplay);d("gradProp",g.property);d("gradLoop",g.loop);d("gradReduced",g.reduced_version);d("hookRule",v.hook);d("capStyle",(v.captions||{}).style);d("capContrast",(v.captions||{}).contrast);d("audioDesc",(v.captions||{}).description);d("uiSoundPolicy",(sd.ui_sounds||{}).policy);d("silence",sd.silence);d("audioLogoLen",(sd.audio_logo||{}).rule);d("loudness",sd.loudness);d("licensePolicy",(sd.licensing||{}).policy);
  o.text={};const t=(k,x)=>{if(x!=null&&x!=="")o.text[k]=String(x)};t("m_bez",(m.custom||{}).bezier);t("m_stag",(m.custom||{}).stagger_ms);const gs=g.spec||{};t("g_a",gs.a);t("g_b",gs.b);t("g_c",gs.c);t("g_mid",gs.mid);t("g_angle",gs.angle);t("g_txt",gs.text_color);t("gm_alt",gs.alt_a);t("gm_alt2",gs.alt_b);t("gm_dur",g.period_s);t("v_len",v.length_s);t("v_fps",v.fps);t("v_bpm",ed.bpm);t("v_beats",ed.beats_per_cut);const sb=v.storyboard||{};t("sb1",sb.frame1);t("sb2",sb.frame2);t("sb3",sb.frame3);t("vo_line",(sd.voice||{}).sample_line);t("a_len",(sd.audio_logo||{}).length_s);t("a_key",(sd.audio_logo||{}).notes);t("st_note",j.notes);t("brandName",j.brand_name);if(j.statement&&j.statement.source==="human")t("statement",j.statement.text);return o}
function applyPaste(text,s){const out={applied:[],custom:[],errors:[]};let j;
  try{j=normalizeBrief(extractJSON(text))}catch(e){out.errors.push("找不到可解析的 JSON 區塊（請連同 ```json 區塊一起貼上）");return out}
  CAT_KEYS.forEach(k=>{if(!Array.isArray(j[k]))return;const ids=[],cu=[];j[k].forEach(n=>{const m=matchItem(k,n);if(m){if(!ids.includes(m.id))ids.push(m.id)}else if(String(n).trim()&&!cu.includes(String(n).trim()))cu.push(String(n).trim())});s[k]=ids;s.custom[k]=cu;out.applied.push(`${CAT[k].title.replace(/（.*/,"")}：${ids.length} 項`+(cu.length?`＋自訂 ${cu.length} 項`:""));cu.forEach(c=>out.custom.push(c))});
  const dd=Object.assign({},j.dims||{});DIMS.forEach(d=>{if(typeof j[d.id]==="string"||(j[d.id]&&j[d.id].name))dd[d.id]=typeof j[d.id]==="string"?j[d.id]:j[d.id].name});let c=0;Object.entries(dd).forEach(([d,v])=>{if(!DIM(d))return;const o=matchOpt(d,v);if(o){s.dims[d]=o.id;c++}else out.errors.push(`「${d}」的值「${v}」不在清單內，未套用`)});if(c)out.applied.push(`單選規則：${c} 項`);
  const tx=Object.assign({},j.text||{});TEXTS.forEach(t=>{if(typeof j[t.id]==="string"||typeof j[t.id]==="number")tx[t.id]=j[t.id]});let tc=0;Object.entries(tx).forEach(([k,v])=>{if(TEXT_BY[k]&&(typeof v==="string"||typeof v==="number")){s.text[k]=String(v);tc++}});if(tc)out.applied.push(`文字欄：${tc} 項`);
  if(!out.applied.length)out.errors.push("JSON 內沒有可辨識的欄位");return out}
