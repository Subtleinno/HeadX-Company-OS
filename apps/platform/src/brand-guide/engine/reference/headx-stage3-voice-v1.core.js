
const KEY="brand_stage3_v1";
const norm=t=>String(t||"").replace(/\s+/g,"").toLowerCase();
const emptyState=()=>{const s={s1:null,s2:null,dials:{},sit:{},pick:{lang:{},words:{},patterns:{}},yes:["","",""],no:["","",""],statement:"",custom:{}};CAT_KEYS.forEach(k=>{s[k]=[];s.custom[k]=[]});return s};
function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||"null");const e=emptyState();if(!s)return e;const m=Object.assign(e,s);m.custom=Object.assign(e.custom,s.custom||{});m.pick=Object.assign(e.pick,s.pick||{});m.dials=s.dials||{};m.sit=s.sit||{};m.yes=(s.yes||e.yes).concat(["","",""]).slice(0,3);m.no=(s.no||e.no).concat(["","",""]).slice(0,3);return m}catch(x){return emptyState()}}
function save(s){try{localStorage.setItem(KEY,JSON.stringify(s))}catch(x){}}
const flat=k=>CAT[k].groups.flatMap(g=>g.items);
const byId=(k,id)=>flat(k).find(i=>i.id===id);
const labels=(k,s)=>[...s[k].map(id=>(byId(k,id)||{zh:id}).zh),...s.custom[k]];
const items=(k,s)=>[...s[k].map(id=>byId(k,id)||{id,zh:id,desc:"",t:[]}),...s.custom[k].map(t=>({id:"custom",zh:t,desc:"（自訂）",t:[]}))];
const count=(k,s)=>s[k].length+s.custom[k].length;
const DIM=(set,id)=>SETS[set].dims.find(d=>d.id===id);
const OPT=(set,dim,id)=>((DIM(set,dim)||{opts:[]}).opts.find(o=>o.id===id));
const picked=(s,set,dim)=>{const id=s.pick[set][dim];return id?OPT(set,dim,id):null};
const setDone=(s,set)=>Object.keys(s.pick[set]).filter(d=>DIM(set,d)&&OPT(set,d,s.pick[set][d])).length;
const dialDone=s=>Object.keys(s.dials).length,sitDone=s=>Object.keys(s.sit).length;
const SH=id=>SHIFTS.find(x=>x.id===id);
const bannedWords=s=>labels("banned",s);
const groupCount=(s,gName)=>{const g=CAT.banned.groups.find(x=>x.g.includes(gName));return g?g.items.filter(i=>s.banned.includes(i.id)).length:0};
const persTags=s=>[...new Set(items("personality",s).flatMap(i=>i.t||[]))];
const emojiRe=/\p{Extended_Pictographic}/gu;

// ---------- Stage 1 / 2 匯入 ----------
function parseS1(text){let j;try{j=typeof text==="string"?JSON.parse(text):text}catch(e){return null}
  if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage1"))return null;const n=a=>(a||[]).map(x=>x.name);
  return {name:j.brand_name||"",statement:(j.positioning_statement||{}).text||"",tension:(j.core_tension||{}).primary||"",dials:((j.core_tension||{}).dials||[]).map(d=>({id:d.id,left:d.left,right:d.right,position:d.position})),anti:n(j.anti_persona),audience:n((j.best_fit_customers||{}).segments),pain:n((j.pain_points||{}).items)}}
function parseS2(text){let j;try{j=typeof text==="string"?JSON.parse(text):text}catch(e){return null}
  if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage2"))return null;const n=a=>(a||[]).map(x=>x.name);
  return {statement:(j.sensory_statement||{}).text||"",keywords:n(j.mood_keywords),anti:n(j.anti_keywords),material:n((j.material_metaphor||{}).primary)}}
function ctxStages(s){const a=s.s1?[`【Stage 1 定位】品牌：${s.s1.name||"（尚未命名）"}｜宣言：${s.s1.statement||"（無）"}｜最適客群：${s.s1.audience.join("、")||"（無）"}｜核心張力：${s.s1.tension||"（無）"}｜張力刻度：${s.s1.dials.map(d=>`${d.left}↔${d.right}=${d.position}`).join("；")||"（無）"}｜絕對不要像：${s.s1.anti.join("、")||"（無）"}`]:["【Stage 1 定位】（尚未匯入）"];
  a.push(s.s2?`【Stage 2 感官】感官宣言：${s.s2.statement||"（無）"}｜情緒關鍵字：${s.s2.keywords.join("、")||"（無）"}｜反關鍵字：${s.s2.anti.join("、")||"（無）"}`:"【Stage 2 感官】（尚未匯入）");return a.join("\n")}

// ---------- 文案檢查器 ----------
function checkText(text,s){
  const issues=[],hits=[],A=(l,m)=>issues.push({level:l,msg:m});
  const t=String(text||"");const sentences=t.split(/[。！？!?\n]+/).map(x=>x.trim()).filter(Boolean);
  const stats={chars:t.replace(/\s/g,"").length,sentences:sentences.length,avg:sentences.length?Math.round(sentences.reduce((a,x)=>a+x.length,0)/sentences.length):0,exclaims:(t.match(/[！!]/g)||[]).length,emoji:(t.match(emojiRe)||[]).length};
  if(!stats.chars)return {issues,hits,stats};
  const seen={};bannedWords(s).forEach(w=>{if(!w)return;const re=new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"gi");let m;while((m=re.exec(t))){hits.push({word:w,idx:m.index,len:m[0].length});seen[w]=(seen[w]||0)+1}});
  Object.entries(seen).forEach(([w,n])=>A("error",`出現禁用詞「${w}」×${n}`));
  const abs=t.match(/(保證|100\s?%|百分之百|根治|永久|立即見效|立竿見影|絕對)/g);if(abs&&!abs.some(a=>seen[a]))A("warn",`含絕對化說法「${[...new Set(abs)].join("、")}」（未在你的禁用詞內，建議加入或改寫）`);
  const pr=s.pick.lang.pronoun,sc=s.pick.lang.script,ex=s.pick.lang.exclaim,em=s.pick.lang.emoji,mx=s.pick.lang.mixing,sl=s.pick.lang.sentence;
  if((pr==="wo_nin"||pr==="benyuan_nin")&&/你/.test(t))A("warn",`你的規則是用「您」，但文中出現「你」×${(t.match(/你/g)||[]).length}`);
  if((pr==="wo_ni"||pr==="brand_ni")&&/您/.test(t))A("warn",`你的規則是用「你」，但文中出現「您」×${(t.match(/您/g)||[]).length}`);
  const can=t.match(/[咗嘅喺唔冇啲係咁嚟嘢咪哋]/g);
  if((sc==="written_std"||sc==="hk_written")&&can)A("warn",`規則是書面語，但出現粵語用字「${[...new Set(can)].join("")}」`);
  if(sc==="cantonese"&&!can&&stats.chars>25)A("info","規則是廣東話口語書寫，但這段文字看不到粵語用字");
  if(ex==="never"&&stats.exclaims>0)A("warn",`規則是不用驚嘆號，但出現 ${stats.exclaims} 個`);
  if(ex==="rare"&&stats.exclaims>1)A("warn",`規則是每則最多 1 個驚嘆號，但出現 ${stats.exclaims} 個`);
  if(em==="none"&&stats.emoji>0)A("warn",`規則是不用 Emoji，但出現 ${stats.emoji} 個`);
  if(em==="light"&&stats.emoji>1)A("warn",`規則是偶爾 1 個 Emoji，但出現 ${stats.emoji} 個`);
  if(em==="social"&&stats.emoji>0)A("info",`規則是 Emoji 只在社群貼文用；若這段文字不是社群貼文，請移除 ${stats.emoji} 個 Emoji`);
  if(mx==="allzh"){const w=t.match(/[A-Za-z]{3,}/g);if(w)A("info",`規則是盡量全中文，但出現英文詞：${[...new Set(w)].slice(0,6).join("、")}`)}
  if(sl==="short"&&stats.avg>18)A("warn",`規則是短句（約 15 字內），平均句長為 ${stats.avg} 字`);
  if(sl==="long"&&stats.avg&&stats.avg<18)A("info",`規則是偏長句，平均句長只有 ${stats.avg} 字`);
  if(sl==="medium"&&stats.avg>32)A("warn",`規則是中等句長（約 15–25 字），平均句長為 ${stats.avg} 字`);
  const ds=labels("disclosure",s);if(/(效果|療效|改善|見證|結果)/.test(t)&&ds.length&&!ds.some(d=>t.includes(d)))A("info",`提到效果或結果，但沒有出現你設定的提示句（例如「${ds[0]}」）`);
  return {issues,hits,stats}}

// ---------- 一致性檢查 ----------
function checks(s){
  const out=[],A=(l,m)=>out.push({level:l,msg:m});const D=s.dials,P=s.pick,tags=persTags(s);
  if(tags.includes("bold")&&tags.includes("quiet"))A("info","性格同時有『張揚』與『安靜』特質，請在守護欄說明兩者怎麼平衡。");
  if(D.formal_casual<=-1&&["often","light"].includes(P.lang.emoji))A("warn","語氣偏正式，卻允許 Emoji，兩者可能不協調。");
  if(D.formal_casual<=-1&&["cantonese","mixed"].includes(P.lang.script))A("warn","語氣偏正式，卻選了口語／夾雜寫法。");
  if(D.formal_casual>=1&&P.lang.honorific==="formal")A("warn","語氣偏隨和，卻用正式敬語（敬請、閣下），聽起來會突兀。");
  if(D.serious_funny>=1)["complaint","crisis","health"].forEach(id=>{const x=s.sit[id];if(x==="casual"||x==="uplift")A("warn",`「${SITUATIONS.find(z=>z.id===id).zh}」不建議用「${SH(x).zh}」，風險最高。`)});
  ["complaint","crisis","health"].forEach(id=>{const x=s.sit[id];if((x==="casual"||x==="uplift")&&!(D.serious_funny>=1))A("warn",`「${SITUATIONS.find(z=>z.id===id).zh}」選了「${SH(x).zh}」，這類情境通常需要更冷靜或更嚴謹。`)});
  if(s.sit.health&&s.sit.health!=="compliance")A("warn","「健康／效果相關資訊」建議選「更嚴謹（合規優先）」。");
  if(s.sit.health&&count("disclosure",s)===0)A("warn","你設定了健康資訊情境，但沒有選任何必備提示句。");
  const bl=bannedWords(s).map(norm);Object.entries(P.words).forEach(([d,id])=>{const o=OPT("words",d,id);if(o&&bl.includes(norm(o.zh)))A("error",`用語偏好「${o.zh}」同時是禁用詞。`)});
  if(P.words.w_effect==="w_ef6")A("info","描述效果用「效果」較易被視為承諾，建議搭配提示句，或改用「有助於／支援」。");
  const yy=s.yes.map(x=>x.trim()).filter(Boolean);yy.forEach((t,i)=>{const r=checkText(t,s);r.issues.filter(x=>x.level==="error"||x.level==="warn").forEach(x=>A("error",`「像我們」範例 ${i+1}：${x.msg}`))});
  const p=s.s1;
  if(p){const ant=p.anti.join("｜");
    if(/焦慮|恐嚇|嚇/.test(ant)&&groupCount(s,"恐嚇")<3)A("warn","Stage 1 要避免製造焦慮，但「恐嚇與焦慮」禁用詞選得不足（建議至少 3 個）。");
    if(/誇大|保證|療效/.test(ant)&&(groupCount(s,"絕對保證")<3))A("warn","Stage 1 要避免誇大或保證，但「絕對保證」類禁用詞選得不足（建議至少 3 個）。");
    if(/行話|艱澀/.test(ant)&&groupCount(s,"行話")<2)A("warn","Stage 1 要避免艱澀行話，但「行話與黑話」禁用詞選得不足。");
    if(/促銷|倒數|壓迫/.test(ant)&&groupCount(s,"壓迫")<3)A("warn","Stage 1 要避免促銷壓迫，但「壓迫促銷」禁用詞選得不足（建議至少 3 個）。");
    if(/刻板|性別|年齡/.test(ant)&&groupCount(s,"刻板")<3)A("warn","Stage 1 要避免刻板印象，但「刻板印象與貶義」禁用詞選得不足。");
    if(/說教|權威/.test(ant)&&(tags.includes("authority")||D.expert_peer<=-1))A("warn","Stage 1 要避免說教權威，但你的性格或『專家姿態』刻度偏權威。");
    if(/輕浮/.test(ant)&&D.serious_funny>=1)A("warn","Stage 1 要避免輕浮玩笑，但『嚴肅↔幽默』偏向幽默。");
    if(/浮誇|熱情過度/.test(ant)&&(P.lang.exclaim==="free"||D.enth_fact<=-1))A("warn","Stage 1 要避免浮誇，但驚嘆號規則或『熱情』刻度偏高。");
    p.dials.forEach(d=>{
      if(d.id==="authority_friend"&&d.position>=1&&P.lang.pronoun==="benyuan_nin")A("warn","Stage 1 偏朋友般親近，但自稱用了「本院／您」，距離偏遠。");
      if(d.id==="authority_friend"&&d.position<=-1&&(P.lang.pronoun==="wo_ni"&&P.lang.address==="friend"))A("info","Stage 1 偏專業權威，但自稱／稱呼偏朋友式，請確認。");
      if(d.id==="quiet_bold"&&d.position<=-1&&(P.lang.exclaim==="free"||P.lang.emoji==="often"))A("warn","Stage 1 偏低調克制，但驚嘆號或 Emoji 規則偏張揚。");
      if(d.id==="calm_energy"&&d.position<=-1&&D.enth_fact<=-1)A("warn","Stage 1 偏療癒安靜，但語氣刻度偏熱情洋溢。")})}
  else A("info","尚未匯入 Stage 1，無法做跨階段檢查。");
  const q=s.s2;
  if(q){const K=q.keywords.join("｜"),N=q.anti.join("｜");
    if(/克制|安靜|沉穩|沉靜/.test(K)&&P.lang.exclaim==="free")A("warn","Stage 2 的關鍵字偏克制安靜，但驚嘆號規則是「可以多用」。");
    if(/精準|精密/.test(K)&&D.plain_poetic>=1)A("info","Stage 2 有「精準」，而語氣刻度偏詩意，資訊類內容請維持平實。");
    if(/詩意/.test(K)&&D.plain_poetic<=-1)A("info","Stage 2 有「詩意」，而語氣刻度偏平實。");
    if(/俐落/.test(K)&&P.lang.sentence==="long")A("info","Stage 2 有「俐落」，而句長規則偏長。");
    if(/(親切|溫暖|溫潤)/.test(K)&&P.lang.pronoun==="benyuan_nin")A("info","Stage 2 的關鍵字偏溫暖親切，自稱「本院」會拉開距離。");
    if(/浮誇|吵鬧/.test(N)&&(P.lang.exclaim==="free"||P.lang.emoji==="often"))A("warn","Stage 2 反關鍵字有浮誇／吵鬧，但驚嘆號或 Emoji 規則偏張揚。");
    if(/幼稚/.test(N)&&P.lang.emoji==="often")A("warn","Stage 2 反關鍵字有「幼稚」，但 Emoji 規則是「常用」。")}
  else A("info","尚未匯入 Stage 2，無法做感官一致性檢查。");
  return out}

// ---------- 產出 ----------
const J=(a,n,fb="［尚未選擇］")=>(a.slice(0,n).join("、"))||fb;
function draft(s){
  const pr=picked(s,"lang","pronoun"),sc=picked(s,"lang","script"),sl=picked(s,"lang","sentence");
  const pairs=labels("pairs",s);const co=SH(s.sit.complaint),he=SH(s.sit.health);
  return `我們說話${J(labels("personality",s),4)}。${pairs.length?pairs.join("；")+"。":""}我們用「${pr?pr.zh:"［人稱］"}」說話，以${sc?sc.zh:"［寫法］"}寫作${sl?"，"+sl.zh:""}；遇到投訴，我們${co?co.zh:"［未設定］"}；遇到健康資訊，我們${he?he.zh:"［未設定］"}。`}
function sitTable(s){return SITUATIONS.map(x=>({id:x.id,situation:x.zh,tone:s.sit[x.id]?SH(s.sit[x.id]).zh:null,note:s.sit[x.id]?SH(s.sit[x.id]).desc:null}))}
function dialRows(s){return DIALS.filter(d=>s.dials[d.id]!==undefined).map(d=>{const v=s.dials[d.id];return {id:d.id,left:d.l,right:d.r,position:v,meaning:DIAL_POS.find(p=>p.v===v).t,example:v<0?d.ls:v>0?d.rs:`（取中間）${d.ls}｜${d.rs}`}})}
function setRows(s,set){return DIM_LIST(set).map(d=>{const o=picked(s,set,d.id);return o?{id:d.id,title:d.title,choice:o.zh,note:o.desc,example:o.sample||""}:null}).filter(Boolean)}
const DIM_LIST=set=>SETS[set].dims;
function buildGuide(s){
  const nm=(s.s1&&s.s1.name)||"品牌",st=s.statement||draft(s),L=(k)=>labels(k,s);
  const md=[];const H=(t)=>md.push("\n## "+t+"\n");
  md.push(`# ${nm} · 語氣與語言指南（voice-guide）`);md.push(`\n> ${st}\n`);
  if(s.s1&&s.s1.statement)md.push(`定位：${s.s1.statement}`);if(s.s2&&s.s2.statement)md.push(`\n感官：${s.s2.statement}`);
  H("1. 聲音（Voice）：永遠不變的部分");md.push(`性格：${L("personality").join("、")||"（未定義）"}`);if(L("pairs").length)md.push("\n守護欄：\n"+L("pairs").map(x=>"- "+x).join("\n"));
  H("2. 語氣刻度（NN/g 四維度＋實務維度）");const dr=dialRows(s);md.push(dr.length?dr.map(r=>`- ${r.left} ↔ ${r.right}：${r.meaning}\n  - 範例：${r.example}`).join("\n"):"（未定義）");
  H("3. 語言規則");const lr=setRows(s,"lang");md.push(lr.length?lr.map(r=>`- ${r.title}：**${r.choice}**${r.example?`　例：${r.example.replace(/\n/g," / ")}`:""}`).join("\n"):"（未定義）");
  H("4. 情境語氣（Tone 隨情境調整）");md.push("| 情境 | 語氣調整 | 說明 |\n|---|---|---|\n"+sitTable(s).map(r=>`| ${r.situation} | ${r.tone||"（未設定）"} | ${r.note||""} |`).join("\n"));
  H("5. 用語偏好");const wr=setRows(s,"words");md.push(wr.length?wr.map(r=>`- ${r.title}：說「${r.choice}」`).join("\n"):"（未定義）");
  H("6. 寫作模式");const pr=setRows(s,"patterns");md.push(pr.length?pr.map(r=>`- ${r.title}：**${r.choice}**${r.example?`　例：${r.example.replace(/\n/g," / ")}`:""}`).join("\n"):"（未定義）");
  H("7. 禁用詞彙");md.push(L("banned").length?L("banned").join("、"):"（未定義）");
  H("8. 必備提示句");md.push(L("disclosure").length?L("disclosure").map(x=>"- "+x).join("\n"):"（未定義）");
  md.push("\n> 注意：禁用詞中的醫療宣稱類僅為提醒，不構成法律意見。香港《不良廣告(醫藥)條例》(Cap. 231) 的實際限制，以條文與衞生署指引為準。");
  H("9. 範例");const y=s.yes.filter(x=>x.trim()),n=s.no.filter(x=>x.trim());md.push("像我們：\n"+(y.length?y.map(x=>"- "+x).join("\n"):"- （未填）")+"\n\n不像我們：\n"+(n.length?n.map(x=>"- "+x).join("\n"):"- （未填）"));
  return md.join("\n")}
function buildSystem(s){
  const nm=(s.s1&&s.s1.name)||"此品牌",g=k=>labels(k,s).join("、")||"（未定義）",rows=(set)=>setRows(s,set).map(r=>`- ${r.title}：${r.choice}`).join("\n")||"- （未定義）";
  const dr=dialRows(s).map(r=>`- ${r.left}↔${r.right}：${r.meaning}（例：${r.example}）`).join("\n")||"- （未定義）";
  const sit=sitTable(s).filter(r=>r.tone).map(r=>`- ${r.situation}：${r.tone}`).join("\n")||"- （未設定）";
  const y=s.yes.filter(x=>x.trim()),n=s.no.filter(x=>x.trim());
  return `你是「${nm}」的寫作 Agent。所有對外文字（網頁、客服回覆、社群、電郵、通知）必須遵守以下語氣與語言規範。
${s.s1&&s.s1.statement?"品牌定位："+s.s1.statement+"\n":""}${s.s2&&s.s2.statement?"感官定調："+s.s2.statement+"\n":""}
【聲音】${s.statement||draft(s)}
性格：${g("personality")}
守護欄：${g("pairs")}

【語氣刻度】
${dr}

【語言規則】
${rows("lang")}

【用語偏好】
${rows("words")}

【寫作模式】
${rows("patterns")}

【情境語氣】
${sit}

【禁用詞彙（任何情況都不可出現，包括引用與改寫）】
${g("banned")}

【必備提示句（相關內容必須加上）】
${g("disclosure")}

【範例】
像我們：${y.length?"\n"+y.map(x=>"- "+x).join("\n"):"（未提供）"}
不像我們：${n.length?"\n"+n.map(x=>"- "+x).join("\n"):"（未提供）"}

【輸出前自我檢查】
1) 是否出現禁用詞或絕對化承諾？2) 人稱、驚嘆號、Emoji、句長是否符合規則？3) 是否符合該情境的語氣調整？
4) 涉及健康或效果時，是否使用「${picked(s,"words","w_effect")?picked(s,"words","w_effect").zh:"溫和"}」這類不承諾的措辭並加上提示句？
遇到規範沒有涵蓋的情況，或規範之間互相衝突，請回報人類，不要自行決定。`}
function completeness(s){
  const c=[["personality","說話性格（3–4 個）",count("personality",s)>=3&&count("personality",s)<=4],["pairs","守護欄（至少 2 組）",count("pairs",s)>=2],["dials","語氣刻度（至少 6/8）",dialDone(s)>=6],
   ["lang","語言規則（10 項全選）",setDone(s,"lang")>=SETS.lang.need],["situations","情境語氣（至少 8/12）",sitDone(s)>=8],["words","用語偏好（至少 6/8）",setDone(s,"words")>=SETS.words.need],
   ["banned","禁用詞彙（至少 10 個）",count("banned",s)>=10],["disclosure","必備提示句（至少 1 項）",count("disclosure",s)>=1],["patterns","寫作模式（至少 4/6）",setDone(s,"patterns")>=SETS.patterns.need],
   ["samples","範例（像／不像各至少 2 句）",s.yes.filter(x=>x.trim()).length>=2&&s.no.filter(x=>x.trim()).length>=2]];
  const done=c.filter(x=>x[2]).length;return {done,total:c.length,pct:Math.round(done/c.length*100),missing:c.filter(x=>!x[2]).map(x=>({key:x[0],label:x[1]}))}}
function buildBrief(s){const c=completeness(s),pk=k=>items(k,s).map(i=>({id:i.id,name:i.zh,note:i.desc}));
  const sets=(set)=>{const o={};setRows(s,set).forEach(r=>o[r.id]={name:r.choice,note:r.note,example:r.example});return o};
  const sit={};sitTable(s).forEach(r=>{if(r.tone)sit[r.id]={name:r.tone,note:r.note}});
  return {schema:"brand/stage3-voice/v1",status:c.missing.length?"incomplete":"complete",completeness:c.pct,missing:c.missing,stage1_context:s.s1||null,stage2_context:s.s2||null,
    voice_statement:{text:s.statement||draft(s),source:s.statement?"human":"auto-draft"},personality:pk("personality"),guardrail_pairs:pk("pairs"),tone_dials:dialRows(s),
    language_rules:sets("lang"),word_choices:sets("words"),writing_patterns:sets("patterns"),situation_tones:sit,banned_words:pk("banned"),required_disclosures:pk("disclosure"),
    samples:{on_voice:s.yes.filter(x=>x.trim()),off_voice:s.no.filter(x=>x.trim())},consistency_checks:checks(s),voice_guide_md:buildGuide(s),system_prompt:buildSystem(s),
    agent_rules:["所有對外文字必須符合 system_prompt 與 voice_guide_md。","banned_words 內的詞在任何情況都不可出現，包括引用與改寫。","涉及健康或效果的內容，必須使用不承諾的措辭並附上 required_disclosures。","consistency_checks 中 level 為 warn 或 error 的項目須先由人類確認。","status 為 incomplete 時，缺少的欄位不得自行補寫。"]}}

// ---------- 貼回 ----------
function matchItem(k,name){const n=norm(name);if(!n)return null;const L=flat(k);return L.find(i=>i.id===name||norm(i.zh)===n)||L.find(i=>n.length>=2&&(norm(i.zh).includes(n)||(norm(i.zh).length>=2&&n.includes(norm(i.zh)))))||null}
function matchOpt(set,dim,name){const d=DIM(set,dim);if(!d)return null;const n=norm(name);return d.opts.find(o=>o.id===name||norm(o.zh)===n)||d.opts.find(o=>n.length>=2&&(norm(o.zh).includes(n)||(norm(o.zh).length>=2&&n.includes(norm(o.zh)))))||null}
function matchShift(name){const n=norm(name);return SHIFTS.find(x=>x.id===name||norm(x.zh)===n)||SHIFTS.find(x=>n.length>=2&&(norm(x.zh).includes(n)||n.includes(norm(x.zh))))||null}
function matchSit(key){const n=norm(key);return SITUATIONS.find(x=>x.id===key||norm(x.zh)===n)||SITUATIONS.find(x=>n.length>=2&&norm(x.zh).includes(n))||null}
function extractJSON(text){const f=text.match(/```(?:json)?\s*([\s\S]*?)```/i);return JSON.parse(f?f[1]:text.slice(text.indexOf("{"),text.lastIndexOf("}")+1))}
function normalizeBrief(j){if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage3"))return j;const n=a=>(a||[]).map(x=>x.name);const o={};
  o.personality=n(j.personality);o.pairs=n(j.guardrail_pairs);o.banned=n(j.banned_words);o.disclosure=n(j.required_disclosures);o.dials={};(j.tone_dials||[]).forEach(d=>o.dials[d.id]=d.position);
  const m=x=>{const r={};Object.entries(x||{}).forEach(([k,v])=>r[k]=v.name);return r};o.lang=m(j.language_rules);o.words=m(j.word_choices);o.patterns=m(j.writing_patterns);o.situations=m(j.situation_tones);
  o.samples_yes=(j.samples||{}).on_voice||[];o.samples_no=(j.samples||{}).off_voice||[];if(j.voice_statement&&j.voice_statement.source==="human")o.statement=j.voice_statement.text;return o}
function applyPaste(text,s){const out={applied:[],custom:[],errors:[]};let j;
  try{j=normalizeBrief(extractJSON(text))}catch(e){out.errors.push("找不到可解析的 JSON 區塊（請連同 ```json 區塊一起貼上）");return out}
  const map={personality:"personality",pairs:"pairs",banned:"banned",banned_words:"banned",disclosure:"disclosure",disclosures:"disclosure"};
  Object.entries(map).forEach(([jk,k])=>{if(!Array.isArray(j[jk]))return;const ids=[],cu=[];j[jk].forEach(n=>{const m=matchItem(k,n);if(m){if(!ids.includes(m.id))ids.push(m.id)}else if(String(n).trim()&&!cu.includes(String(n).trim()))cu.push(String(n).trim())});
    s[k]=ids;s.custom[k]=cu;out.applied.push(`${CAT[k].title.replace(/（.*/,"")}：${ids.length} 項`+(cu.length?`＋自訂 ${cu.length} 項`:""));cu.forEach(c=>out.custom.push(c))});
  if(j.dials&&typeof j.dials==="object"){let c=0;Object.entries(j.dials).forEach(([id,v])=>{const d=DIALS.find(x=>x.id===id);const n=Math.round(Number(v));if(d&&n>=-2&&n<=2){s.dials[id]=n;c++}});if(c)out.applied.push(`語氣刻度：${c} 個`)}
  [["lang","lang"],["words","words"],["patterns","patterns"]].forEach(([jk,set])=>{if(!j[jk]||typeof j[jk]!=="object")return;let c=0;Object.entries(j[jk]).forEach(([d,v])=>{if(!DIM(set,d))return;const o=matchOpt(set,d,typeof v==="object"?v.name:v);if(o){s.pick[set][d]=o.id;c++}else out.errors.push(`「${d}」的值「${v}」不在清單內，未套用`)});if(c)out.applied.push(`${SETS[set].title}：${c} 項`)});
  if(j.situations&&typeof j.situations==="object"){let c=0;Object.entries(j.situations).forEach(([k,v])=>{const si=matchSit(k),sh=matchShift(typeof v==="object"?v.name:v);if(si&&sh){s.sit[si.id]=sh.id;c++}else out.errors.push(`情境「${k}」或語氣「${v}」不在清單內，未套用`)});if(c)out.applied.push(`情境語氣：${c} 個`)}
  if(Array.isArray(j.samples_yes)){s.yes=j.samples_yes.map(String).concat(["","",""]).slice(0,3);out.applied.push("像我們的範例")}
  if(Array.isArray(j.samples_no)){s.no=j.samples_no.map(String).concat(["","",""]).slice(0,3);out.applied.push("不像我們的範例")}
  if(typeof j.statement==="string"&&j.statement.trim()){s.statement=j.statement.trim();out.applied.push("聲音宣言")}
  if(!out.applied.length)out.errors.push("JSON 內沒有可辨識的欄位");return out}
