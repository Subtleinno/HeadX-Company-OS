
const KEY="brand_stage4d_v1";
const BK={s0:"brand_brief_stage0",s1:"brand_brief_stage1",s2:"brand_brief_stage2",s3:"brand_brief_stage3",s4a:"brand_brief_stage4a",s4b:"brand_brief_stage4b",s4c:"brand_brief_stage4c"};
const norm=t=>String(t||"").replace(/\s+/g,"").toLowerCase();
const emptyState=()=>{const s={s0:null,s1:null,s2:null,s3:null,s4a:null,s4b:null,s4c:null,dims:{},text:{},cmf:{},custom:{}};CAT_KEYS.forEach(k=>{s[k]=[];s.custom[k]=[]});return s};
function load(){let s=emptyState();try{const r=JSON.parse(localStorage.getItem(KEY)||"null");if(r){const e=emptyState();s=Object.assign(e,r);s.custom=Object.assign(e.custom,r.custom||{});s.dims=r.dims||{};s.text=r.text||{};s.cmf=r.cmf||{};CAT_KEYS.forEach(k=>{if(!Array.isArray(s[k]))s[k]=[];if(!Array.isArray(s.custom[k]))s.custom[k]=[]})}}catch(x){}return autoImport(s)}
function autoImport(s){Object.keys(BK).forEach(n=>{if(s[n])return;try{const raw=localStorage.getItem(BK[n]);if(raw){const p=PARSE[n](raw);if(p){s[n]=p;if(n==="s4a")fillPalette(s,p.palette)}}}catch(x){}});return s}
function fillPalette(s,pal){Object.entries(pal||{}).forEach(([k,v])=>{if(/^c_/.test(k)&&!String(s.text[k]||"").trim()&&hex(v))s.text[k]=v})}
function save(s){try{localStorage.setItem(KEY,JSON.stringify(s))}catch(x){}}
const flat=k=>CAT[k].groups.flatMap(g=>g.items);
const byId=(k,id)=>flat(k).find(i=>i.id===id);
const labels=(k,s)=>[...s[k].map(id=>(byId(k,id)||{zh:id}).zh),...s.custom[k]];
const items=(k,s)=>[...s[k].map(id=>byId(k,id)||{id,zh:id,desc:"",t:[],conf:[],cost:0,n1:0,n2:0,tool:false,val:false,perf:0,note:""}),...s.custom[k].map(t=>({id:"custom",zh:t,desc:"（自訂）",t:[],conf:[],cost:0,n1:0,n2:0,tool:false,val:false,perf:0,note:""}))];
const count=(k,s)=>s[k].length+s.custom[k].length;
const has=(s,id)=>CAT_KEYS.some(k=>s[k].includes(id));
const anyName=id=>{for(const k of CAT_KEYS){const i=byId(k,id);if(i)return i.zh}return id};
const picked=(s,d)=>{const id=s.dims[d];return id?OPTD(d,id):null};
const T_=(s,id)=>String(s.text[id]||"").trim();
const num=(s,id,d)=>{const v=parseFloat(T_(s,id));return isFinite(v)?v:d};
const nameList=a=>(a||[]).map(x=>x&&x.name).filter(Boolean);
function J(t){try{return typeof t==="string"?JSON.parse(t):t}catch(e){return null}}
const brandName=s=>T_(s,"brandName")||(s.s1&&s.s1.name)||(s.s0&&s.s0.name)||"品牌";

// ---------- 前階段匯入 ----------
function parseS0(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage0"))return null;const ch=j.choices||{},sel=j.selections||{},d=j.derived||{};return {name:(j.text||{}).trading||(j.text||{}).legalZh||"",budget:(ch.brandBudget||{}).name||"",priceTier:(ch.priceTier||{}).name||"",industry:nameList(sel.industry),delivery:nameList(sel.delivery),flags:d.flags||[],claims:!!d.claims_risk,regulated:!!d.regulated}}
function parseS1(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage1"))return null;return {name:j.brand_name||"",statement:(j.positioning_statement||{}).text||"",dials:((j.core_tension||{}).dials||[]).map(d=>({id:d.id,left:d.left,right:d.right,position:d.position})),anti:nameList(j.anti_persona)}}
function parseS2(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage2"))return null;const rules={};Object.entries(j.physics_rules||{}).forEach(([k,v])=>rules[k]=(v&&v.name)||"");return {statement:(j.sensory_statement||{}).text||"",keywords:nameList(j.mood_keywords),anti:nameList(j.anti_keywords),avoid:nameList(j.avoid_materials),material:nameList((j.material_metaphor||{}).primary),tactile:nameList(j.tactile),rules}}
function parseS3(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage3"))return null;return {statement:(j.voice_statement||{}).text||"",personality:nameList(j.personality)}}
function parseS4a(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4a"))return null;return {statement:(j.visual_statement||{}).text||"",logoStyle:nameList((j.logo||{}).style),colorStyle:nameList((j.color||{}).style),shape:nameList((j.shape||{}).style),texture:nameList(j.texture),photo:nameList((j.photography||{}).style),avoid:nameList(j.visual_avoid),palette:(j.color||{}).palette||{}}}
function parseS4b(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4b"))return null;const ps=(((j.finishes||{}).print_spec||{}).processes)||[];return {statement:(j.surface_statement||{}).text||"",processes:nameList((j.finishes||{}).processes),minLines:ps.map(p=>({name:p.name,min:p.min_line_mm})),substrates:nameList((j.finishes||{}).substrates),texture:nameList((j.texture||{}).specs),avoid:nameList(j.surface_avoid),colorways:(j.colorways||[]).map(c=>c.name)}}
function parseS4c(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4c"))return null;const m=j.motion||{},v=j.video||{},cam=v.camera||{};return {statement:(j.statement||{}).text||"",animation:nameList(v.animation),moves:nameList(cam.moves),lighting:nameList(cam.lighting),mood:nameList(cam.mood),reduced:(m.reduced_motion||{}).name||"",autoplay:(m.autoplay||{}).name||"",avoid:nameList((j.avoid||{}).motion).concat(nameList((j.avoid||{}).audio_video))}}
const PARSE={s0:parseS0,s1:parseS1,s2:parseS2,s3:parseS3,s4a:parseS4a,s4b:parseS4b,s4c:parseS4c};
function importBrief(text,s){const j=J(text);if(!j||typeof j.schema!=="string")return null;const m=j.schema.match(/^brand\/stage(\d)([abc]?)/);if(!m)return null;const k="s"+m[1]+m[2];if(!PARSE[k])return null;const p=PARSE[k](j);if(!p)return null;s[k]=p;if(k==="s4a")fillPalette(s,p.palette);try{localStorage.setItem(BK[k],JSON.stringify(j))}catch(e){}return k}
function ctxStages(s){const a=[];
  a.push(s.s0?`【Stage 0 業務】行業：${s.s0.industry.join("、")||"（無）"}｜價格定位：${s.s0.priceTier||"（無）"}｜品牌預算：${s.s0.budget||"（無）"}｜交付：${s.s0.delivery.join("、")||"（無）"}｜規管提示：${s.s0.flags.join("、")||"（無）"}｜健康宣稱風險：${s.s0.claims?"有":"無"}`:"【Stage 0 業務】（尚未匯入）");
  a.push(s.s1?`【Stage 1 定位】品牌：${s.s1.name||"（尚未命名）"}｜宣言：${s.s1.statement||"（無）"}｜張力刻度：${s.s1.dials.map(d=>`${d.left}↔${d.right}=${d.position}`).join("；")||"（無）"}｜絕對不要像：${s.s1.anti.join("、")||"（無）"}`:"【Stage 1 定位】（尚未匯入）");
  a.push(s.s2?`【Stage 2 感官】感官宣言：${s.s2.statement||"（無）"}｜材質隱喻：${s.s2.material.join("、")||"（無）"}｜觸感：${s.s2.tactile.join("、")||"（無）"}｜關鍵字：${s.s2.keywords.join("、")||"（無）"}｜反關鍵字：${s.s2.anti.join("、")||"（無）"}｜物理禁區：${s.s2.avoid.join("、")||"（無）"}`:"【Stage 2 感官】（尚未匯入）");
  a.push(s.s3?`【Stage 3 語言】聲音宣言：${s.s3.statement||"（無）"}｜性格：${s.s3.personality.join("、")||"（無）"}`:"【Stage 3 語言】（尚未匯入）");
  a.push(s.s4a?`【Stage 4A 視覺語言】一句話：${s.s4a.statement||"（無）"}｜Logo 風格：${s.s4a.logoStyle.join("、")||"（無）"}｜色彩：${s.s4a.colorStyle.join("、")||"（無）"}｜形狀：${s.s4a.shape.join("、")||"（無）"}｜攝影：${s.s4a.photo.join("、")||"（無）"}｜視覺禁區：${s.s4a.avoid.join("、")||"（無）"}`:"【Stage 4A 視覺語言】（尚未匯入）");
  a.push(s.s4b?`【Stage 4B 表面系統】一句話：${s.s4b.statement||"（無）"}｜工藝：${s.s4b.processes.join("、")||"（無）"}｜承印物：${s.s4b.substrates.join("、")||"（無）"}｜表面禁區：${s.s4b.avoid.join("、")||"（無）"}`:"【Stage 4B 表面系統】（尚未匯入）");
  a.push(s.s4c?`【Stage 4C 動態影片】一句話：${s.s4c.statement||"（無）"}｜動畫：${s.s4c.animation.join("、")||"（無）"}｜運鏡：${s.s4c.moves.join("、")||"（無）"}｜燈光：${s.s4c.lighting.join("、")||"（無）"}｜減少動態：${s.s4c.reduced||"（未定）"}｜自動播放：${s.s4c.autoplay||"（未定）"}`:"【Stage 4C 動態影片】（尚未匯入）");
  return a.join("\n")}
function ctx3d(s){const L=k=>labels(k,s).join("、")||"（尚未選擇）",P=d=>{const o=picked(s,d);return o?o.zh:"（尚未選擇）"},X=id=>T_(s,id)||"（尚未填寫）";
  return [`3D：風格 ${L("style3d")}｜材質 ${L("mat3d")}｜角色 ${L("mascot")}｜場景 ${L("scene3d")}｜燈光 ${L("light3d")}｜運鏡 ${L("cam3d")}｜動畫 ${L("anim3d")}｜交付 ${L("delivery3d")}`,
  `3D 設定：品質 ${P("quality3d")}｜焦段 ${P("lens")}｜背景 ${P("bgKind")}｜轉盤 ${P("turntable")}（${X("tt_sec")} 秒）｜減少動態 ${P("reduced3d")}`,
  `產品：外觀 ${L("appearance")}｜使用情境 ${L("usage")}｜尺寸等級 ${P("sizeClass")}｜尺寸 ${X("p_l")}×${X("p_w")}×${X("p_h")} mm｜重量 ${X("p_wt")} g｜供電 ${P("powerType")}`,
  `物料與工藝：物料 ${L("prodMat")}｜表面處理 ${L("finish")}｜製程 ${L("mfg")}｜零件 ${L("parts")}`,
  `CMF：核准 ${P("cmfApproval")}｜光源 ${P("lightBox")}｜色值 主 ${X("c_primary")}／輔 ${X("c_secondary")}／點綴 ${X("c_accent")}／深 ${X("c_ink")}／淺 ${X("c_paper")}`,
  `認證提醒：${L("compliance")}｜測試：${L("proto")}｜樣機階段 ${P("protoStage")}｜供應鏈 ${P("supply")}｜永續主張 ${P("sustainClaim")}｜IP ${P("ipStatus")}`,
  `展示動畫：${L("displayAnim")}｜禁區：${L("avoid3d")}`].join("\n")}

// ---------- 色彩 ----------
function hex(v){const m=String(v||"").trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);if(!m)return null;let h=m[1];if(h.length===3)h=h.split("").map(c=>c+c).join("");return "#"+h.toUpperCase()}
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const lin=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
const lum=h=>{const [r,g,b]=rgb(h).map(v=>lin(v/255));return .2126*r+.7152*g+.0722*b};
function hsl(h){const [r,g,b]=rgb(h).map(v=>v/255);const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;let H=0,S=0;if(mx!==mn){const d=mx-mn;S=l>.5?d/(2-mx-mn):d/(mx+mn);H=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;H*=60}return {h:H,s:S*100,l:l*100}}
function palette(s){const o={};COLS.forEach(([id])=>{const h=hex(s.text[id]);if(h)o[id]=h});return o}
const cmfOf=(s,id)=>Object.assign({mat:"",fin:"",sid:""},s.cmf[id]||{});
function cmfRows(s){const p=palette(s);return COLS.filter(([id])=>p[id]).map(([id,l])=>{const c=cmfOf(s,id);const H=hsl(p[id]);return {id,label:l,hex:p[id],mat:c.mat,fin:c.fin,sid:c.sid,hsl:H,dark:lum(p[id])<.05,light:lum(p[id])>.8}})}

// ---------- 計算 ----------
function productDims(s){const L=num(s,"p_l",NaN),W=num(s,"p_w",NaN),H=num(s,"p_h",NaN),wt=num(s,"p_wt",NaN);if(![L,W,H].every(isFinite))return null;const vol=L*W*H/1000;const dd=[L,W,H].sort((a,b)=>b-a);return {L,W,H,wt:isFinite(wt)?wt:null,vol,density:isFinite(wt)&&vol>0?wt/vol:null,aspect:dd[0]/dd[2],longest:dd[0]}}
function renderCalc(s){const w=num(s,"r_w",NaN),h=num(s,"r_h",NaN),fps=num(s,"r_fps",NaN),sec=num(s,"r_sec",NaN),spf=num(s,"r_spf",NaN),mach=Math.max(1,num(s,"r_machines",1));if(![fps,sec].every(isFinite))return null;const frames=Math.round(fps*sec);const o={w:isFinite(w)?w:null,h:isFinite(h)?h:null,fps,sec,frames,spf:isFinite(spf)?spf:null,mach};if(o.spf!=null){o.hours=frames*spf/3600/mach}return o}
function webMem(s){const n=num(s,"w_tex_n",NaN),px=num(s,"w_tex_px",NaN),budget=num(s,"w_mem",NaN),tri=num(s,"w_tri",NaN);if(!isFinite(n)||!isFinite(px))return null;const mb=n*px*px*4*1.3333/1048576;return {n,px,mb,budget:isFinite(budget)?budget:null,tri:isFinite(tri)?tri:null,over:isFinite(budget)&&mb>budget}}
function turntable(s){const sec=num(s,"tt_sec",NaN),fps=num(s,"r_fps",NaN);if(!isFinite(sec)||sec<=0)return null;return {sec,dps:360/sec,frames:isFinite(fps)?fps*sec:null,perFrame:isFinite(fps)?360/(fps*sec):null,whole:isFinite(fps)?Math.abs(fps*sec-Math.round(fps*sec))<.001:null}}
function exploded(s){const n=num(s,"ex_parts",NaN),st=num(s,"ex_stag",NaN);if(!isFinite(n)||!isFinite(st))return null;const per=600;return {n,st,total:(n-1)*st+per,per}}
function bomRows(s){return String(s.text.bom||"").split(/\n+/).map(x=>x.trim()).filter(Boolean).map(l=>{const a=l.split(/[|｜\t]/).map(x=>x.trim());return {part:a[0]||"",mat:a[1]||"",proc:a[2]||"",supplier:a[3]||"",status:a[4]||""}})}

// ---------- 檢查 ----------
function selTags(s){const out={};CAT_KEYS.filter(k=>!["avoid3d","compliance","proto"].includes(k)).forEach(k=>items(k,s).forEach(i=>(i.t||[]).forEach(t=>{(out[t]=out[t]||[]).push(i.zh)})));DIMS.forEach(d=>{const o=picked(s,d.id);if(o)(o.t||[]).forEach(t=>{(out[t]=out[t]||[]).push(o.zh)})});return out}
const ANTI_TAG={"冰冷醫院感":["clinical","cold"],"廉價促銷感":["loud","cheap"],"過度科技炫技":["neon","loud","digital"],"炫富浮誇":["flashy","loud"],"陰暗沉重":["dark"],"過度幼稚":["childish"],"純科技冷硬品牌":["cold","hard"],"老派藥房感":["dated"],"網紅爆款保健品":["loud"],"廉價模板感":["cheap"]};
const KW_AVOID=[[/克制|安靜|沉穩|沉靜|平靜|從容|舒緩/,["loud","neon","flashy"],"偏張揚"],[/溫暖|溫潤|親切|柔和/,["cold","clinical","hard"],"偏冰冷硬朗"],[/輕盈|空靈|通透/,["dark"],"偏沉重暗"],[/優雅/,["loud","childish","flashy"],"偏浮誇或幼稚"]];
const MAT_META=[[/陶瓷|瓷/,["m3_ceramic","pm_ceramic"]],[/玻璃/,["m3_glass","pm_glass"]],[/金屬|鋁|鈦|不鏽鋼|鉻|銅|鋼/,["m3_brushed","m3_chrome","pm_alu","pm_ss"]],[/紙|宣紙/,["m3_paper"]],[/木|竹/,["m3_wood","pm_wood","pm_bio"]],[/皮革/,["m3_leather","pm_leather"]],[/布|棉|麻|氈|織/,["m3_fabric","pm_fabric"]],[/矽膠|橡膠/,["m3_rubber","pm_silicone"]],[/塑料|塑膠/,["m3_plastic","pm_abs","pm_rec"]],[/水|蒸氣|液/,["m3_liquid"]],[/石|混凝土|泥|陶土/,["m3_stone","pm_ceramic"]]];
const AVOIDMAT=[["廉價塑膠感",["m3_plastic","pm_abs"],"info"],["過度反光鏡面",["m3_chrome","fn_polish","s3_liquid"],"warn"],["醫院式冷不鏽鋼",["pm_ss","m3_brushed","fn_brush"],"warn"],["假木紋貼皮",["m3_wood"],"info"],["過度擬真仿皮",["m3_leather","pm_leather"],"info"],["霓虹螢光",["m3_emit","l3_neon"],"warn"],["過度金屬金",["fn_plate","m3_chrome"],"info"],["果凍泡泡感",["s3_glass","s3_clay"],"info"],["亮面貼紙感",["fn_polish"],"info"],["廉價瓦楞紙箱感",["m3_paper"],"info"],["亮粉閃片",["m3_emit"],"info"]];
const PAIRS=[["s3_grey","s3_photo","warn","灰模只是造型討論，不是最終風格；與寫實風格同時選請說明用途。"],["mc_none","mc_q","error","「不使用角色」與其他角色同時選了。"],["mc_none","mc_real","error","「不使用角色」與其他角色同時選了。"],["mc_none","mc_clay","error","「不使用角色」與其他角色同時選了。"],["mc_none","mc_animal","error","「不使用角色」與其他角色同時選了。"],["mc_none","mc_robot","error","「不使用角色」與其他角色同時選了。"],["mc_none","mc_virtual","error","「不使用角色」與其他角色同時選了。"],["l3_soft","l3_low","warn","柔光棚與單光源低調方向相反，請定義各自場景。"],["l3_soft","l3_side","warn","柔光棚與戲劇側光方向相反，請定義各自場景。"],["pa_min","pa_cute","warn","極簡幾何與可愛圓潤方向相反。"],["pa_ind","pa_org","warn","工業硬朗與有機柔和方向相反。"],["pa_craft","pa_tech","warn","手作工藝與高科技精密在公差與一致性上相反。"],["pm_alu","fn_grain","info","鋁件的咬花紋理需要特殊工藝，請向供應商確認。"],["m3_chrome","m3_rubber","info","鏡面鉻與橡膠質感反差大，請說明各部位。"],["c3_fix","c3_orbit","info","固定與環繞同時選了，請說明用在哪些畫面。"],["d3_still","a3_phys","warn","只交付靜態圖，卻選了物理模擬動畫。"],["fn_matte","fn_polish","info","霧面與拋光同時選了，請說明各部位。"]];
function checks(s){
  const out=[],A=(l,m)=>out.push({level:l,msg:m});const tags=selTags(s),T=t=>tags[t]||[],J2=a=>[...new Set(a)].join("、");const p=palette(s);
  CAT_KEYS.forEach(k=>{if(CAT[k].max<90&&count(k,s)>CAT[k].max)A("warn",`「${CAT[k].title.replace(/（.*/,"")}」選了 ${count(k,s)} 個，超過建議的 ${CAT[k].max} 個。`)});
  PAIRS.forEach(([a,b,l,m])=>{if(has(s,a)&&has(s,b))A(l,`「${anyName(a)}」＋「${anyName(b)}」：${m}`)});
  items("avoid3d",s).forEach(av=>{(av.conf||[]).forEach(c=>{if(has(s,c))A("error",`禁區「${av.zh}」與你選的「${anyName(c)}」互相矛盾。`)})});
  if(count("avoid3d",s)>0&&count("avoid3d",s)<3)A("info","3D 與產品視覺禁區建議至少 3 個。");
  COLS.forEach(([id,l])=>{if(T_(s,id)&&!p[id])A("warn",`「${l}」不是有效的 HEX 色值。`)});
  // 工程領域總提醒
  const valItems=[...items("prodMat",s),...items("finish",s),...items("mfg",s),...items("parts",s),...items("usage",s)].filter(i=>i.val);
  if(valItems.length)A("info",`${valItems.length} 項選擇屬工程或安全領域（物料、表面處理、製程、零件、使用情境）：只作方向記錄，須由工程師與合資格專業人士驗證，不能因風格配對而自動批准；本原型不是工程圖、BOM 或認證文件。`);
  // 材料與表面相容
  if(has(s,"fn_anod")&&!has(s,"pm_alu"))A("warn","噴砂陽極只適用於鋁（與部分合金），但物料沒有選鋁合金。");
  if(has(s,"fn_brush")&&!has(s,"pm_alu")&&!has(s,"pm_ss"))A("warn","拉絲通常用在金屬，但物料沒有選鋁合金或不鏽鋼。");
  if(has(s,"fn_plate")&&(has(s,"pm_wood")||has(s,"pm_fabric")||has(s,"pm_leather")))A("warn","電鍍不適用於木、織物與皮革；若是塑料件須確認為可電鍍材料與環保法規。");
  if(has(s,"fn_plate")&&has(s,"pm_abs"))A("info","塑料電鍍須用可電鍍等級，並確認有害物質與廢水處理的法規與供應商資格。");
  if(has(s,"fn_grain")&&!s.mfg.some(x=>["mf_inj","mf_die"].includes(x)))A("info","皮紋／咬花通常做在模具上，需要射出成型或壓鑄等模具製程。");
  if(has(s,"fn_soft")&&has(s,"us_clinic"))A("warn","軟觸塗層在診所反覆消毒下可能脫落或發黏，須與供應商與實驗室驗證耐消毒性。");
  if(has(s,"fn_polish")&&(has(s,"us_hand")||has(s,"us_carry")))A("info","拋光表面的指紋與刮痕很明顯，手持與隨身產品須評估。");
  if(has(s,"pm_glass")&&(has(s,"us_kid")||has(s,"us_carry")||has(s,"us_out")))A("warn","玻璃在兒童、隨身或戶外使用時有破裂風險，須評估安全玻璃或替代材料。");
  if((has(s,"pm_alu")||has(s,"pm_ss"))&&has(s,"us_wear"))A("info","金屬長期接觸皮膚須考慮致敏（例如鎳釋放）與表面處理，需專業測試。");
  if(has(s,"pm_leather")||has(s,"pm_bio")||has(s,"pm_rec")){if(!picked(s,"sustainClaim"))A("warn","選了皮革、再生或生物基材料，但還沒決定環保／永續主張策略；宣稱須有證據，不可誇大。")}
  const sc=picked(s,"sustainClaim");if(sc&&sc.id==="sc_evidence"&&!/證|認證|比例|報告|來源/.test(T_(s,"st_note")))A("warn","環保主張策略是『有證據的具體主張』，但備註沒有記錄證明（比例、認證、報告或來源）。");
  if(has(s,"av_green")===false&&(has(s,"pa_sus")||has(s,"pm_rec")||has(s,"pm_bio"))&&!has(s,"av_green"))A("info","外觀或物料有環保取向：建議在禁區加入『無依據的環保視覺』。");
  // 製程與預算
  const tools=[...items("mfg",s),...items("prodMat",s)].filter(i=>i.tool);
  if(tools.length&&s.s0&&/1 萬以下/.test(s.s0.budget))A("warn",`Stage 0 品牌預算低於 1 萬港元，但選了需要模具的項目（${J2(tools.map(i=>i.zh))}）；模具成本與起訂量通常很高，須先向供應商取得報價。`);
  if(has(s,"mf_inj")||has(s,"mf_die"))A("info","射出成型與壓鑄須開模，需要拔模角、壁厚與公差設計，且修模昂貴；開模前須完成設計驗證（DVT）。");
  if(has(s,"mf_3dp")&&picked(s,"protoStage")&&["ps_prod","ps_mass"].includes(picked(s,"protoStage").id)&&s.mfg.length===1)A("warn","製程只有 3D 列印，但樣機階段是生產驗證或量產；3D 列印不等於量產品質與成本。");
  if((s.mfg.length||s.parts.length)&&!picked(s,"supply"))A("info","已選製程或零件，但還沒決定供應鏈安排。");
  const sp=picked(s,"supply");if(sp&&sp.id==="sp_pending"&&picked(s,"protoStage")&&["ps_prod","ps_mass"].includes(picked(s,"protoStage").id))A("warn","已到生產驗證或量產，但供應鏈尚未確認。");
  // CMF
  const ca=picked(s,"cmfApproval"),lb=picked(s,"lightBox"),pst=picked(s,"protoStage");
  if(s.prodMat.length&&!ca)A("info","已選物料，但還沒決定 CMF 色樣核准狀態。螢幕色不等於實物色；同一顏色在不同材料與表面上看起來不同（同色異譜）。");
  if(pst&&["ps_design","ps_prod","ps_mass"].includes(pst.id)&&(!ca||ca.id!=="ca_ok"))A("warn","樣機階段已到設計驗證以上，但 CMF 色樣尚未核准；量產前須有實物色樣、核准者、日期與光源。");
  if(ca&&ca.id==="ca_ok"&&(!lb||lb.id==="lb_unspec"))A("warn","CMF 色樣已核准，但沒有記錄核准用的光源。");
  if(ca&&ca.id==="ca_ok"&&!/色樣|編號|核准/.test(T_(s,"st_note"))&&!Object.values(s.cmf).some(c=>c&&c.sid))A("warn","CMF 已核准，但沒有色樣編號與核准紀錄。");
  cmfRows(s).forEach(r=>{if(r.dark&&["fn_polish"].some(i=>r.fin===anyName(i)))A("info",`${r.label} ${r.hex} 是很深的顏色，搭配拋光表面時指紋與刮痕最明顯。`);if(r.fin&&/陽極/.test(r.fin)&&r.hsl.s>85)A("info",`${r.label} ${r.hex} 飽和度很高，噴砂陽極的色彩範圍有限，須向供應商確認能否做到。`);if(r.fin&&/電鍍|拋光/.test(r.fin)&&r.light)A("info",`${r.label} ${r.hex} 是淺色，金屬電鍍或拋光表面的顏色由金屬決定，不一定能做成這個色。`)});
  const cmfMissing=cmfRows(s).filter(r=>(s.prodMat.length&&!r.mat)||(s.finish.length&&!r.fin));if(cmfRows(s).length&&cmfMissing.length&&(s.prodMat.length||s.finish.length)&&ca&&ca.id!=="ca_none")A("info",`CMF 表中 ${cmfMissing.map(r=>r.label).join("、")} 還沒指定物料或表面處理。`);
  if(has(s,"d3_config")&&(!ca||ca.id!=="ca_ok"))A("warn","互動產品配置器的顏色與材質必須與實物色樣一致，否則會誤導；目前 CMF 尚未核准。");
  // 標誌線寬
  const lm=num(s,"p_logo_mm",NaN);
  if(isFinite(lm)&&(has(s,"fn_screen")||has(s,"fn_laser"))){const names=[];if(has(s,"fn_screen"))names.push("絲網");if(has(s,"fn_laser"))names.push("鐳射");const b=s.s4b&&s.s4b.minLines.filter(x=>names.some(n=>x.name.includes(n))&&x.min>0);
    if(b&&b.length)b.forEach(x=>{if(lm<x.min)A("warn",`產品標誌最小線寬 ${lm}mm，低於 4B 登錄的「${x.name}」常見保守最小線寬 ${x.min}mm。`)});else A("info","絲印或鐳雕的最小線寬各廠與各材料不同（4B 沒有這項工藝的參考值），請向供應商確認，並以打樣為準。");if(lm<.1)A("warn",`產品標誌最小線寬 ${lm}mm 非常細，絲印與鐳雕在曲面與粗糙表面上很可能失真。`)}
  // 尺寸
  const pd=productDims(s);
  if(pd&&pd.density!=null){if(pd.density<.05)A("info",`尺寸與重量換算的平均密度約 ${pd.density.toFixed(2)} g/cm³（以外框體積計），重量似乎偏輕；請確認重量欄位是否正確。`);if(pd.density>3)A("warn",`尺寸與重量換算的平均密度約 ${pd.density.toFixed(2)} g/cm³（以外框體積計），比一般鋁合金還高，請確認尺寸與重量欄位。`)}
  const sz=picked(s,"sizeClass");if(sz&&sz.id==="sz_palm"&&pd&&pd.longest>250)A("warn",`尺寸等級是掌上／手持，但最長邊 ${pd.longest}mm，偏大。`);if(sz&&sz.id==="sz_wear"&&pd&&pd.wt!=null&&pd.wt>500)A("warn","穿戴產品重量超過 500g，舒適度與長時間佩戴須評估。");
  // 零件與認證
  const comp=c=>has(s,c);
  if(has(s,"pt_circuit")){if(!comp("cp_elec")&&!comp("cp_batt"))A("warn","零件包含電路與電源，但認證提醒沒有電氣安全或電池；請先確認適用的要求。");if(!comp("cp_emc"))A("info","有電子電路的產品通常要考慮電磁相容（EMC）要求。")}
  if(has(s,"pt_wireless")&&!comp("cp_radio"))A("warn","零件包含無線連線，但認證提醒沒有無線電設備；請先確認各市場的要求。");
  if(has(s,"us_wear")&&!comp("cp_skin"))A("warn","使用情境是穿戴，但認證提醒沒有接觸皮膚材料與致敏。");
  if(has(s,"us_kid")&&!comp("cp_child"))A("error","使用情境包含兒童，但認證提醒沒有兒童產品安全；兒童產品的安全要求通常最嚴。");
  if(has(s,"pt_protect")&&!comp("cp_ip")&&!has(s,"pr_ip"))A("warn","零件包含防護（防水、防塵），但沒有防水防塵等級提醒或測試；不可自行宣稱防水等級。");
  if(has(s,"us_clinic")&&s.s0&&s.s0.claims&&!comp("cp_med"))A("info","診所環境且業務涉及健康宣稱：若產品聲稱診斷、治療或監測，可能屬醫療器材，請向專業人士確認分類。");
  if(s.s0&&s.s0.flags.includes("device")&&!s.compliance.length)A("warn","Stage 0 業務涉及醫療或健康器材，但 4D 沒有任何認證提醒；請先向專業人士確認分類與要求。");
  if(s.parts.length&&!s.proto.length)A("info","已選零件或製程，但還沒選任何測試。");
  const prs=picked(s,"protoStage");if(prs&&["ps_design","ps_prod","ps_mass"].includes(prs.id)&&!s.proto.length)A("warn","樣機階段已到設計驗證以上，但沒有選任何測試。");
  if(has(s,"pt_circuit")&&!has(s,"pr_batt")&&picked(s,"powerType")&&["pw_recharge"].includes(picked(s,"powerType").id))A("warn","可充電電池產品建議包含溫升與電池安全測試。");
  const pw=picked(s,"powerType");if(pw&&pw.id!=="pw_none"&&!has(s,"pt_circuit"))A("info","已選供電，但零件沒有電路與電源。");if(pw&&pw.id==="pw_none"&&(has(s,"pt_circuit")||has(s,"pt_wireless")||has(s,"pt_sensor")))A("warn","供電是『無電子』，但零件選了電路、感測器或無線。");
  if(has(s,"pt_haptic")&&s.s4c&&!s.s4c.avoid.length&&false)A("info","");
  if(has(s,"pt_display")&&!s.s4a)A("info","顯示與指示燈的色彩須與 4A 一致，且不可只靠顏色表示狀態。");
  // 3D 與動態
  const tt=picked(s,"turntable"),rd=picked(s,"reduced3d"),dl=has(s,"d3_web")||has(s,"d3_ar")||has(s,"d3_config")||has(s,"d3_video");
  const autoMotion=s.anim3d.length||s.cam3d.some(x=>["c3_orbit","c3_turn","c3_fly","c3_dive"].includes(x))||(tt&&["tt_ctrl","tt_once"].includes(tt.id));
  if(dl&&autoMotion&&!rd)A("error","3D 展示有動態，卻沒有決定『減少動態』時顯示什麼（靜態主圖、少量角度或放慢）。");
  if(tt&&tt.id==="tt_ctrl"&&s.s4c&&s.s4c.autoplay&&/不自動|≤5/.test(s.s4c.autoplay))A("info",`4C 的自動播放政策是「${s.s4c.autoplay}」，但 4D 轉盤是自動旋轉並可暫停；請確認一致。`);
  if(tt&&tt.id==="tt_ctrl"&&!has(s,"d3_web")&&!has(s,"d3_config")&&!has(s,"d3_video"))A("info","轉盤自動旋轉須有暫停控制；請確認交付形式。");
  if(s.anim3d.some(x=>["a3_part","a3_morph","a3_phys"].includes(x))&&!has(s,"d3_video")&&!has(s,"d3_still"))A("warn","粒子、液態與物理模擬在即時 3D 上效能很重，建議預渲染成影片，並提供靜態備援。");
  if(has(s,"d3_web")&&!has(s,"d3_still"))A("info","即時網頁 3D 須有靜態備援圖（舊裝置、省電模式、減少動態）。");
  if(has(s,"s3_glass")&&has(s,"d3_web"))A("warn","玻璃與半透明在即時網頁 3D 渲染重，低階手機可能無法順暢。");
  const heavy=[...items("style3d",s),...items("mat3d",s),...items("scene3d",s),...items("light3d",s),...items("anim3d",s)].filter(i=>i.perf>=3);
  if(has(s,"d3_web")||has(s,"d3_ar")){if(heavy.length)A("warn",`即時 3D（網頁或 AR）選了較重的項目（${J2(heavy.map(i=>i.zh))}）；請用目標裝置實測，必要時改預渲染。`)}
  const rc=renderCalc(s);
  if(rc&&rc.hours!=null&&rc.hours>24)A("warn",`估算渲染時間約 ${rc.hours.toFixed(1)} 小時（${rc.frames} 幀 × ${rc.spf} 秒 ÷ ${rc.mach} 台）；請確認預算與時程，或降低品質、解析度與長度。`);
  const wm=webMem(s);if(wm&&wm.over)A("warn",`貼圖記憶體估算約 ${wm.mb.toFixed(0)}MB（${wm.n} 張 ${wm.px}px，含 mipmap，未計壓縮），超過你設定的 ${wm.budget}MB 預算。`);
  if(wm&&wm.px>4096)A("info","貼圖邊長超過 4096px，行動裝置可能不支援或很吃記憶體。");
  const tr=turntable(s);if(tr){if(tr.sec<4)A("warn",`轉盤一圈只有 ${tr.sec} 秒（約 ${tr.dps.toFixed(0)}°/秒），太快容易暈眩，也看不清產品。`);if(tr.whole===false)A("info","轉盤一圈的幀數不是整數，無縫循環會有跳幀；請調整秒數或幀率。")}
  const ex=exploded(s);if(ex&&ex.total>8000)A("warn",`爆炸圖展開約 ${(ex.total/1000).toFixed(1)} 秒（${ex.n} 個零件、每個錯開 ${ex.st}ms、每件約 ${ex.per}ms），太長，觀眾易流失；可減少零件或分段。`);
  if(has(s,"da_explode")&&!has(s,"pt_struct"))A("info","爆炸圖拆解展示結構，但零件沒有結構件；請確認展示的內部結構與真實產品一致。");
  if(has(s,"da_use")&&s.s0&&s.s0.claims)A("warn","使用情境動畫涉及健康或效果宣稱：不可暗示未驗證的療效或功能；須人類合規審核。");
  if(has(s,"da_feature")&&s.s0&&s.s0.claims)A("info","功能特寫的宣稱須有依據；不可只靠 3D 視覺暗示功能。");
  // 角色
  const mc=s.mascot.filter(x=>x!=="mc_none");
  if(mc.length){const ex2=num(s,"ma_expr",NaN),po=num(s,"ma_pose",NaN);if(isFinite(ex2)&&ex2<3)A("info","吉祥物表情少於 3 種，之後難以用在不同情境。");if(isFinite(po)&&po<4)A("info","吉祥物姿勢少於 4 種，延伸成本會很快浮現。");A("info","吉祥物是長期資產：須有角色設定（正面、側面、背面、3/4 轉面）、版權歸屬與委託創作合約，並確認形象不與他牌雷同。");if(!picked(s,"ipStatus"))A("warn","已選吉祥物或角色，但還沒決定知識產權處理（檢索、申請、專業評估）。");
    if(s.s3&&/專業|嚴謹|可靠/.test(s.s3.personality.join("｜")))A("info","Stage 3 的說話性格偏專業嚴謹，吉祥物的比例與表情須維持可信感。");
    if(has(s,"mc_virtual")||has(s,"mc_real"))A("warn","虛擬人或寫實角色須披露為虛擬、確認版權與聲音權，並注意恐怖谷。")}
  if((has(s,"pa_cute")||s.appearance.length)&&!picked(s,"ipStatus"))A("info","產品外觀（形狀、花紋與標誌）建議做外觀設計與商標檢索，並交專業人士判斷。");
  // 4A / 4B / 4C
  const a=s.s4a;
  if(a){const soft=a.shape.filter(x=>/大圓角|膠囊|有機/.test(x)),hard=a.shape.filter(x=>/直角|斜角/.test(x));if(soft.length&&has(s,"pa_ind"))A("warn",`4A 的形狀是「${soft.join("、")}」，但產品外觀選了工業硬朗。`);if(hard.length&&(has(s,"pa_org")||has(s,"pa_cute")))A("warn",`4A 的形狀是「${hard.join("、")}」，但產品外觀選了有機柔和或可愛圓潤。`);
    if(a.photo.some(x=>/低調戲劇/.test(x))&&(has(s,"l3_soft")||has(s,"l3_gi")))A("warn","4A 的攝影風格是低調戲劇，但 3D 燈光選了柔光或柔和全域照明。");if(a.photo.some(x=>/高調明亮/.test(x))&&(has(s,"l3_low")||has(s,"l3_side")))A("warn","4A 的攝影風格是高調明亮，但 3D 燈光選了單光源低調或戲劇側光。");
    a.avoid.forEach(v=>{if(/亮面 3D|果凍|塑膠高光/.test(v)&&(has(s,"m3_chrome")||has(s,"s3_glass")||has(s,"fn_polish")))A("warn",`4A 視覺禁區有「${v}」，但 4D 選了鏡面鉻、玻璃或拋光。`);if(/素材庫/.test(v)&&has(s,"av_cheap3d")===false&&(has(s,"sc_float")))A("info",`4A 視覺禁區有「${v}」，漂浮物件容易像素材庫。`)})}
  const b=s.s4b;
  if(b){b.avoid.forEach(v=>{if(/亮面|螢光|金色/.test(v)&&(has(s,"m3_emit")||has(s,"fn_plate")||has(s,"fn_polish")))A("info",`4B 表面禁區有「${v}」，請檢查 4D 的發光、電鍍或拋光。`)});if(b.processes.length&&(has(s,"fn_screen")||has(s,"fn_laser"))&&!b.processes.some(x=>/絲網|鐳射/.test(x)))A("info","產品用絲印或鐳雕，但 4B 沒有登錄相同工藝，建議補上最小線寬資料。")}
  const c=s.s4c;
  if(c){if(s.anim3d.length&&c.animation.length&&!c.animation.some(x=>/3D/.test(x)))A("info","4D 有 3D 動畫，但 4C 的動畫風格沒有選 3D CGI；請確認影片風格一致。");
    if(c.lighting.some(x=>/高調/.test(x))&&(has(s,"l3_low")||has(s,"l3_side")))A("warn","4C 影片燈光是高調光，但 3D 燈光選了低調或戲劇側光。");if(c.lighting.some(x=>/低調|倫勃朗|分割/.test(x))&&(has(s,"l3_soft")||has(s,"l3_gi")))A("warn","4C 影片燈光偏低調，但 3D 燈光選了柔光或柔和全域照明。");
    if(c.moves.some(x=>/環繞/.test(x))&&!has(s,"c3_orbit")&&s.cam3d.length)A("info","4C 的運鏡有環繞，但 4D 3D 運鏡沒有慢速環繞。");if(c.avoid.some(x=>/閃爍/.test(x))&&(has(s,"a3_part")||has(s,"l3_neon")))A("warn","4C 的禁區有閃爍，但 4D 選了粒子或霓虹燈光，請檢查閃爍風險。")}
  else A("info","尚未匯入 4C，無法做動態與影片的交叉檢查。");
  // Stage 1
  const q=s.s1;
  if(q){q.anti.forEach(x=>{const hit=J2((ANTI_TAG[x]||[]).flatMap(t=>T(t)));if(hit)A("warn",`Stage 1 要避免「${x}」，但你選的 ${hit} 容易帶來這種感覺。`)});
    q.dials.forEach(d=>{if(d.id==="quiet_bold"&&d.position<=-1&&(T("loud").length||T("neon").length||T("flashy").length))A("warn",`Stage 1 傾向「低調克制」，但 ${J2([...T("loud"),...T("neon"),...T("flashy")])} 偏張揚。`);if(d.id==="premium_access"&&d.position<=-1&&T("cheap").length)A("warn",`Stage 1 傾向「高端稀有」，但 ${J2(T("cheap"))} 容易顯廉價。`);if(d.id==="authority_friend"&&d.position<=-1&&T("childish").length)A("warn",`Stage 1 傾向「專業權威」，但 ${J2(T("childish"))} 偏孩子氣。`);if(d.id==="trad_modern"&&d.position>=1&&(T("dated").length||T("heritage").length)&&!T("modern").length)A("warn",`Stage 1 傾向「當代創新」，但 ${J2([...T("dated"),...T("heritage")])} 偏傳統。`)})}
  else A("info","尚未匯入 Stage 1，無法做定位交叉檢查。");
  // Stage 2
  const m=s.s2;
  if(m){m.keywords.forEach(k=>KW_AVOID.forEach(([re,tg,msg])=>{if(re.test(k)){const hit=J2(tg.flatMap(t=>T(t)));if(hit)A("warn",`Stage 2 的關鍵字「${k}」，但 ${hit} ${msg}。`)}}));
    m.avoid.forEach(av=>AVOIDMAT.forEach(([nm,ids,lv])=>{if(norm(av).includes(norm(nm)))ids.filter(i=>has(s,i)).forEach(i=>A(lv,`Stage 2 物理禁區有「${av}」，但你選了「${anyName(i)}」。`))}));
    m.material.forEach(mt=>{MAT_META.forEach(([re,ids])=>{if(re.test(mt)&&!ids.some(i=>has(s,i))&&(s.mat3d.length||s.prodMat.length))A("info",`Stage 2 的材質隱喻是「${mt}」，但 4D 的 3D 材質與產品物料沒有對應的選項（${[...new Set(ids.map(anyName))].join("、")}）；請確認是否有意轉化。`)})});
    const tr2=m.rules.transparency||"";if(/完全不透明/.test(tr2)&&(has(s,"s3_glass")||has(s,"m3_glass")||has(s,"m3_liquid")))A("warn",`Stage 2 透明規則是「${tr2}」，但 4D 選了玻璃或液體。`);
    const rr=m.rules.radius||"";if(/直角/.test(rr)&&(has(s,"pa_org")||has(s,"pa_cute")))A("warn",`Stage 2 圓角規則是「${rr}」，但產品外觀偏圓潤。`);if(/大圓|全圓/.test(rr)&&(has(s,"pa_ind")))A("warn",`Stage 2 圓角規則是「${rr}」，但產品外觀選了工業硬朗。`)}
  else A("info","尚未匯入 Stage 2，無法做材質與感官交叉檢查。");
  // Stage 0
  const z=s.s0;
  if(z){const hi=[...items("style3d",s),...items("appearance",s),...items("anim3d",s),...items("mfg",s),...items("prodMat",s),...items("finish",s),...items("displayAnim",s)].filter(i=>i.cost>=4);if(/1 萬以下/.test(z.budget)&&hi.length)A("warn",`Stage 0 品牌預算低於 1 萬港元，但選了成本等級最高的項目（${J2(hi.map(i=>i.zh))}）。`);if(/平價/.test(z.priceTier)&&(has(s,"pa_lux")||has(s,"fn_plate")))A("warn","Stage 0 價格定位是『平價』，但產品外觀或表面處理偏奢華。");
    if(z.delivery.some(x=>/郵寄|速遞/.test(x))&&!has(s,"pt_pack"))A("info","Stage 0 有郵寄或速遞：包裝與保護件（跌落、運輸）建議納入零件與測試。")}
  const costly=[...items("style3d",s),...items("mat3d",s),...items("anim3d",s),...items("appearance",s)].filter(i=>i.cost>=3);if(costly.length>=5)A("info","同時選了 5 項以上成本偏高的項目，請先做小量樣片或灰模確認可行性。");
  return out}

// ---------- 輸出 ----------
function draft(s){const L=(k,n)=>labels(k,s).slice(0,n).join("、")||"［尚未選擇］";const P=d=>{const o=picked(s,d);return o?o.zh:"［未定］"};
  return `${brandName(s)} 的 3D 與產品視覺：3D 風格「${L("style3d",2)}」，材質「${L("mat3d",2)}」，燈光「${L("light3d",1)}」，運鏡「${L("cam3d",2)}」；產品外觀「${L("appearance",2)}」，物料「${L("prodMat",2)}」，表面處理「${L("finish",2)}」，樣機階段「${P("protoStage")}」，CMF「${P("cmfApproval")}」。${count("avoid3d",s)?"禁區："+labels("avoid3d",s).slice(0,4).join("、")+"。":""}`}
function negatives(s){const n=[...labels("avoid3d",s)];if(s.s1)n.push(...s.s1.anti);if(s.s2)n.push(...s.s2.anti,...s.s2.avoid);if(s.s4a)n.push(...s.s4a.avoid);if(s.s4b)n.push(...s.s4b.avoid);if(s.s4c)n.push(...s.s4c.avoid);return [...new Set(n)]}
function renderSpec(s){const P=d=>{const o=picked(s,d);return o?o.zh:null};return {schema:"headx.render-spec/v1",status:"draft",note:"成本、效能與渲染預算為相對等級或你輸入的目標，不是規格；3D 示意不是工程圖。",brand:brandName(s),style:labels("style3d",s),materials:labels("mat3d",s),mascot:labels("mascot",s),scene:labels("scene3d",s),lighting:labels("light3d",s),camera:labels("cam3d",s),animation:labels("anim3d",s),delivery:labels("delivery3d",s),quality:P("quality3d"),lens:P("lens"),background:P("bgKind"),turntable:{policy:P("turntable"),seconds:num(s,"tt_sec",null),calc:turntable(s),reduced_version:P("reduced3d")},render:renderCalc(s),realtime:webMem(s),exploded:exploded(s),mascot_spec:{heads:T_(s,"ma_heads")||null,expressions:num(s,"ma_expr",null),poses:num(s,"ma_pose",null)},display_animation:labels("displayAnim",s),approval:{state:"draft",approved_by:null}}}
function productSpec(s){const P=d=>{const o=picked(s,d);return o?o.zh:null};const pd=productDims(s);
  return {schema:"headx.product-spec/v1",status:"draft-needs-engineer-validation",warning:"本檔案只記錄設計方向，不是工程圖、BOM 或認證文件。結構、材料、製程、電子、認證與測試必須由工程師及合資格專業人士驗證，不能因風格配對而自動批准。",brand:brandName(s),appearance:labels("appearance",s),usage:labels("usage",s),size_class:P("sizeClass"),dimensions_mm:pd?{length:pd.L,width:pd.W,height:pd.H}:null,target_weight_g:pd?pd.wt:null,power:P("powerType"),
   cmf:{approval:P("cmfApproval"),light_source:P("lightBox"),rows:cmfRows(s).map(r=>({role:r.label,hex:r.hex,material:r.mat||null,finish:r.fin||null,sample_id:r.sid||null}))},materials:labels("prodMat",s),finishes:labels("finish",s),processes:labels("mfg",s),parts:labels("parts",s),bom_draft:bomRows(s),
   compliance_reminders:labels("compliance",s),tests_planned:labels("proto",s),prototype_stage:P("protoStage"),supply:P("supply"),sustainability_claims:P("sustainClaim"),ip_status:P("ipStatus"),logo_min_line_mm:num(s,"p_logo_mm",null),notes:T_(s,"st_note")||null,approval:{state:"draft",approved_by:null}}}
function bomCSV(s){const rows=bomRows(s);return "零件,材料,製程,供應商,狀態\n"+rows.map(r=>[r.part,r.mat,r.proc,r.supplier,r.status].map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n")}
function cmfCSV(s){return "角色,HEX,物料,表面處理,色樣編號\n"+cmfRows(s).map(r=>[r.label,r.hex,r.mat,r.fin,r.sid].map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n")}
function prompt3d(s){const L=k=>labels(k,s).join(", ")||"unspecified",P=d=>{const o=picked(s,d);return o?o.zh:"unspecified"};const neg=negatives(s).join(", ")||"none specified";const p=palette(s);const pal=COLS.map(([id,l])=>`${l} ${p[id]||"unspecified"}`).join(", ");
  return `Create a ${picked(s,"quality3d")?P("quality3d")+" ":""}3D render for the brand "${brandName(s)}".\nSubject: ${L("appearance")} product${T_(s,"p_l")?` (about ${T_(s,"p_l")}×${T_(s,"p_w")}×${T_(s,"p_h")} mm)`:""}; used as: ${L("usage")}.\n3D style: ${L("style3d")}; materials: ${L("mat3d")}; product materials: ${L("prodMat")}; finishes: ${L("finish")}.\nColours (physical colour must match approved samples; screen colour is indicative): ${pal}.\nScene: ${L("scene3d")}; background: ${P("bgKind")}; lighting: ${L("light3d")}; camera: ${L("cam3d")}, lens: ${P("lens")}.\n${L("mascot")!=="unspecified"&&!s.mascot.includes("mc_none")?"Character: "+L("mascot")+" ("+(T_(s,"ma_heads")||"unspecified ratio")+")\n":""}Hero shots: 1) ${T_(s,"ps1")||"unspecified"} 2) ${T_(s,"ps2")||"unspecified"} 3) ${T_(s,"ps3")||"unspecified"}.\nNegative constraints (must NOT appear): ${neg}. No fake logos, no gibberish text, no watermarks, no unverified features or claims.\nNote: concept render only; it is not an engineering drawing, not an approved CMF sample, and must not imply untested functions, certifications or health effects.`}
function displayVideoPrompt(s){const L=k=>labels(k,s).join(", ")||"unspecified",P=d=>{const o=picked(s,d);return o?o.zh:"unspecified"};const ex=exploded(s),tr=turntable(s);const neg=negatives(s).join(", ")||"none specified";
  return `Create a product display animation for "${brandName(s)}".\nDisplay style: ${L("displayAnim")}; animation: ${L("anim3d")}; camera moves: ${L("cam3d")}; lighting: ${L("light3d")}; delivery: ${L("delivery3d")}.\n${ex?`Exploded view: ${ex.n} parts, ${ex.st}ms stagger, about ${(ex.total/1000).toFixed(1)} s total; internal structure must match the real product.\n`:""}${tr?`Turntable: ${tr.sec} s per revolution, seamless loop${T_(s,"r_fps")?" at "+T_(s,"r_fps")+" fps":""}.\n`:""}Reduced-motion version: ${P("reduced3d")}.\nNegative constraints (must NOT appear): ${neg}. No flashing faster than 3 times per second. No unverified claims.\nNote: concept only; features, effects and certifications shown must be supported by evidence and approved by a human.`}
function buildGuide(s){const L=k=>labels(k,s),P=d=>{const o=picked(s,d);return o?`${o.zh}（${o.desc}）`:"（未定義）"};const md=[],H=t=>md.push("\n## "+t+"\n");
  md.push(`# ${brandName(s)} · 3D 與產品視覺指南（3d-product-guide）`);md.push(`\n> ${T_(s,"statement")||draft(s)}\n`);md.push("> 草稿，不等於核准。工程規格須由工程師與合資格專業人士驗證；CMF 以實物色樣為準；成本與效能是相對等級；認證與測試要求須向專業人士確認。");
  H("1. 3D 視覺");md.push(`風格：${L("style3d").join("、")||"（未選）"}\n\n材質：${L("mat3d").join("、")||"（未選）"}\n\n場景：${L("scene3d").join("、")||"（未選）"}\n\n燈光：${L("light3d").join("、")||"（未選）"}\n\n運鏡：${L("cam3d").join("、")||"（未選）"}\n\n動畫：${L("anim3d").join("、")||"（未選）"}\n\n交付：${L("delivery3d").join("、")||"（未選）"}\n\n品質：${P("quality3d")}｜焦段：${P("lens")}｜背景：${P("bgKind")}\n\n轉盤：${P("turntable")}\n\n減少動態：${P("reduced3d")}`);
  H("2. 角色／吉祥物");md.push(`${L("mascot").join("、")||"（未選）"}｜頭身比 ${T_(s,"ma_heads")||"—"}｜表情 ${T_(s,"ma_expr")||"—"}｜姿勢 ${T_(s,"ma_pose")||"—"}｜IP：${P("ipStatus")}`);
  H("3. 產品外觀與使用");const pd=productDims(s);md.push(`外觀：${L("appearance").join("、")||"（未選）"}\n\n使用情境：${L("usage").join("、")||"（未選）"}\n\n尺寸等級：${P("sizeClass")}${pd?`\n\n尺寸：${pd.L}×${pd.W}×${pd.H} mm；外框體積約 ${pd.vol.toFixed(0)} cm³${pd.wt!=null?`；目標重量 ${pd.wt} g`:""}`:""}\n\n供電：${P("powerType")}`);
  H("4. CMF（顏色、材料、表面）");md.push(`核准：${P("cmfApproval")}｜光源：${P("lightBox")}`);const cr=cmfRows(s);md.push(cr.length?"\n| 角色 | HEX | 物料 | 表面處理 | 色樣編號 |\n|---|---|---|---|---|\n"+cr.map(r=>`| ${r.label} | ${r.hex} | ${r.mat||"—"} | ${r.fin||"—"} | ${r.sid||"—"} |`).join("\n"):"（尚未填色值）");
  H("5. 物料、製程與零件（須工程師驗證）");md.push(`物料：${L("prodMat").join("、")||"（未選）"}\n\n表面處理：${L("finish").join("、")||"（未選）"}\n\n製程：${L("mfg").join("、")||"（未選）"}\n\n零件：${L("parts").join("、")||"（未選）"}\n\n供應鏈：${P("supply")}`);
  H("6. 認證提醒與測試（須專業人士確認）");md.push(`可能涉及：${L("compliance").join("、")||"（未選）"}\n\n計畫測試：${L("proto").join("、")||"（未選）"}\n\n樣機階段：${P("protoStage")}`);
  H("7. 展示動畫");md.push(`${L("displayAnim").join("、")||"（未選）"}`);const ex=exploded(s);if(ex)md.push(`\n爆炸圖：${ex.n} 個零件，錯開 ${ex.st}ms，約 ${(ex.total/1000).toFixed(1)} 秒`);
  H("8. 永續主張與 IP");md.push(`永續主張：${P("sustainClaim")}\n\nIP：${P("ipStatus")}`);
  H("9. 禁區");md.push(negatives(s).map(x=>"- "+x).join("\n")||"（未定義）");H("10. 3 張代表性渲染");md.push(SHOTS.map(([id,l])=>`- ${l}：${T_(s,id)||"（未填）"}`).join("\n"));return md.join("\n")}
function buildSystem(s){const L=k=>labels(k,s).join("、")||"（未定義）",P=d=>{const o=picked(s,d);return o?o.zh:"（未定義）"};
  return `你是「${brandName(s)}」的 3D 與產品視覺 Agent。所有 3D 渲染方向、角色設定、產品外觀方案、CMF 簡報、展示動畫與生成提示詞，必須遵守以下規範。\n${s.s4a&&s.s4a.statement?"視覺語言（4A）："+s.s4a.statement+"\n":""}${s.s4b&&s.s4b.statement?"表面系統（4B）："+s.s4b.statement+"\n":""}${s.s4c&&s.s4c.statement?"動態影片（4C）："+s.s4c.statement+"\n":""}\n【一句話】${T_(s,"statement")||draft(s)}\n【3D】風格 ${L("style3d")}；材質 ${L("mat3d")}；場景 ${L("scene3d")}；燈光 ${L("light3d")}；運鏡 ${L("cam3d")}；動畫 ${L("anim3d")}；交付 ${L("delivery3d")}；轉盤 ${P("turntable")}；減少動態 ${P("reduced3d")}\n【角色】${L("mascot")}\n【產品】外觀 ${L("appearance")}；使用情境 ${L("usage")}；物料 ${L("prodMat")}；表面處理 ${L("finish")}；製程 ${L("mfg")}；零件 ${L("parts")}\n【CMF】核准 ${P("cmfApproval")}；光源 ${P("lightBox")}\n【展示動畫】${L("displayAnim")}\n\n【絕對禁止】${negatives(s).join("、")||"（未定義）"}\n\n【工作規則】\n1) 工程規格（結構、材料、製程、電子、認證、測試）只可作方向記錄；必須由工程師與合資格專業人士驗證，不可因風格配對而自動批准，不可宣稱已通過任何認證或測試。\n2) CMF 以實物色樣為準；螢幕與渲染的顏色只是示意，不可冒充已核准色。\n3) 不可用 3D 視覺暗示未驗證的功能、療效、防水等級或環保主張；爆炸圖與內部結構須與真實產品一致。\n4) 3D 展示的自動動態須可暫停，並有『減少動態』版本；任何一秒內不得超過 3 次閃光。\n5) 虛擬人與 AI 生成角色須披露；吉祥物與外觀須先確認知識產權；音樂、肖像與素材須先確認授權。\n6) 渲染成本、效能預算與模具成本是相對等級或使用者輸入的目標，不可編造數字；不確定請回報人類。\n7) 遇到規範沒有涵蓋或互相衝突的情況，請回報人類，不要自行決定。\n8) 所有輸出標示為『AI 提案，待人類核准』。`}
function hints(s){const H=[],A=(st,f,t,w)=>H.push({stage:st,field:f,text:t,why:w});const L=k=>labels(k,s).join("、");
  if(s.parts.includes("pt_display")||s.parts.includes("pt_input")||s.parts.includes("pt_haptic"))A("4E UI／UX 與空間體驗","產品介面","把顯示、指示燈、按鍵與震動／聲音回饋轉為介面與操作規範，並測試長者、手套與低視力使用","零件："+L("parts"));
  A("4E UI／UX 與空間體驗","空間與展示","把產品陳列、展台與店內材質對照 CMF 與燈光","產品視覺");
  A("4F 行銷內容與廣告","產品內容","把主視覺、功能特寫、使用情境渲染與展示動畫轉為電商、社群與廣告模板；宣稱須有依據","3 張代表性渲染與展示動畫："+(L("displayAnim")||"未選"));
  A("4G 跨媒體使用與治理","色樣與供應商","登記 CMF 色樣編號與光源、核准者與日期、供應商與版本、IP 檢索與環保證明","CMF 與供應鏈");
  if(s.compliance.length)A("4G 跨媒體使用與治理","認證與合規","建立認證與測試的追蹤表（適用性、機構、狀態、證書到期日）；由合資格專業人士確認","認證提醒："+L("compliance"));
  A("4H 風格庫與 AI 生成契約","風格庫","把 3D 風格、材質、燈光、運鏡與 CMF 存成可重用條目，附 3D Prompt 與負面約束，並標示須人類核准","供 AI 生成使用");
  return H}
function completeness(s){const rows=cmfRows(s),c=[
  ["style","3D 風格與材質",count("style3d",s)>=1&&count("mat3d",s)>=1],["mascot","角色／吉祥物（或選不使用）",count("mascot",s)>=1],["scene","場景、燈光與運鏡",count("scene3d",s)>=1&&count("light3d",s)>=1&&count("cam3d",s)>=1],
  ["anim","3D 動畫與交付形式",count("anim3d",s)>=1&&count("delivery3d",s)>=1],["setup","品質、焦段、背景與轉盤／減少動態",["quality3d","lens","bgKind","turntable","reduced3d"].every(d=>picked(s,d))],
  ["appearance","產品外觀與使用情境",count("appearance",s)>=1&&count("usage",s)>=1&&!!picked(s,"sizeClass")],["dims","尺寸與重量",productDims(s)&&productDims(s).wt!=null],
  ["cmf","5 個色值、CMF 核准與光源",rows.length===5&&!!picked(s,"cmfApproval")&&!!picked(s,"lightBox")],["material","物料、表面處理與製程",count("prodMat",s)>=1&&count("finish",s)>=1&&count("mfg",s)>=1],
  ["parts","工程用料與零件、供電",count("parts",s)>=1&&!!picked(s,"powerType")],["compliance","認證提醒與測試",count("compliance",s)>=1&&count("proto",s)>=1],["proto","樣機階段、供應鏈與 IP",["protoStage","supply","ipStatus","sustainClaim"].every(d=>picked(s,d))],
  ["display","展示動畫",count("displayAnim",s)>=1],["avoid","禁區（至少 3 個）",count("avoid3d",s)>=3],["shots","3 張代表性渲染",!!(T_(s,"ps1")&&T_(s,"ps2")&&T_(s,"ps3"))]];
  const done=c.filter(x=>x[2]).length;return {done,total:c.length,pct:Math.round(done/c.length*100),missing:c.filter(x=>!x[2]).map(x=>({key:x[0],label:x[1]}))}}
function buildBrief(s){const c=completeness(s),pk=k=>items(k,s).map(i=>({id:i.id,name:i.zh,note:i.desc}));const dm={};DIMS.forEach(d=>{const o=picked(s,d.id);if(o)dm[d.id]={id:o.id,name:o.zh,note:o.desc}});const tx={};TEXTS.forEach(t=>{if(T_(s,t.id))tx[t.id]=T_(s,t.id)});
  return {schema:"brand/stage4d-3d-product/v1",status:c.missing.length?"incomplete":"complete",completeness:c.pct,missing:c.missing,approval:{state:"draft",approved_by:null,note:"草稿；AI 提案與表單填寫不等於人類核准；工程規格須由工程師與合資格專業人士驗證；CMF 以實物色樣為準。"},
   stage_context:{stage0:s.s0||null,stage1:s.s1||null,stage2:s.s2||null,stage3:s.s3||null,stage4a:s.s4a||null,stage4b:s.s4b||null,stage4c:s.s4c||null},brand_name:brandName(s),
   three_d:{style:pk("style3d"),materials:pk("mat3d"),mascot:pk("mascot"),scene:pk("scene3d"),lighting:pk("light3d"),camera:pk("cam3d"),animation:pk("anim3d"),delivery:pk("delivery3d"),quality:dm.quality3d||null,lens:dm.lens||null,background:dm.bgKind||null,turntable:dm.turntable||null,reduced_version:dm.reduced3d||null,params:{tt_sec:tx.tt_sec||null,r_w:tx.r_w||null,r_h:tx.r_h||null,r_fps:tx.r_fps||null,r_sec:tx.r_sec||null,r_spf:tx.r_spf||null,r_machines:tx.r_machines||null,w_tri:tx.w_tri||null,w_tex_n:tx.w_tex_n||null,w_tex_px:tx.w_tex_px||null,w_mem:tx.w_mem||null,ma_heads:tx.ma_heads||null,ma_expr:tx.ma_expr||null,ma_pose:tx.ma_pose||null,ex_parts:tx.ex_parts||null,ex_stag:tx.ex_stag||null}},
   product:{appearance:pk("appearance"),usage:pk("usage"),size_class:dm.sizeClass||null,dimensions:{l:tx.p_l||null,w:tx.p_w||null,h:tx.p_h||null,weight_g:tx.p_wt||null,logo_min_line_mm:tx.p_logo_mm||null},power:dm.powerType||null,materials:pk("prodMat"),finishes:pk("finish"),processes:pk("mfg"),parts:pk("parts"),
    cmf:{approval:dm.cmfApproval||null,light_source:dm.lightBox||null,palette:palette(s),rows:s.cmf},bom_draft:tx.bom||null,compliance:pk("compliance"),tests:pk("proto"),prototype_stage:dm.protoStage||null,supply:dm.supply||null,sustainability:dm.sustainClaim||null,ip:dm.ipStatus||null},
   display_animation:pk("displayAnim"),avoid:pk("avoid3d"),combined_negatives:negatives(s),shots:{hero:tx.ps1||null,feature:tx.ps2||null,use:tx.ps3||null},notes:tx.st_note||null,
   statement:{text:T_(s,"statement")||draft(s),source:T_(s,"statement")?"human":"auto-draft"},render_spec:renderSpec(s),product_spec:productSpec(s),prompt_3d:prompt3d(s),display_video_prompt:displayVideoPrompt(s),
   consistency_checks:checks(s),downstream_hints:hints(s),guide_md:buildGuide(s),system_prompt:buildSystem(s),
   agent_rules:["所有 3D 與產品視覺輸出必須符合 system_prompt 與 guide_md。","工程規格（結構、材料、製程、電子、認證、測試）只可作方向記錄，必須由工程師與合資格專業人士驗證，不能因風格配對而自動批准；不可宣稱已通過任何認證或測試。","CMF 以實物色樣為準；螢幕與渲染顏色只是示意。","combined_negatives 中的任何一項都不可出現；不確定時回報人類。","不可用 3D 視覺暗示未驗證的功能、療效、防水等級或環保主張。","自動動態須可暫停並有減少動態版本；任何一秒內不得超過 3 次閃光。","虛擬人與 AI 生成角色須披露；吉祥物、外觀與標誌須先確認知識產權與授權。","consistency_checks 中 level 為 warn 或 error 的項目須先由人類確認，才可進入 4E–4H。","approval.state 為 draft 時，不得視為已核准；不得自行把狀態改為已核准。","status 為 incomplete 時，缺少的欄位不得自行補寫。","本階段不提供風格相符度分數。"]}}

// ---------- 貼回 ----------
function matchItem(k,name){const n=norm(name);if(!n)return null;const L=flat(k);return L.find(i=>i.id===name||norm(i.zh)===n)||L.find(i=>n.length>=2&&(norm(i.zh).includes(n)||(norm(i.zh).length>=2&&n.includes(norm(i.zh)))))||null}
function matchOpt(d,name){const dm=DIM(d);if(!dm)return null;const n=norm(name);return dm.opts.find(o=>o.id===name||norm(o.zh)===n)||dm.opts.find(o=>n.length>=2&&(norm(o.zh).includes(n)||(norm(o.zh).length>=2&&n.includes(norm(o.zh)))))||null}
function extractJSON(text){const f=text.match(/```(?:json)?\s*([\s\S]*?)```/i);return JSON.parse(f?f[1]:text.slice(text.indexOf("{"),text.lastIndexOf("}")+1))}
function normalizeBrief(j){if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4d"))return j;const n=a=>(a||[]).map(x=>x.name);const o={};const t3=j.three_d||{},pr=j.product||{};
  o.style3d=n(t3.style);o.mat3d=n(t3.materials);o.mascot=n(t3.mascot);o.scene3d=n(t3.scene);o.light3d=n(t3.lighting);o.cam3d=n(t3.camera);o.anim3d=n(t3.animation);o.delivery3d=n(t3.delivery);o.appearance=n(pr.appearance);o.usage=n(pr.usage);o.prodMat=n(pr.materials);o.finish=n(pr.finishes);o.mfg=n(pr.processes);o.parts=n(pr.parts);o.compliance=n(pr.compliance);o.proto=n(pr.tests);o.displayAnim=n(j.display_animation);o.avoid3d=n(j.avoid);
  o.dims={};const d=(k,x)=>{if(x)o.dims[k]=x.name};d("quality3d",t3.quality);d("lens",t3.lens);d("bgKind",t3.background);d("turntable",t3.turntable);d("reduced3d",t3.reduced_version);d("sizeClass",pr.size_class);d("powerType",pr.power);d("cmfApproval",(pr.cmf||{}).approval);d("lightBox",(pr.cmf||{}).light_source);d("protoStage",pr.prototype_stage);d("supply",pr.supply);d("sustainClaim",pr.sustainability);d("ipStatus",pr.ip);
  o.text={};const t=(k,x)=>{if(x!=null&&x!=="")o.text[k]=String(x)};const pm=t3.params||{};Object.keys(pm).forEach(k=>t(k,pm[k]));const dd=pr.dimensions||{};t("p_l",dd.l);t("p_w",dd.w);t("p_h",dd.h);t("p_wt",dd.weight_g);t("p_logo_mm",dd.logo_min_line_mm);t("bom",pr.bom_draft);Object.entries((pr.cmf||{}).palette||{}).forEach(([k,v])=>t(k,v));const sh=j.shots||{};t("ps1",sh.hero);t("ps2",sh.feature);t("ps3",sh.use);t("st_note",j.notes);t("brandName",j.brand_name);if(j.statement&&j.statement.source==="human")t("statement",j.statement.text);o.cmf=(pr.cmf||{}).rows||{};return o}
function applyPaste(text,s){const out={applied:[],custom:[],errors:[]};let j;
  try{j=normalizeBrief(extractJSON(text))}catch(e){out.errors.push("找不到可解析的 JSON 區塊（請連同 ```json 區塊一起貼上）");return out}
  CAT_KEYS.forEach(k=>{if(!Array.isArray(j[k]))return;const ids=[],cu=[];j[k].forEach(n=>{const m=matchItem(k,n);if(m){if(!ids.includes(m.id))ids.push(m.id)}else if(String(n).trim()&&!cu.includes(String(n).trim()))cu.push(String(n).trim())});s[k]=ids;s.custom[k]=cu;out.applied.push(`${CAT[k].title.replace(/（.*/,"")}：${ids.length} 項`+(cu.length?`＋自訂 ${cu.length} 項`:""));cu.forEach(c=>out.custom.push(c))});
  const dd=Object.assign({},j.dims||{});DIMS.forEach(d=>{if(typeof j[d.id]==="string"||(j[d.id]&&j[d.id].name))dd[d.id]=typeof j[d.id]==="string"?j[d.id]:j[d.id].name});let c=0;Object.entries(dd).forEach(([d,v])=>{if(!DIM(d))return;const o=matchOpt(d,v);if(o){s.dims[d]=o.id;c++}else out.errors.push(`「${d}」的值「${v}」不在清單內，未套用`)});if(c)out.applied.push(`單選規則：${c} 項`);
  const tx=Object.assign({},j.text||{});TEXTS.forEach(t=>{if(typeof j[t.id]==="string"||typeof j[t.id]==="number")tx[t.id]=j[t.id]});let tc=0;Object.entries(tx).forEach(([k,v])=>{if(TEXT_BY[k]&&(typeof v==="string"||typeof v==="number")){s.text[k]=String(v);tc++}});if(tc)out.applied.push(`文字欄：${tc} 項`);
  if(j.cmf&&typeof j.cmf==="object"&&!Array.isArray(j.cmf)){Object.entries(j.cmf).forEach(([k,v])=>{if(COLS.some(x=>x[0]===k)&&v&&typeof v==="object")s.cmf[k]={mat:v.mat||"",fin:v.fin||"",sid:v.sid||""}});out.applied.push("CMF 表")}
  if(!out.applied.length)out.errors.push("JSON 內沒有可辨識的欄位");return out}
