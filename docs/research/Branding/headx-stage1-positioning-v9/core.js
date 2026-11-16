
const KEY="brand_stage1_v9";
const emptyState=()=>{const c={};CAT_KEYS.forEach(k=>c[k]=[]);const s={name:"",statement:"",tensionPrimary:"",dials:{}};CAT_KEYS.forEach(k=>{s[k]=[];s[k+"Note"]=""});s.custom=c;return s};
function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||"null");if(!s)return emptyState();const e=emptyState();return Object.assign(e,s,{custom:Object.assign(e.custom,s.custom||{})})}catch(x){return emptyState()}}
function save(s){try{localStorage.setItem(KEY,JSON.stringify(s))}catch(x){}}
const flat=k=>CAT[k].groups.flatMap(g=>g.items);
const byId=(k,id)=>flat(k).find(i=>i.id===id);
const labels=(k,s)=>[...s[k].map(id=>(byId(k,id)||{zh:id}).zh),...s.custom[k]];
const items=(k,s)=>[...s[k].map(id=>byId(k,id)||{id,zh:id,desc:""}),...s.custom[k].map(t=>({id:"custom",zh:t,desc:"（自訂）"}))];
const count=(k,s)=>s[k].length+s.custom[k].length;
const dialCount=s=>Object.keys(s.dials).length;
const tensionName=s=>(TENSIONS.find(t=>t.id===s.tensionPrimary)||{}).zh||"";

function draft(s){
  const J=(k,n=2)=>labels(k,s).slice(0,n).join("、")||"［尚未選擇］";
  const brand=s.name||"［品牌名稱］";
  return `對於「${J("audience")}」，當他們面對「${J("pain")}」時，${brand} 是一個「${J("category",1)}」，以「${J("diff")}」為特色，替客人帶來「${J("value")}」，因為我們有「${J("rtb",1)}」。`;
}
function completeness(s){
  const checks=[
    ["audience","你服務誰",count("audience",s)>=1],
    ["pain","痛點",count("pain",s)>=1],
    ["alternatives","現有替代方案",count("alternatives",s)>=1],
    ["diff","獨特屬性",count("diff",s)>=1],
    ["value","價值",count("value",s)>=1],
    ["category","市場類別",count("category",s)>=1],
    ["rtb","信任理由",count("rtb",s)>=1],
    ["tension","核心張力（1 個主張力 + 至少 3 個刻度）",!!s.tensionPrimary&&dialCount(s)>=3],
    ["anti","Anti-Persona（至少 3 項）",count("anti",s)>=3]
  ];
  const done=checks.filter(c=>c[2]).length;
  return {done,total:checks.length,missing:checks.filter(c=>!c[2]).map(c=>({key:c[0],label:c[1]})),pct:Math.round(done/checks.length*100)};
}
function buildBrief(s){
  const c=completeness(s),pack=k=>items(k,s).map(i=>({id:i.id,name:i.zh,note:i.desc}));
  const dials=Object.entries(s.dials).map(([id,v])=>{const d=DIALS.find(x=>x.id===id);return d?{id,left:d.l,right:d.r,position:v,meaning:DIAL_POS.find(p=>p.v===v).t}:null}).filter(Boolean);
  const statement=s.statement||draft(s);
  return {schema:"brand/stage1-positioning/v3",status:c.missing.length?"incomplete":"complete",completeness:c.pct,missing:c.missing,
    brand_name:s.name||null,
    best_fit_customers:{segments:pack("audience"),note:s.audienceNote||null},
    pain_points:{items:pack("pain"),note:s.painNote||null},
    competitive_alternatives:pack("alternatives"),
    unique_attributes:pack("diff"),value:{items:pack("value"),note:s.valueNote||null},
    market_category:pack("category"),reasons_to_believe:{items:pack("rtb"),note:s.rtbNote||null},
    positioning_statement:{text:statement,source:s.statement?"human":"auto-draft"},
    core_tension:{primary:tensionName(s)||null,dials},
    anti_persona:pack("anti"),
    agent_rules:[
      "所有文案、視覺與介面決策必須符合 positioning_statement。",
      "core_tension.primary 兩端都要成立，不可偏向其中一端。",
      "anti_persona 中的任何一項都不可出現；若不確定，回報人類而不是自行判斷。",
      "status 為 incomplete 時，缺少的欄位（missing）不得自行補寫，須回報人類。"]};
}
const norm=t=>String(t||"").replace(/\s+/g,"").toLowerCase();
function matchItem(k,name){const n=norm(name);if(!n)return null;const L=flat(k);
  return L.find(i=>i.id===name||norm(i.zh)===n)||L.find(i=>n.length>=2&&(norm(i.zh).includes(n)||(norm(i.zh).length>=2&&n.includes(norm(i.zh)))))||null}
function extractJSON(text){
  const fence=text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const cand=fence?fence[1]:text.slice(text.indexOf("{"),text.lastIndexOf("}")+1);
  return JSON.parse(cand);
}
function normalizeBrief(j){
  if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage1-positioning"))return j;
  const n=a=>(a||[]).map(x=>x.name);const o={};
  o.audience=n(j.best_fit_customers&&j.best_fit_customers.segments);o.audience_note=j.best_fit_customers&&j.best_fit_customers.note||"";
  o.pain=n(j.pain_points&&j.pain_points.items);o.pain_note=j.pain_points&&j.pain_points.note||"";
  o.alternatives=n(j.competitive_alternatives);o.differentiators=n(j.unique_attributes);
  o.value=n(j.value&&j.value.items);o.value_note=j.value&&j.value.note||"";o.category=n(j.market_category);
  o.rtb=n(j.reasons_to_believe&&j.reasons_to_believe.items);o.rtb_note=j.reasons_to_believe&&j.reasons_to_believe.note||"";
  o.anti=n(j.anti_persona);if(j.brand_name)o.name=j.brand_name;
  if(j.positioning_statement&&j.positioning_statement.source==="human")o.statement=j.positioning_statement.text;
  if(j.core_tension){if(j.core_tension.primary)o.tension_primary=j.core_tension.primary;o.dials={};(j.core_tension.dials||[]).forEach(d=>o.dials[d.id]=d.position)}
  return o;
}
function applyPaste(text,s){
  const out={applied:[],custom:[],errors:[]};let j;
  try{j=normalizeBrief(extractJSON(text))}catch(e){out.errors.push("找不到可解析的 JSON 區塊（請連同 ```json 區塊一起貼上）");return out}
  const map={audience:"audience",pain:"pain",alternatives:"alternatives",differentiators:"diff",unique_attributes:"diff",value:"value",category:"category",market_category:"category",rtb:"rtb",reasons_to_believe:"rtb",anti:"anti",anti_persona:"anti"};
  Object.entries(map).forEach(([jk,k])=>{
    if(!Array.isArray(j[jk]))return;
    const ids=[],cust=[];
    j[jk].forEach(n=>{const m=matchItem(k,n);if(m){if(!ids.includes(m.id))ids.push(m.id)}else if(String(n).trim()&&!cust.includes(String(n).trim()))cust.push(String(n).trim())});
    s[k]=ids;s.custom[k]=cust;out.applied.push(`${CAT[k].title.replace(/[？（].*/,"")}：${ids.length} 項`+(cust.length?`＋自訂 ${cust.length} 項`:""));cust.forEach(c=>out.custom.push(c));
  });
  const notes={audience_note:"audienceNote",pain_note:"painNote",value_note:"valueNote",rtb_note:"rtbNote"};
  Object.entries(notes).forEach(([jk,sk])=>{if(typeof j[jk]==="string"){s[sk]=j[jk];out.applied.push(jk)}});
  if(typeof j.statement==="string"&&j.statement.trim()){s.statement=j.statement.trim();out.applied.push("定位宣言")}
  if(typeof j.name==="string"&&j.name.trim()){s.name=j.name.trim();out.applied.push("品牌名稱")}
  if(j.tension_primary){const n=norm(j.tension_primary);const t=TENSIONS.find(t=>t.id===j.tension_primary||norm(t.zh)===n)||TENSIONS.find(t=>n.length>=3&&norm(t.zh).includes(n));if(t){s.tensionPrimary=t.id;out.applied.push("核心張力："+t.zh)}else out.errors.push("核心張力「"+j.tension_primary+"」不在清單內，未套用")}
  if(j.dials&&typeof j.dials==="object"){let c=0;Object.entries(j.dials).forEach(([id,v])=>{const d=DIALS.find(x=>x.id===id);const n=Math.round(Number(v));if(d&&n>=-2&&n<=2){s.dials[id]=n;c++}});if(c)out.applied.push(`張力刻度：${c} 個`)}
  if(!out.applied.length)out.errors.push("JSON 內沒有可辨識的欄位");
  return out;
}
