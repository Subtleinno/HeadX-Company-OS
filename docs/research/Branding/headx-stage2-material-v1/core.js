
const KEY="brand_stage2_v1",S1KEY="brand_brief_stage1";
const emptyState=()=>{const s={statement:"",s1:null,rules:{}};MAT_KEYS.forEach(k=>{s[k]=[];s[k+"Note"]=""});s.custom={};MAT_KEYS.forEach(k=>s.custom[k]=[]);return s};
function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||"null");const e=emptyState();if(!s)return autoS1(e);const m=Object.assign(e,s,{custom:Object.assign(e.custom,s.custom||{}),rules:s.rules||{}});return autoS1(m)}catch(x){return autoS1(emptyState())}}
function autoS1(s){try{const raw=localStorage.getItem(S1KEY);if(raw&&!s.s1){const p=parseS1(raw);if(p)s.s1=p}}catch(x){}return s}
function save(s){try{localStorage.setItem(KEY,JSON.stringify(s))}catch(x){}}
const flat=k=>CAT[k].groups.flatMap(g=>g.items);
const byId=(k,id)=>flat(k).find(i=>i.id===id);
const labels=(k,s)=>[...s[k].map(id=>(byId(k,id)||{zh:id}).zh),...s.custom[k]];
const items=(k,s)=>[...s[k].map(id=>byId(k,id)||{id,zh:id,desc:"",sw:"",t:[]}),...s.custom[k].map(t=>({id:"custom",zh:t,desc:"（自訂）",sw:"",t:[]}))];
const count=(k,s)=>s[k].length+s.custom[k].length;
const rulesDone=s=>DIMS.filter(d=>s.rules[d.id]).length;
const norm=t=>String(t||"").replace(/\s+/g,"").toLowerCase();

function parseS1(text){let j;try{j=typeof text==="string"?JSON.parse(text):text}catch(e){return null}
  if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage1"))return null;
  const n=a=>(a||[]).map(x=>x.name);
  return {name:j.brand_name||"",statement:(j.positioning_statement||{}).text||"",tension:(j.core_tension||{}).primary||"",
    dials:((j.core_tension||{}).dials||[]).map(d=>({id:d.id,left:d.left,right:d.right,position:d.position})),
    anti:n(j.anti_persona),audience:n((j.best_fit_customers||{}).segments),pain:n((j.pain_points||{}).items)}}
function s1Text(s){const p=s.s1;if(!p)return "（尚未匯入 Stage 1；請先完成 Stage 1，或匯入 brand-brief.json）";
  return [`品牌：${p.name||"（尚未命名）"}`,`定位宣言：${p.statement||"（無）"}`,`最適客群：${p.audience.join("、")||"（無）"}`,`痛點：${p.pain.join("、")||"（無）"}`,`核心張力：${p.tension||"（無）"}`,
   `張力刻度：${p.dials.map(d=>`${d.left}↔${d.right}=${d.position}`).join("；")||"（無）"}`,`Stage 1 的絕對不要像：${p.anti.join("、")||"（無）"}`].join("\n")}

// ---- 規則 → 設計 token ----
function buildTokens(s){
  const t={},pick=(d)=>{const id=s.rules[d];return id?OPT(d,id):null};
  const den=pick("density"),sur=pick("surface"),bor=pick("border"),rad=pick("radius"),ele=pick("elevation"),tra=pick("transparency"),con=pick("contrast"),mot=pick("motion"),img=pick("imagery");
  if(den)Object.assign(t,den.tok);
  if(sur){t["--surface-bg"]=sur.tok.bg;t["--surface-border"]=sur.tok.border;t["--surface-shadow"]=sur.tok.shadow;t["--surface-blur"]=sur.tok.blur}
  if(bor)t["--surface-border"]=bor.tok.border;
  if(ele)t["--surface-shadow"]=ele.tok.shadow;
  if(tra){t["--surface-alpha"]=tra.tok.alpha;t["--surface-blur"]=tra.tok.blur}
  if(rad)Object.assign(t,rad.tok);
  if(con)Object.assign(t,con.tok);
  if(mot)Object.assign(t,mot.tok);
  if(img)Object.assign(t,img.tok);
  return t;
}
const tokensCSS=s=>{const t=buildTokens(s);return ":root{\n"+Object.entries(t).map(([k,v])=>`  ${k.startsWith("--")?k:"--surface-"+k}:${v};`).join("\n")+"\n}\n"};

// ---- 一致性檢查（含 Stage 1 交叉檢查）----
const ANTI_TAG={"冰冷醫院感":["clinical","cold"],"過度科技炫技":["neon","loud"],"陰暗沉重":["dark"],"過度幼稚":["playful"],"炫富浮誇":["loud","luxe"],"廉價模板感":["cheap"],"素材庫假照片":[],"推銷式連鎖美容院":["loud"],"純科技冷硬品牌":["cold","neon","hard"]};
function selectedTags(s){const out={};["material","light","atmosphere"].forEach(k=>items(k,s).forEach(i=>(i.t||[]).forEach(t=>{(out[t]=out[t]||[]).push(i.zh)})));
  const sur=s.rules.surface;if(sur==="frosted")(out.soft=out.soft||[]).push("磨砂玻璃（表面）");if(sur==="hard")(out.hard=out.hard||[]).push("硬朗邊框（表面）");
  if(s.rules.motion==="spring")(out.energetic=out.energetic||[]).push("彈性回彈（動態）");return out}
function checks(s){
  const out=[],tags=selectedTags(s),A=(l,m)=>out.push({level:l,msg:m});
  const both=s.keywords.filter(k=>{const a=byId("keywords",k),b=flat("antiKeywords").find(x=>norm(x.zh)===norm(a&&a.zh));return b&&s.antiKeywords.includes(b.id)});
  both.forEach(k=>A("error",`「${byId("keywords",k).zh}」同時出現在情緒關鍵字與反關鍵字`));
  s.avoidMaterials.length&&s.material.forEach(m=>{const mm=byId("material",m);const clash={cheap:"v_cheapplastic",neon:"v_neon",loud:"v_mirror",luxe:"v_gold"};(mm.t||[]).forEach(t=>{if(clash[t]&&s.avoidMaterials.includes(clash[t]))A("warn",`主材質「${mm.zh}」帶有「${t}」特質，可能接近你列為禁區的「${byId("avoidMaterials",clash[t]).zh}」`)})});
  if(s.rules.surface==="neumorph")A("warn","新擬態的邊界對比通常達不到 WCAG 非文字 3:1，互動元件須另加邊框或對比色。");
  if((s.rules.surface==="frosted"||["frost","glass"].includes(s.rules.transparency))&&s.rules.contrast==="low")A("warn","磨砂／玻璃表面搭配低對比：文字對比須以模糊後的實際合成背景測試，建議提高對比或面板不透明度。");
  if(s.rules.transparency==="glass")A("warn","強玻璃感可讀性風險最高，只建議用在非關鍵資訊的裝飾層。");
  if(s.rules.density==="gallery"&&s.rules.surface==="hard")A("warn","畫廊級留白搭配硬朗粗邊框：兩者語氣不同，請確認是有意的對比。");
  const p=s.s1;
  if(p){p.anti.forEach(a=>{const hit=[...new Set((ANTI_TAG[a]||[]).flatMap(t=>tags[t]||[]))];if(hit.length)A("warn",`Stage 1 要避免「${a}」，但你選的 ${hit.join("、")} 容易帶來這種感覺`)});
    p.dials.forEach(d=>{if(d.id==="quiet_bold"&&d.position<=-1&&(tags.loud||tags.neon))A("warn",`Stage 1 傾向「低調克制」，但 ${(tags.loud||tags.neon).join("、")} 偏張揚`);
      if(d.id==="calm_energy"&&d.position<=-1&&tags.energetic)A("warn",`Stage 1 傾向「療癒安靜」，但 ${tags.energetic.join("、")} 偏有活力`);
      if(d.id==="premium_access"&&d.position<=-1&&tags.cheap)A("warn",`Stage 1 傾向「高端」，但 ${tags.cheap.join("、")} 容易顯廉價`);
      if(d.id==="trad_modern"&&d.position>=1&&tags.heritage&&!tags.precise)A("warn",`Stage 1 傾向「當代創新」，但 ${tags.heritage.join("、")} 偏傳統，請加入一個當代元素平衡`)})}
  else A("info","尚未匯入 Stage 1，無法做跨階段檢查。");
  return out}

function draft(s){const J=(k,n)=>labels(k,s).slice(0,n).join("、")||"［尚未選擇］";const name=(s.s1&&s.s1.name)||"［品牌］";
  return `如果 ${name} 是一件物件，它是「${J("material",2)}」做的，摸起來「${J("tactile",3)}」，在「${J("light",1)}」之下，空氣是「${J("atmosphere",1)}」，給人「${J("keywords",5)}」的感覺。`}
function completeness(s){const c=[
  ["material","物理材質",count("material",s)>=1],["tactile","觸感（至少 2 個）",count("tactile",s)>=2],["light","光線感",count("light",s)>=1],["atmosphere","空氣與氛圍",count("atmosphere",s)>=1],
  ["motionsound","動態與聲音（至少 2 個）",count("motionsound",s)>=2],["keywords","情緒關鍵字（5 個）",count("keywords",s)===5],["antiKeywords","反關鍵字（至少 3 個）",count("antiKeywords",s)>=3],
  ["avoidMaterials","物理禁區（至少 2 個）",count("avoidMaterials",s)>=2],["rules","視覺物理規則（9 項全選）",rulesDone(s)===DIMS.length]];
  const done=c.filter(x=>x[2]).length;return {done,total:c.length,pct:Math.round(done/c.length*100),missing:c.filter(x=>!x[2]).map(x=>({key:x[0],label:x[1]}))}}
function buildBrief(s){const c=completeness(s),pack=k=>items(k,s).map(i=>({id:i.id,name:i.zh,note:i.desc}));
  const rules={};DIMS.forEach(d=>{const o=s.rules[d.id]&&OPT(d.id,s.rules[d.id]);if(o)rules[d.id]={id:o.id,name:o.zh,note:o.desc}});
  return {schema:"brand/stage2-material-sensory/v1",status:c.missing.length?"incomplete":"complete",completeness:c.pct,missing:c.missing,
    stage1_context:s.s1||null,
    material_metaphor:{primary:pack("material"),note:s.materialNote||null},tactile:pack("tactile"),light:pack("light"),atmosphere:pack("atmosphere"),motion_sound:pack("motionsound"),
    mood_keywords:pack("keywords"),anti_keywords:pack("antiKeywords"),avoid_materials:pack("avoidMaterials"),
    sensory_statement:{text:s.statement||draft(s),source:s.statement?"human":"auto-draft"},
    physics_rules:rules,physics_tokens:buildTokens(s),physics_css:tokensCSS(s),
    consistency_checks:checks(s),
    agent_rules:["所有介面、圖片與文案決策必須符合 sensory_statement 與 mood_keywords。","anti_keywords 與 avoid_materials 中的任何一項都不可出現；不確定時回報人類。","介面元件只可使用 physics_tokens 內的數值（圓角、陰影、模糊、動態），不可自行發明。","consistency_checks 中 level 為 warn 或 error 的項目須先由人類確認，才可進入下一階段。","status 為 incomplete 時，缺少的欄位不得自行補寫。"]}}
function matchItem(k,name){const n=norm(name);if(!n)return null;const L=flat(k);return L.find(i=>i.id===name||norm(i.zh)===n)||L.find(i=>n.length>=2&&(norm(i.zh).includes(n)||(norm(i.zh).length>=2&&n.includes(norm(i.zh)))))||null}
function matchOpt(dim,name){const n=norm(name),L=DIM(dim).opts;return L.find(o=>o.id===name||norm(o.zh)===n)||L.find(o=>n.length>=2&&(norm(o.zh).includes(n)||(norm(o.zh).length>=2&&n.includes(norm(o.zh)))))||null}
function extractJSON(text){const f=text.match(/```(?:json)?\s*([\s\S]*?)```/i);return JSON.parse(f?f[1]:text.slice(text.indexOf("{"),text.lastIndexOf("}")+1))}
function normalizeBrief(j){if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage2"))return j;const n=a=>(a||[]).map(x=>x.name);const o={};
  o.material=n(j.material_metaphor&&j.material_metaphor.primary);o.tactile=n(j.tactile);o.light=n(j.light);o.atmosphere=n(j.atmosphere);o.motion_sound=n(j.motion_sound);o.keywords=n(j.mood_keywords);o.anti_keywords=n(j.anti_keywords);o.avoid_materials=n(j.avoid_materials);
  o.rules={};Object.entries(j.physics_rules||{}).forEach(([k,v])=>o.rules[k]=v.name);if(j.sensory_statement&&j.sensory_statement.source==="human")o.sensory_statement=j.sensory_statement.text;
  if(j.material_metaphor&&j.material_metaphor.note)o.material_note=j.material_metaphor.note;return o}
function applyPaste(text,s){const out={applied:[],custom:[],errors:[]};let j;
  try{j=normalizeBrief(extractJSON(text))}catch(e){out.errors.push("找不到可解析的 JSON 區塊（請連同 ```json 區塊一起貼上）");return out}
  const map={material:"material",materials:"material",tactile:"tactile",light:"light",atmosphere:"atmosphere",motion_sound:"motionsound",keywords:"keywords",mood_keywords:"keywords",anti_keywords:"antiKeywords",avoid_materials:"avoidMaterials"};
  Object.entries(map).forEach(([jk,k])=>{if(!Array.isArray(j[jk]))return;const ids=[],cu=[];
    j[jk].forEach(n=>{const m=matchItem(k,n);if(m){if(!ids.includes(m.id))ids.push(m.id)}else if(String(n).trim()&&!cu.includes(String(n).trim()))cu.push(String(n).trim())});
    s[k]=ids;s.custom[k]=cu;out.applied.push(`${CAT[k].title.replace(/（.*/,"")}：${ids.length} 項`+(cu.length?`＋自訂 ${cu.length} 項`:""));cu.forEach(c=>out.custom.push(c))});
  if(j.rules&&typeof j.rules==="object"){let c=0;Object.entries(j.rules).forEach(([d,v])=>{if(!DIM(d))return;const o=matchOpt(d,typeof v==="object"?v.name:v);if(o){s.rules[d]=o.id;c++}else out.errors.push(`規則「${d}」的值「${v}」不在清單內，未套用`)});if(c)out.applied.push(`物理規則：${c} 項`)}
  if(typeof j.material_note==="string"){s.materialNote=j.material_note;out.applied.push("材質補充")}
  if(typeof j.sensory_statement==="string"&&j.sensory_statement.trim()){s.statement=j.sensory_statement.trim();out.applied.push("感官一句話")}
  if(!out.applied.length)out.errors.push("JSON 內沒有可辨識的欄位");return out}
