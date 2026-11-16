
const KEY="brand_stage4a_v1";
const norm=t=>String(t||"").replace(/\s+/g,"").toLowerCase();
const blankCand=id=>({id,name:"",strategy:"",visual:"",context:"",cost:"",hard:"",evidence:"",lt:"",ls:"",tp:"",cs:"",tpc:{}});
const emptyState=()=>{const s={s0:null,s1:null,s2:null,s3:null,pick:{arch:{},dials:{},logoSys:{},typeSys:{},colorSys:{},outSys:{},decision:{}},text:{},pal:{},reg:{type:{},logo:{},color:{}},cand:[blankCand("A"),blankCand("B"),blankCand("C")],meta:{},custom:{},impact:[]};CAT_KEYS.forEach(k=>{s[k]=[];s.custom[k]=[]});return s};
function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||"null");const e=emptyState();if(!s)return e;const m=Object.assign(e,s);m.custom=Object.assign(e.custom,s.custom||{});m.pick=Object.assign(e.pick,s.pick||{});m.reg=Object.assign({type:{},logo:{},color:{}},s.reg||{});m.cand=(s.cand&&s.cand.length===3?s.cand:e.cand).map((c,i)=>Object.assign(blankCand("ABC"[i]),c));m.meta=s.meta||{};m.impact=s.impact||[];CAT_KEYS.forEach(k=>{if(!Array.isArray(m[k]))m[k]=[];if(!Array.isArray(m.custom[k]))m.custom[k]=[]});return m}catch(x){return emptyState()}}
function save(s){try{localStorage.setItem(KEY,JSON.stringify(s))}catch(x){}}
const flat=k=>CAT[k].groups.flatMap(g=>g.items);
const byId=(k,id)=>flat(k).find(i=>i.id===id);
const labels=(k,s)=>[...s[k].map(id=>(byId(k,id)||{zh:id}).zh),...s.custom[k]];
const items=(k,s)=>[...s[k].map(id=>byId(k,id)||{id,zh:id,desc:""}),...s.custom[k].map(t=>({id:"custom",zh:t,desc:"（自訂）"}))];
const count=(k,s)=>s[k].length+s.custom[k].length;
const names=(k,s)=>labels(k,s).join("、")||"（尚未選擇）";
const dimInfo=id=>DIMS_ALL.find(d=>d.id===id);
const pv=(s,id)=>{const d=dimInfo(id);return d?s.pick[d.set][id]:undefined};
const picked=(s,id)=>{const d=dimInfo(id),v=pv(s,id);return d&&v?d.opts.find(o=>o.id===v)||null:null};
const dimsDone=(s,set,ids)=>SETS[set].dims.filter(d=>(!ids||ids.includes(d.id))&&picked(s,d.id)).length;
const T_=(s,id)=>String(s.text[id]||"").trim();
const kebab=t=>t.replace(/[A-Z]/g,m=>"-"+m.toLowerCase());
const dialPos=(s,id)=>{const v=pv(s,id);if(!v)return null;return ({m2:-2,m1:-1,z:0,p1:1,p2:2})[v.split("_").pop()]};
const stMeta=(s,id)=>s.meta[id]||{status:"draft",approver:"",version:"0.1",note:""};
const statusZh=v=>(STATUS.find(x=>x[0]===v)||["","草稿"])[1];

// ---------- 匯入前階段 ----------
function parseStage(text){let j;try{j=typeof text==="string"?JSON.parse(text):text}catch(e){return null}
  if(!j||typeof j.schema!=="string")return null;const n=a=>(a||[]).map(x=>x.name),sc=j.schema;
  if(sc.startsWith("brand/stage0")){const sel=j.selections||{},ch=j.choices||{},tx=j.text||{},d=j.derived||{};
    return {type:"s0",data:{name:tx.trading||tx.legalZh||"",nameEn:tx.legalEn||"",status:(ch.status||{}).name||"",priceTier:(ch.priceTier||{}).name||"",brandBudget:(ch.brandBudget||{}).name||"",nameStatus:(ch.nameStatus||{}).name||"",tm:(ch.tm||{}).name||"",languages:n(sel.languages),markets:n(sel.markets),industry:n(sel.industry),assets:n(sel.assets),delivery:n(sel.delivery),location:n(sel.location),goals:n(sel.goals),claims:!!d.claims_risk,regulated:!!d.regulated,flags:d.flags||[]}}}
  if(sc.startsWith("brand/stage1"))return {type:"s1",data:{name:j.brand_name||"",statement:(j.positioning_statement||{}).text||"",tension:(j.core_tension||{}).primary||"",dials:((j.core_tension||{}).dials||[]).map(d=>({id:d.id,position:d.position})),anti:n(j.anti_persona)}};
  if(sc.startsWith("brand/stage2")){const pt=j.physics_tokens||{};return {type:"s2",data:{statement:(j.sensory_statement||{}).text||"",keywords:n(j.mood_keywords),anti:n(j.anti_keywords),material:n((j.material_metaphor||{}).primary),tokens:pt}}}
  if(sc.startsWith("brand/stage3")){const lr=j.language_rules||{};return {type:"s3",data:{script:(lr.script||{}).name||"",emoji:(lr.emoji||{}).name||"",sentence:(lr.sentence||{}).name||"",personality:n(j.personality)}}}
  return null}
const assetKey=a=>/品牌名稱|^名稱/.test(a)?"name":/標誌|Logo/i.test(a)?"logo":/顏色|品牌色/.test(a)?"color":/字體/.test(a)?"font":/標語|口號/.test(a)?"slogan":/包裝/.test(a)?"pack":/店舖|店面|裝潢|招牌/.test(a)?"store":/照片|影片|影像/.test(a)?"photo":null;
const hasZh=s=>s.s0&&s.s0.languages.some(l=>/廣東話|普通話|中文/.test(l));
const hasEn=s=>s.s0&&s.s0.languages.some(l=>/英文/.test(l));
const marketHK=s=>s.s0&&s.s0.markets.some(m=>/香港/.test(m));
function ctxStages(s){const a=[];
  a.push(s.s0?`【Stage 0 業務】${s.s0.name||"（未命名）"}｜行業：${s.s0.industry.join("、")||"—"}｜價格定位：${s.s0.priceTier||"—"}｜市場：${s.s0.markets.join("、")||"—"}｜語言：${s.s0.languages.join("、")||"—"}｜交付：${s.s0.delivery.join("、")||"—"}｜品牌預算：${s.s0.brandBudget||"—"}｜現有資產：${s.s0.assets.join("、")||"—"}｜健康／療效宣稱風險：${s.s0.claims?"有":"無"}`:"【Stage 0 業務】（尚未匯入）");
  a.push(s.s1?`【Stage 1 定位】${s.s1.statement||"（無）"}｜核心張力：${s.s1.tension||"—"}｜絕對不要像：${s.s1.anti.join("、")||"—"}`:"【Stage 1 定位】（尚未匯入）");
  a.push(s.s2?`【Stage 2 感官】${s.s2.statement||"（無）"}｜關鍵字：${s.s2.keywords.join("、")||"—"}｜反關鍵字：${s.s2.anti.join("、")||"—"}｜材質：${s.s2.material.join("、")||"—"}`:"【Stage 2 感官】（尚未匯入）");
  a.push(s.s3?`【Stage 3 語言】書寫：${s.s3.script||"—"}｜性格：${s.s3.personality.join("、")||"—"}｜句長：${s.s3.sentence||"—"}`:"【Stage 3 語言】（尚未匯入）");return a.join("\n")}

// ---------- 色票與配色 ----------
const palOk=s=>PAL_ROLES.every(r=>isHex(s.pal[r.id]));
function palTarget(pair,s){const aaa=pv(s,"cContrast")==="ct_aaa";return aaa&&["ink","muted","action"].includes(pair[0])?7:pair[2]}
function palPairs(s){return PAL_PAIRS.map(p=>{const ok=isHex(s.pal[p[0]])&&isHex(s.pal[p[1]]),ratio=ok?contrast(s.pal[p[0]],s.pal[p[1]]):0,T=palTarget(p,s);return {fg:p[0],bg:p[1],desc:p[3],ratio,target:T,pass:ok&&ratio>=T,missing:!ok}})}
function cwResolve(it,s){const r=v=>{if(v===null||v===undefined)return null;if(String(v).startsWith("#"))return v;if(String(v).startsWith("gray:")){const x=s.pal[v.slice(5)];return isHex(x)?grayOf(x):null}return s.pal[v]};const fg=r(it.fg),bg=r(it.bg);if(!isHex(fg)||!isHex(bg))return null;return {fg,bg,ratio:contrast(fg,bg),pass:contrast(fg,bg)>=3}}
function cwList(s){return items("colorways",s).map(i=>{const it=byId("colorways",i.id);return {id:i.id,zh:i.zh,desc:i.desc,res:it?cwResolve(it,s):null}})}
const ptoh=(s,id)=>isHex(s.pal[id])?hslOf(s.pal[id]):null;

// ---------- 識別就緒清單 ----------
function readiness(s){const L=[],A=(id,title,status,detail,links)=>L.push({id,title,status,detail,links:links||[]});
  const tm=s.s0&&s.s0.tm,tmNote=T_(s,"tmNote");
  A("tm","標誌與名稱的商標查證",tmNote.length>=3?"doing":(tm&&/已申請|已註冊/.test(tm)?"done":"todo"),tmNote.length>=3?"已有備註："+tmNote:"先用知識產權署的公開搜尋查有無相同或相似的商標，並記錄結果；是否申請與相似度判斷建議諮詢專業人士。這只是提醒，不是法律意見。",[LINKS.tm]);
  A("vector","向量母檔",({vs_verified:"done",vs_master:"doing",vs_sketch:"todo",vs_none:"todo"})[pv(s,"vectorStatus")]||"todo","標誌必須有向量母檔，才能無損縮放與製版；草圖與點陣圖不算。");
  const miss=["lv_black","lv_white","lv_small"].filter(x=>!s.logoVariants.includes(x));
  A("variants","單色、反白與小尺寸版本",miss.length?"todo":"doing",miss.length?"尚未定義：" +miss.map(x=>byId("logoVariants",x).zh).join("、"):"已定義，仍需逐一製作並測試。");
  A("minsize","最小尺寸測試（螢幕與印刷分開）",({ms_both:"done",ms_screen:"doing",ms_print:"doing",ms_none:"todo"})[pv(s,"minSizeStatus")]||"todo","在真實媒介上測：螢幕尺寸與實際印刷尺寸要分開。");
  const roles=TYPE_ROLES.filter(r=>(s.reg.type[r.id]||{}).family),unk=roles.filter(r=>["","unknown"].includes((s.reg.type[r.id]||{}).license||""));
  A("fontlic","字體授權證據",roles.length&&!unk.length?"done":"todo",roles.length?(unk.length?"授權未確認：" +unk.map(r=>r.zh).join("、"):"所有已登記字體都有授權記錄；仍請保留證據連結或文件。"):"尚未登記字體。Web、App、PDF、商標與供應商轉交的授權範圍可能不同，請逐項確認。");
  const fails=palOk(s)?palPairs(s).filter(p=>!p.pass).length:null;
  A("contrast","色票對比測試",fails===null?"todo":fails?"todo":"doing",fails===null?"色票尚未完整。":(fails?fails+" 組未達標。":"必要配對已通過（以 WCAG 2.2 公式計算）；仍需在真實元件與狀態上測試。"));
  if(s.outputNeeds.includes("on_cmyk")||s.outputNeeds.includes("on_spot"))A("proof","品牌色打樣",pv(s,"proofStatus")==="pf_ok"?"done":pv(s,"proofStatus")==="pf_done"?"doing":"todo","螢幕色不等於印刷色；打樣後才記錄官方 CMYK 或專色，並指定確認人。");
  if(s.s0&&s.s0.languages.some(l=>/中文|廣東話|普通話/.test(l))&&s.s0.languages.some(l=>/英文/.test(l)))A("bilingual","雙語標誌規則",pv(s,"langLockup")&&pv(s,"langLockup")!=="ll_tbd"?"doing":"todo","雙語品牌須決定主次、並列比例與各語言版本。");
  A("impact","下游影響重檢",s.impact.length?"todo":"later",s.impact.length?"有已核准項目被修改：" +[...new Set(s.impact.map(x=>x.card))].join("、")+"。請重新檢查下游。":"目前沒有已核准項目被修改。");
  return L}

// ---------- 檢查 ----------
function checks(s){
  const out=[],A=(l,m)=>out.push({level:l,msg:m});const lt=new Set(s.logoType),ls=new Set(s.logoStyle),tp=new Set(s.typePers),cs=new Set(s.colorStyle),lv=new Set(s.logoVariants),on=new Set(s.outputNeeds),S0=s.s0,S1=s.s1,S2=s.s2,S3=s.s3;
  const kwText=(S2?S2.keywords.join("｜"):"")+"｜"+labels("keywords",s).join("｜"),anti1=S1?S1.anti.join("｜"):"",anti2=S2?S2.anti.join("｜"):"";
  const claims=S0&&S0.claims,calmWish=/安靜|克制|沉穩|柔和|療癒|低調/.test(kwText)||(dialPos(s,"d_quiet")!==null&&dialPos(s,"d_quiet")<=-1);
  // 架構與資產
  if(pv(s,"idJob")==="ij_new"&&S0&&S0.assets.length&&!S0.assets.some(a=>/什麼都沒有/.test(a)))A("info","Stage 0 顯示已有現有資產（"+S0.assets.slice(0,3).join("、")+"…），但識別任務選了『從零新建』，請確認。");
  if(["ij_keep","ij_refresh","ij_rebrand","ij_partial"].includes(pv(s,"idJob"))&&!count("keepAssets",s)&&!count("dropAssets",s))A("warn","識別任務是延續或重塑，但還沒決定哪些資產保留、哪些放棄。");
  s.keepAssets.forEach(id=>{const sx=id.slice(3);if(s.dropAssets.includes("da_"+sx))A("warn","「"+(byId("keepAssets",id)||{zh:sx}).zh+"」同時被標為保留與放棄，請改為分開描述（例如保留顏色但重畫標誌）。")});
  if(S0&&S0.assets.length&&["ij_keep","ij_refresh","ij_rebrand"].includes(pv(s,"idJob"))){const dec=new Set([...s.keepAssets.map(x=>x.slice(3)),...s.dropAssets.map(x=>x.slice(3))]);const undecided=S0.assets.map(a=>({a,k:assetKey(a)})).filter(o=>o.k&&!dec.has(o.k)).map(o=>o.a);if(undecided.length)A("info","Stage 0 列出的這些現有資產還沒有保留或放棄的決定：" +undecided.join("、")+"。")}
  if(pv(s,"archModel")==="ar_family"&&!lv.has("lv_mark")&&s.logoVariants.length)A("info","子品牌家族通常需要可獨立使用的圖形，但變體清單沒有『獨立圖形』。");
  if(pv(s,"archModel")==="ar_event")A("info","期間限定識別：請在核准記錄寫明停用日期，以及結束後哪些資產要下架。");
  if(count("keywords",s)>5)A("warn","識別關鍵字超過 5 個，會失去取捨。");
  if(S2&&S2.keywords.length&&count("keywords",s)===0)A("info","已匯入 Stage 2 的關鍵字，但這裡還沒補視覺層面的關鍵字。");
  // 刻度與風格衝突
  if(calmWish&&dialPos(s,"d_quiet")>=1)A("warn","Stage 2／關鍵字偏安靜克制，但識別刻度選了偏『鮮明、搶眼』。");
  // Logo 類型
  if(lt.size>2)A("warn","Logo 類型選了 3 個以上，會失去結構；請選主要與最多一個輔助。");
  if(lt.has("lt_mascot")&&dialPos(s,"d_auth")!==null&&dialPos(s,"d_auth")<=-1)A("warn","吉祥物標與『權威、專業』的偏好相衝突。");
  if(lt.has("lt_mascot")&&(claims||(S0&&S0.regulated)))A("info","吉祥物標在健康、醫療或受規管的專業服務較容易顯得輕浮；若選用，建議同時做信任度測試。");
  if(lt.has("lt_letter")&&S0&&hasZh(s)&&!hasEn(s)&&!T_(s,"brandNameEn"))A("warn","字母標通常依賴西文縮寫；你的名稱只有中文，字母標可能不成立。");
  if(lt.has("lt_emblem")&&ls.has("ls_minimal"))A("warn","徽章標通常細節多，與『極簡』風格方向衝突。若要結合，須說明如何簡化。");
  if((lt.has("lt_emblem")||ls.has("ls_line")||ls.has("ls_vintage"))&&["ms_none",undefined].includes(pv(s,"minSizeStatus")))A("info","徽章、單線或復古風格在小尺寸最容易失敗，請先做最小尺寸測試。");
  if(lt.has("lt_pict")&&lt.has("lt_abstract"))A("info","圖像標與抽象標不建議同為主要與輔助類型，請說明各自使用場景。");
  // Logo 風格
  if(ls.size>3)A("warn","Logo 風格選了 3 個以上，建議收斂到最多 3 個。");
  if(ls.has("ls_tech")&&!(lv.has("lv_black")&&lv.has("lv_white")))A("warn","科技漸變風格必須有不使用漸變的單色版本（黑與白），否則無法用於刺繡、燙印與單色印刷。");
  if(ls.has("ls_bold")&&calmWish)A("warn","粗黑強烈與安靜克制的方向相衝突。");
  if(ls.has("ls_hand")&&dialPos(s,"d_craft")!==null&&dialPos(s,"d_craft")<=-1)A("warn","手繪風格與『工整、規則』的偏好相衝突。");
  if(ls.has("ls_geo")&&dialPos(s,"d_craft")!==null&&dialPos(s,"d_craft")>=1)A("warn","幾何風格與『手作、不完美』的偏好相衝突。");
  if(ls.has("ls_vintage")&&dialPos(s,"d_trad")!==null&&dialPos(s,"d_trad")>=1)A("warn","復古徽章與『前衛、新穎』的偏好相衝突。");
  if(ls.has("ls_luxury")&&S0&&/平價/.test(S0.priceTier))A("warn","奢華襯線風格與 Stage 0 的『平價』價格定位衝突。");
  if(ls.has("ls_motion")&&!s.nextModules.includes("nm_motion"))A("info","選了動態標識，但後續模組沒有『動態識別』。動態標識需要靜態主版本與專門的動態規則。");
  // 變體與雙語
  if(s.logoVariants.length){const m=["lv_black","lv_white","lv_small"].filter(x=>!lv.has(x));if(m.length)A("warn","標誌變體缺少必備版本：" +m.map(x=>byId("logoVariants",x).zh).join("、")+"。");if(!lv.has("lv_h")&&!lv.has("lv_v"))A("warn","標誌變體沒有橫式或直式組合。")}
  if(hasZh(s)&&hasEn(s)){if(!["lv_bi_side","lv_bi_main","lv_zh","lv_en"].some(x=>lv.has(x))&&s.logoVariants.length)A("warn","Stage 0 顯示中英雙語，但標誌變體沒有任何語言版本。");if(!pv(s,"langLockup")||pv(s,"langLockup")==="ll_tbd")A("info","雙語品牌需要決定中英文的主次與並列規則。")}
  if(S0&&S0.location.some(l=>/純網上/.test(l))&&s.logoVariants.length&&!lv.has("lv_fav")&&!lv.has("lv_app"))A("info","純網上品牌通常需要 Favicon 與 App 圖示／頭像版本。");
  const vs=pv(s,"vectorStatus");
  Object.entries(s.reg.logo).forEach(([id,r])=>{if(!s.logoVariants.includes(id))return;if(["vector","tested","approved"].includes(r.status)&&["vs_none","vs_sketch"].includes(vs))A("warn","變體「"+byId("logoVariants",id).zh+"」標示為向量或已測試，但整體向量母檔狀態是『還沒有／只有草圖』。");if(r.status==="approved"&&!["ms_both","ms_screen","ms_print"].includes(pv(s,"minSizeStatus")))A("warn","變體「"+byId("logoVariants",id).zh+"」標示已核准，但還沒做最小尺寸測試。")});
  // 字體
  if(tp.size>2)A("warn","字體個性方向選了 3 個以上，建議最多 2 個。");
  const displayOnly=["tp_didone","tp_kai","tp_display","tp_hand"];
  if(s.typePers.length&&s.typePers.every(x=>displayOnly.includes(x))&&!(s.reg.type.body||{}).family)A("warn","你選的字體個性都偏標題用（高反差、書法、展示、手寫），請另外登記一個清楚的內文字體。");
  if(tp.has("tp_mono")&&(s.reg.type.body||{}).family&&/mono|等寬/i.test((s.reg.type.body||{}).family))A("warn","內文使用等寬字體，長文閱讀會吃力。");
  if((tp.has("tp_kai")||tp.has("tp_hand"))&&claims)A("info","健康與療效相關資訊不宜用手寫或書法字體呈現，清晰可讀比風格重要。");
  if(S0&&/高端|奢華/.test(S0.priceTier)&&tp.has("tp_round"))A("info","高端價格定位搭配圓體，可能被視為較輕鬆或兒童向，請以同內容測試。");
  const fam=TYPE_ROLES.map(r=>({r,x:s.reg.type[r.id]||{}})).filter(o=>o.x.family);
  const webFam=[...new Set(fam.filter(o=>!["system","fallback"].includes(o.x.source)&&o.r.id!=="fallback").map(o=>o.x.family.trim().toLowerCase()))];
  if(webFam.length>3)A("warn","登記了 "+webFam.length+" 個需載入的字體家族，建議不超過 3 個。");
  fam.forEach(o=>{if(["","unknown"].includes(o.x.license||""))A("warn","字體「"+o.x.family+"」（"+o.r.zh+"）的授權還沒確認。請記錄來源、授權範圍與證據連結。");if(o.x.source==="system"&&o.x.license&&o.x.license!=="system")A("info","字體「"+o.x.family+"」標示為系統字體，但授權欄不是『系統內建』。");if(o.x.license==="system"&&o.x.source&&o.x.source!=="system")A("info","字體「"+o.x.family+"」授權為系統內建，但來源不是系統字體；系統字體不可自行嵌入。");if(["cjkDisplay","cjkBody"].includes(o.r.id)&&marketHK(s)){if(!o.x.hk||o.x.hk==="no")A("info","字體「"+o.x.family+"」尚未檢查香港字形。部分字形與台灣或內地慣用寫法不同。");if(o.x.hk==="tc")A("info","字體「"+o.x.family+"」是台灣字形；面向香港讀者請確認差異是否可接受。")}});
  if(hasZh(s)&&fam.length&&!fam.some(o=>["cjkDisplay","cjkBody"].includes(o.r.id)))A("warn","Stage 0 顯示有中文讀者，但字體登記沒有任何中文字體。");
  if(hasZh(s)&&fam.length&&fam.some(o=>o.r.id==="cjkBody"&&/serif|宋|明/i.test(o.x.family))&&pv(s,"tyBase")==="tb_16")A("info","中文內文使用宋體或明體，且基本字級是 16px：細筆畫在小字級較難閱讀，建議 17–18px 或改用黑體。");
  if(pv(s,"tyLhCjk")==="tl_16"&&pv(s,"tyMeasure")==="tm_w")A("warn","中文行高 1.6 搭配寬行長，長文閱讀會吃力。");
  if(pv(s,"tyWeights")==="tw_4")A("info","字重四種以上會增加檔案大小與一致性風險。");
  if(S3&&/偏長|25/.test(S3.sentence)&&["tl_16","tl_17"].includes(pv(s,"tyLhCjk")))A("info","Stage 3 句子偏長，建議中文行高 1.8 以上。");
  // 色彩
  if(cs.size>2)A("warn","色彩風格方向選了 3 個以上，建議最多 2 個。");
  if(cs.has("cs_neon")&&calmWish)A("warn","霓虹暗色與安靜克制的方向相衝突。");
  if(cs.has("cs_clash")&&(calmWish||/促銷/.test(anti1)))A("warn","高飽和撞色與安靜克制，或與要避免的廉價促銷感相衝突。");
  if(cs.has("cs_blackgold")&&/炫富|浮誇/.test(anti1+anti2))A("warn","黑金與 Stage 1／2 要避免的炫富或浮誇相衝突。");
  if(cs.has("cs_coolTech")&&/醫院/.test(anti1+anti2))A("warn","冷調科技很容易變成『冰冷醫院感』，而 Stage 1／2 要避免它。");
  if(cs.has("cs_cleanAccent")&&claims)A("info","健康類業務若選潔淨白＋點綴，要避免變成『冰冷醫院感』：可選帶暖調的底色。");
  if(cs.has("cs_pastel")&&S0&&/高端|奢華/.test(S0.priceTier))A("info","粉彩在高端定位較容易顯得幼稚或廉價，請以同內容測試。");
  if(cs.has("cs_green")&&S0&&S0.flags&&S0.flags.some(f=>["health","hprod"].includes(f)))A("info","自然綠在健康與保健品很常見，容易與同行混淆；請確認差異化。");
  if(palOk(s)){palPairs(s).forEach(p=>{if(!p.pass)A(["ink","onAction"].includes(p.fg)?"error":"warn",`${PAL_ROLES.find(r=>r.id===p.fg).zh}在${PAL_ROLES.find(r=>r.id===p.bg).zh}上只有 ${p.ratio.toFixed(2)}:1（需要 ${p.target}:1）— ${p.desc}`)});
    const R=new Set(s.colorRules);if(contrast(s.pal.accent,s.pal.canvas)<4.5&&!R.has("cr_accent"))A("warn","點綴色對底色低於 4.5:1，建議加入規則『點綴色不作文字色』。");
    if(R.has("cr_noPureBlack")&&normHex(s.pal.ink)==="#000000")A("warn","規則是不用純黑作文字，但主文字是 #000000。");
    if(R.has("cr_noPureWhite")&&normHex(s.pal.canvas)==="#FFFFFF")A("warn","規則是純白不作全頁背景，但頁面底色是純白。");
    const hb=ptoh(s,"brand");if(hb&&pv(s,"cChroma")==="cc_soft"&&hb.s>0.85&&hb.l>0.25&&hb.l<0.75)A("info","彩度傾向選了『柔和』，但品牌主色飽和度偏高。");
    if(hb&&pv(s,"cChroma")==="cc_vivid"&&hb.s<0.3)A("info","彩度傾向選了『鮮明』，但品牌主色飽和度偏低。")}
  else if(Object.keys(s.pal).length)A("info","色票尚未完整（需要 8 個角色），部分對比檢查已略過。");
  if(count("colorRules",s)>0&&count("colorRules",s)<4)A("info","色彩使用規則建議至少 4 條。");
  if(pv(s,"cStatus")==="cs_brand")A("warn","狀態色只用品牌色加圖示，錯誤與成功容易混淆；不建議。");
  if(["cd_auto","cd_dual"].includes(pv(s,"cDark")))A("info","你需要深色模式，但本階段只登記淺色色票；請在設計系統階段補一組深色色票並重新檢查對比。");
  // 配色組合
  const cw=cwList(s);cw.forEach(c=>{if(c.res&&!c.res.pass)A("warn",`配色組合「${c.zh}」的前景與背景只有 ${c.res.ratio.toFixed(2)}:1，低於建議的 3:1。`)});
  if(s.colorways.length){["cw_default","cw_inverse","cw_black","cw_white"].forEach(id=>{if(!s.colorways.includes(id))A("info","建議定義配色組合「"+byId("colorways",id).zh.split("：")[0]+"」。")})}
  // 輸出
  if(on.has("on_p3")&&!on.has("on_srgb"))A("warn","Display P3 增強必須有 sRGB 備援。");
  if(on.has("on_metal")&&!on.has("on_spot"))A("warn","金屬或螢光色無法用 RGB 或 CMYK 準確表現，需要專色或特殊油墨。");
  if(on.has("on_mono")&&!(lv.has("lv_black")&&lv.has("lv_white")))A("warn","需要單色製程（刺繡、燙印、雷射），但標誌變體沒有單色黑與單色白。");
  if(on.has("on_cmyk")&&pv(s,"printProfile")==="pp_na")A("warn","需要 CMYK 印刷，但 ICC 描述檔選了『不印刷』。");
  if((on.has("on_cmyk")||on.has("on_spot"))&&!pv(s,"printProfile"))A("info","有印刷需求，請與印刷廠確認 ICC 描述檔。");
  if(S0&&S0.delivery.some(d=>/郵寄|速遞/.test(d))&&(!s.outputNeeds.length||on.has("on_none")||!(on.has("on_cmyk")||on.has("on_spot"))))A("warn","Stage 0 有郵寄或速遞交付，通常需要包裝或標籤；輸出需求卻沒有印刷色彩。");
  if(on.has("on_spot")&&!Object.values(s.reg.color).some(x=>x&&x.pantone))A("info","需要專色，但還沒記錄任何專色色號。");
  if(on.has("on_cmyk")&&pv(s,"proofStatus")===undefined)A("info","有 CMYK 印刷需求，品牌色尚未打樣。");
  // 後續模組
  if(s.nextModules.includes("nm_none")&&s.nextModules.length>1)A("warn","後續模組同時選了『全部不適用』與其他模組。");
  if(s.nextModules.includes("nm_sound"))A("info","聲音需要專業聲音模組與授權處理；4A 不會自動產生音樂或音訊標誌。");
  if(s.nextModules.includes("nm_product"))A("info","產品與工程規格必須由工程師與合資格專業人士驗證，不能因風格配對而自動批准。");
  // 候選
  const filled=s.cand.filter(c=>c.name||c.strategy||c.visual);
  if(filled.length&&filled.length<2)A("info","只有一個候選方向；至少比較兩個才能看出取捨。");
  filled.forEach(c=>{const cells=Object.values(c.tpc).filter(v=>String(v).trim()).length;if(cells<4)A("warn","候選 "+c.id+" 只填了 "+cells+" 個觸點。候選必須用相同內容比較同一批觸點（不適用要寫理由）。");if(!c.strategy.trim())A("warn","候選 "+c.id+" 沒有策略理由。");if(!c.cost.trim())A("info","候選 "+c.id+" 沒有成本與製作能力記錄。")});
  for(let i=0;i<s.cand.length;i++)for(let j=i+1;j<s.cand.length;j++){const a=s.cand[i],b=s.cand[j];if(a.lt&&a.lt===b.lt&&a.ls===b.ls&&a.tp===b.tp&&a.cs===b.cs)A("info","候選 "+a.id+" 與 "+b.id+" 的類型、風格、字體與色彩選擇完全相同，不構成比較。")}
  const fd=pv(s,"finalDir");if(["fd_a","fd_b","fd_c"].includes(fd)){const c=s.cand["abc".indexOf(fd.slice(-1))];if(!c||!(c.name||c.strategy))A("warn","傾向的方向是候選 "+fd.slice(-1).toUpperCase()+"，但該候選沒有內容。")}
  // 核准記錄
  CARD_IDS.forEach(id=>{const m=stMeta(s,id),ref=CARD_LABEL[id]||id;
    if(m.status==="approved"){if(!m.approver.trim())A("warn","「"+ref+"」標為已核准，但沒有指定核准者。");if(!(m.version||"").trim())A("warn","「"+ref+"」標為已核准，但沒有版本。");const bl=blockers(s,id);if(bl.length)A("warn","「"+ref+"」標為已核准，但仍有未解決項目：" +bl.join("；")+"。")}
    if(m.status==="review"){const bl=blockers(s,id);if(bl.length)A("info","「"+ref+"」請求核准前建議先處理：" +bl.join("；")+"。")}
    if(m.status==="ai")A("info","「"+ref+"」目前是 AI 提案，尚未經人類審視。")});
  if(s.impact.length)A("warn","有已核准的項目被修改，需重新檢查下游："+[...new Set(s.impact.map(x=>x.card))].join("、")+"。");
  return out}
const CARD_LABEL={arch:"識別任務與品牌架構",brief:"識別方向",logoType:"Logo 類型",logoStyle:"Logo 風格",logoSys:"標誌系統",type:"字體個性",typeSpec:"字體登記與排版",colorStyle:"色彩風格",palette:"色票角色與規則",colorways:"配色組合",output:"輸出需求",compare:"候選比較",approval:"核准記錄"};
function blockers(s,id){const b=[];
  if(id==="logoType"||id==="logoStyle"){if(!T_(s,"tmNote"))b.push("尚未記錄商標查證");if(!s.logoType.length)b.push("尚未選 Logo 類型")}
  if(id==="logoStyle"&&!s.logoStyle.length)b.push("尚未選 Logo 風格");
  if(id==="logoSys"){if(["vs_none","vs_sketch",undefined].includes(pv(s,"vectorStatus")))b.push("沒有向量母檔");if(["ms_none",undefined].includes(pv(s,"minSizeStatus")))b.push("沒有最小尺寸測試")}
  if(id==="typeSpec"){const f=TYPE_ROLES.filter(r=>(s.reg.type[r.id]||{}).family&&["","unknown"].includes((s.reg.type[r.id]||{}).license||""));if(f.length)b.push("字體授權未確認："+f.map(r=>r.zh).join("、"));if(!TYPE_ROLES.some(r=>(s.reg.type[r.id]||{}).family))b.push("尚未登記字體")}
  if(id==="palette"){if(!palOk(s))b.push("色票不完整");else if(palPairs(s).some(p=>!p.pass))b.push("有對比未達標")}
  if(id==="colorways"&&cwList(s).some(c=>c.res&&!c.res.pass))b.push("有配色組合對比不足");
  if(id==="output"&&(s.outputNeeds.includes("on_cmyk")||s.outputNeeds.includes("on_spot"))&&pv(s,"proofStatus")!=="pf_ok")b.push("品牌色尚未打樣確認");
  if(id==="compare"&&s.cand.filter(c=>c.name||c.strategy).length<2)b.push("少於兩個候選");
  return b}

// ---------- 給下游的建議 ----------
function hints(s){const H=[],A=(stage,field,text,why)=>H.push({stage,field,text,why});const lt=new Set(s.logoType),ls=new Set(s.logoStyle);
  s.nextModules.filter(x=>x!=="nm_none").forEach(id=>{const it=byId("nextModules",id);A("Stage 5 模組",it.zh,it.desc,"你選了此後續模組")});
  if(lt.has("lt_mascot"))A("Stage 5 模組","3D／插畫角色","吉祥物需要角色設計、表情集與版權歸屬文件","Logo 類型為吉祥物標");
  if(lt.has("lt_pict")||lt.has("lt_abstract")||lt.has("lt_emblem"))A("Stage 5 模組","圖案與紋樣","標誌圖形可衍生母題，再決定單元、重複方式與用途","Logo 有獨立圖形");
  if(ls.has("ls_tech")||ls.has("ls_motion"))A("Stage 5 模組","動態與數碼","需要靜態主版本與動態規則；漸變須有單色備援","Logo 風格含漸變或動態");
  if(ls.has("ls_vintage")||ls.has("ls_luxury")||ls.has("ls_line"))A("Stage 5 模組","產品與包裝工藝","細線、徽章與奢華質感常搭配燙金、壓凸等工藝；需向印刷廠確認最小線寬","Logo 風格依賴細節");
  if(s.outputNeeds.includes("on_p3")||s.outputNeeds.includes("on_dark"))A("Stage 5 模組","數碼與服務","需要為廣色域與深色模式建立 token 並重新檢查對比","輸出需求含 P3 或深色模式");
  if(s.keepAssets.length)A("Stage 6","資產登記","保留的現有資產要登記版本與來源，避免新舊混用","有保留的現有資產");
  if(s.s0&&s.s0.delivery.some(d=>/郵寄|速遞/.test(d)))A("Stage 5 模組","產品與包裝","包裝與標籤需要色差、材質與工藝的打樣","Stage 0 有郵寄或速遞");
  if(s.s0&&s.s0.delivery.some(d=>/店|診所/.test(d)))A("Stage 5 模組","空間","招牌與室內需要標誌的大尺寸版本與材質樣板","Stage 0 有實體店或診所");
  return H}

// ---------- 完成度 ----------
function completeness(s){
  const lock=pv(s,"langLockup");const reqVar=["lv_black","lv_white","lv_small"].every(x=>s.logoVariants.includes(x))&&(s.logoVariants.includes("lv_h")||s.logoVariants.includes("lv_v"));
  const fam=r=>(s.reg.type[r]||{});const tr=["display","body","cjkDisplay","cjkBody"].filter(r=>fam(r).family&&fam(r).license&&fam(r).license!=="unknown").length;
  const cw=cwList(s),cwKey=["cw_default","cw_inverse","cw_black","cw_white"].every(x=>s.colorways.includes(x));
  const filled=s.cand.filter(c=>c.name&&c.strategy&&c.visual&&Object.values(c.tpc).filter(v=>String(v).trim()).length>=4);
  const keyCards=["logoType","logoStyle","type","palette"];
  const c=[
   ["arch","識別任務與品牌架構",!!picked(s,"archModel")&&!!picked(s,"idJob")&&(!["ij_keep","ij_refresh","ij_rebrand"].includes(pv(s,"idJob"))||count("keepAssets",s)+count("dropAssets",s)>=1)],
   ["brief","識別方向（任務、刻度與關鍵字）",T_(s,"idBrief").length>=6&&dimsDone(s,"dials")>=4&&count("keywords",s)>=3],
   ["logoType","Logo 類型",count("logoType",s)>=1&&count("logoType",s)<=2],
   ["logoStyle","Logo 風格與概念",count("logoStyle",s)>=1&&count("logoStyle",s)<=3&&T_(s,"logoConcept").length>=6],
   ["logoSys","標誌系統與規格",reqVar&&s.logoVariants.length>=5&&!!lock&&!!picked(s,"clearSpace")&&!!picked(s,"vectorStatus")&&!!picked(s,"minSizeStatus")],
   ["type","字體個性方向",count("typePers",s)>=1&&count("typePers",s)<=2],
   ["typeSpec","字體登記與排版",tr>=4&&dimsDone(s,"typeSys")>=4],
   ["colorStyle","色彩風格方向",count("colorStyle",s)>=1&&count("colorStyle",s)<=2],
   ["palette","色票角色與規則",palOk(s)&&palPairs(s).every(p=>p.pass)&&count("colorRules",s)>=4&&dimsDone(s,"colorSys")>=4],
   ["colorways","配色組合",cw.length>=4&&cwKey&&cw.every(x=>!x.res||x.res.pass)&&palOk(s)],
   ["output","輸出需求與後續模組",count("outputNeeds",s)>=1&&count("nextModules",s)>=1&&(!(s.outputNeeds.includes("on_cmyk")||s.outputNeeds.includes("on_spot"))||!!picked(s,"printProfile"))],
   ["compare","候選比較（至少 2 個完整候選）",filled.length>=2&&!!picked(s,"finalDir")],
   ["approval","核准記錄（識別宣言、商標備註、4 個核心項目已送審）",T_(s,"statement").length>=6&&T_(s,"tmNote").length>=3&&keyCards.every(id=>["review","approved"].includes(stMeta(s,id).status))]];
  const done=c.filter(x=>x[2]).length;return {done,total:c.length,pct:Math.round(done/c.length*100),missing:c.filter(x=>!x[2]).map(x=>({key:x[0],label:x[1]}))}}

// ---------- 識別背景文字 ----------
function ctxIdentity(s){const P=id=>{const o=picked(s,id);return o?o.zh:"（尚未選擇）"},X=id=>T_(s,id)||"（尚未填寫）";
  const dials=DIAL_IDS.map(id=>{const d=dimInfo(id);return `${d.left}↔${d.right}：${P(id)}`}).join("；");
  const typeReg=TYPE_ROLES.map(r=>{const x=s.reg.type[r.id]||{};return x.family?`${r.zh}=${x.family}（${(TYPE_LIC.find(l=>l[0]===x.license)||["","未選"])[1]}）`:null}).filter(Boolean).join("；")||"（尚未登記）";
  const pal=PAL_ROLES.map(r=>isHex(s.pal[r.id])?`${r.id}=${normHex(s.pal[r.id])}`:null).filter(Boolean).join("，")||"（尚未設定）";
  return [ctxStages(s),"",`【Stage 4A 目前的答案（空白代表我還沒想）】`,
   `品牌名稱：${X("brandName")}${T_(s,"brandNameEn")?" / "+T_(s,"brandNameEn"):""}｜識別任務：${P("idJob")}｜品牌架構：${P("archModel")}｜任務一句話：${X("idBrief")}`,
   `保留資產：${names("keepAssets",s)}｜更新或放棄：${names("dropAssets",s)}｜一定要保留：${X("mustKeep")}｜絕對要避免：${X("mustAvoid")}`,
   `識別關鍵字：${names("keywords",s)}｜個性刻度：${dials}`,
   `Logo 類型：${names("logoType",s)}｜Logo 風格：${names("logoStyle",s)}｜概念：${X("logoConcept")}`,
   `標誌變體：${names("logoVariants",s)}｜雙語：${P("langLockup")}｜淨空間：${P("clearSpace")}｜向量母檔：${P("vectorStatus")}｜最小尺寸測試：${P("minSizeStatus")}`,
   `字體個性：${names("typePers",s)}｜字體登記：${typeReg}｜字級比例：${P("tyScale")}｜基準：${P("tyBase")}｜中文行高：${P("tyLhCjk")}｜行長：${P("tyMeasure")}`,
   `色彩風格：${names("colorStyle",s)}｜比例：${P("cRatio")}｜彩度：${P("cChroma")}｜中性色：${P("cNeutral")}｜對比目標：${P("cContrast")}｜深色模式：${P("cDark")}｜狀態色：${P("cStatus")}`,
   `色票：${pal}｜色彩規則：${names("colorRules",s)}｜配色組合：${names("colorways",s)}`,
   `輸出需求：${names("outputNeeds",s)}｜ICC：${P("printProfile")}｜打樣：${P("proofStatus")}｜後續模組：${names("nextModules",s)}`,
   `候選：${s.cand.map(c=>c.name?`${c.id}「${c.name}」`:null).filter(Boolean).join("、")||"（尚未填寫）"}｜目前傾向：${P("finalDir")}｜商標查證備註：${X("tmNote")}｜識別宣言：${X("statement")}`].join("\n")}

// ---------- 輸出 ----------
function detailOf(it){return it&&it.formal?{id:it.id,name:it.zh,explanation:it.desc,visual_features:it.vis,feelings:it.feel,goals_and_contexts:it.fit,avoid_contexts:it.avoid,complements:it.pair,intentional_contrasts:it.contrast,hard_constraints:it.hard,parameters:it.params,image_prompt_template:it.ip,status:"草稿",source:"",license:"",tests:""}:{id:it.id,name:it.zh,explanation:it.desc}}
function buildBrief(s){const c=completeness(s),pk=k=>items(k,s).map(it=>Object.assign({id:it.id,name:it.zh,note:it.desc},it.formal?{detail:detailOf(it)}:{}));
  const sel={};CAT_KEYS.forEach(k=>sel[k]=pk(k));const ch={};DIMS_ALL.forEach(d=>{const o=picked(s,d.id);if(o)ch[d.id]={name:o.zh,note:o.desc}});
  const tx={};TEXTS.forEach(t=>{if(T_(s,t.id))tx[t.id]=T_(s,t.id)});
  const pal={};PAL_ROLES.forEach(r=>{if(isHex(s.pal[r.id]))pal[r.id]=normHex(s.pal[r.id])});
  return {schema:"brand/stage4a-core-identity/v1",status:c.missing.length?"incomplete":"complete",completeness:c.pct,missing:c.missing,approval_enforced:false,
   stage_context:{s0:s.s0,s1:s.s1,s2:s.s2,s3:s.s3},selections:sel,choices:ch,text:tx,palette:pal,registers:s.reg,candidates:s.cand,approvals:Object.fromEntries(CARD_IDS.map(id=>[id,stMeta(s,id)])),
   derived:{palette_pairs:palOk(s)?palPairs(s):[],colorways:cwList(s).map(x=>({id:x.id,name:x.zh,fg:x.res&&x.res.fg,bg:x.res&&x.res.bg,contrast:x.res?+x.res.ratio.toFixed(2):null,pass:x.res?x.res.pass:null})),readiness:readiness(s),downstream_hints:hints(s),impact_log:s.impact},
   consistency_checks:checks(s),identity_context:ctxIdentity(s),
   agent_rules:["AI 提案不等於人類核准；不得把 status 改為 approved。","未知資料（授權、商標、測試結果、核准者）不得自行補寫，須回報人類。","Logo 類型、風格、字體與色彩不是一對一綁定；刻意反差須由人類判斷並記錄理由。","所有候選必須用相同內容比較相同觸點；不適用要寫理由。","consistency_checks 中 warn 或 error 的項目須先由人類確認。","不得輸出主觀的風格相符度分數。","改核心方向（Logo、字體、色票）時，列出受影響的下游項目。","工程、產品結構與印刷製程規格須由專業人士驗證。"]}}

// ---------- 貼回 ----------
function matchItem(k,name){const n=norm(name);if(!n)return null;const L=flat(k);return L.find(i=>i.id===name||norm(i.zh)===n)||L.find(i=>n.length>=2&&(norm(i.zh).includes(n)||(norm(i.zh).length>=2&&n.includes(norm(i.zh)))))||null}
function matchOpt(dimId,name){const d=dimInfo(dimId);if(!d)return null;const n=norm(name);return d.opts.find(o=>o.id===name||norm(o.zh)===n)||d.opts.find(o=>n.length>=2&&(norm(o.zh).includes(n)||(norm(o.zh).length>=2&&n.includes(norm(o.zh)))))||null}
function extractJSON(text){const f=text.match(/```(?:json)?\s*([\s\S]*?)```/i);return JSON.parse(f?f[1]:text.slice(text.indexOf("{"),text.lastIndexOf("}")+1))}
function normalizeBrief(j){if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4a"))return j;const o={};Object.entries(j.selections||{}).forEach(([k,a])=>o[k]=(a||[]).map(x=>x.name));Object.entries(j.choices||{}).forEach(([k,v])=>o[k]=v.name);Object.entries(j.text||{}).forEach(([k,v])=>o[k]=v);o.palette=j.palette||{};o.typeReg=(j.registers||{}).type||{};o.logoReg=(j.registers||{}).logo||{};o.colorReg=(j.registers||{}).color||{};o.candidates=j.candidates;return o}
const CAT2CARD={keepAssets:"arch",dropAssets:"arch",keywords:"brief",logoType:"logoType",logoStyle:"logoStyle",logoVariants:"logoSys",typePers:"type",colorStyle:"colorStyle",colorRules:"palette",colorways:"colorways",outputNeeds:"output",nextModules:"output",compareTouch:"compare"};
const SET2CARD={arch:"arch",dials:"brief",logoSys:"logoSys",typeSys:"typeSpec",colorSys:"palette",outSys:"output",decision:"compare"};
function touchCard(s,card,viaAI){const m=Object.assign({status:"draft",approver:"",version:"0.1",note:""},s.meta[card]||{});if(m.status==="approved"){m.status="revise";s.impact.push({card:CARD_LABEL[card]||card,at:new Date().toISOString().slice(0,10),by:viaAI?"AI 貼回":"人工修改"})}else if(viaAI){m.status="ai"}s.meta[card]=m}
function applyPaste(text,s){const out={applied:[],custom:[],errors:[],unknown:[]};let j;
  try{j=normalizeBrief(extractJSON(text))}catch(e){out.errors.push("找不到可解析的 JSON 區塊（請連同 ```json 區塊一起貼上）");return out}
  const touched=new Set();
  Object.entries(j).forEach(([key,val])=>{
    if(CAT[key]&&Array.isArray(val)){const ids=[],cu=[];val.forEach(n=>{const m=matchItem(key,n);if(m){if(!ids.includes(m.id))ids.push(m.id)}else if(String(n).trim()&&!cu.includes(String(n).trim()))cu.push(String(n).trim())});s[key]=ids;s.custom[key]=cu;touched.add(CAT2CARD[key]);out.applied.push(`${CAT[key].title.replace(/[（(].*/,"")}：${ids.length} 項`+(cu.length?`＋自訂 ${cu.length} 項`:""));cu.forEach(c=>out.custom.push(c));return}
    const d=dimInfo(key);if(d&&typeof val==="string"){const o=matchOpt(key,val);if(o){s.pick[d.set][key]=o.id;touched.add(SET2CARD[d.set]);out.applied.push(`${d.title}：${o.zh}`)}else out.errors.push(`「${d.title}」的值「${val}」不在清單內，未套用`);return}
    if(TEXT_BY[key]&&(typeof val==="string"||typeof val==="number")){s.text[key]=String(val);out.applied.push(TEXT_BY[key].label);return}
    if(key==="palette"&&val&&typeof val==="object"){let c=0;Object.entries(val).forEach(([r,h])=>{if(!PAL_ROLES.some(x=>x.id===r)){out.errors.push(`色票角色「${r}」不存在，已忽略`);return}if(isHex(h)){s.pal[r]=normHex(h);c++}else out.errors.push(`色票 ${r} 的色值「${h}」無效，已忽略`)});if(c){touched.add("palette");out.applied.push(`色票：${c} 個色值`)}return}
    if(key==="typeReg"&&val&&typeof val==="object"){let c=0;Object.entries(val).forEach(([r,x])=>{if(!TYPE_ROLES.some(t=>t.id===r)||!x||typeof x!=="object")return;const pick=(arr,v)=>{const f=arr.find(a=>a[0]===v||a[1]===v);return f?f[0]:""};s.reg.type[r]={family:String(x.family||""),source:pick(TYPE_SRC,x.source),license:pick(TYPE_LIC,x.license),hk:pick(TYPE_HK,x.hk),weights:String(x.weights||"")};c++});if(c){touched.add("typeSpec");out.applied.push(`字體登記：${c} 個角色（授權欄請人工確認）`)}return}
    if(key==="logoReg"&&val&&typeof val==="object"){let c=0;Object.entries(val).forEach(([id,x])=>{if(!byId("logoVariants",id)||!x)return;const st=(LOGO_STATUS.find(a=>a[0]===x.status||a[1]===x.status)||[""])[0];s.reg.logo[id]=Object.assign({},s.reg.logo[id],{status:st==="approved"?"tested":st,screen:String(x.screen||""),print:String(x.print||""),format:String(x.format||""),note:String(x.note||"")});c++});if(c){touched.add("logoSys");out.applied.push(`標誌變體登記：${c} 個（不會自動標為已核准）`)}return}
    if(key==="colorReg"&&val&&typeof val==="object"){let c=0;Object.entries(val).forEach(([r,x])=>{if(!x||typeof x!=="object")return;s.reg.color[r]={cmyk:String(x.cmyk||""),pantone:String(x.pantone||"")};c++});if(c){touched.add("output");out.applied.push(`官方色值：${c} 個（需打樣確認）`)}return}
    if(key==="candidates"&&Array.isArray(val)){let c=0;val.slice(0,3).forEach((x,i)=>{if(!x||typeof x!=="object")return;const cd=s.cand[i];["name","strategy","visual","context","cost","hard","evidence"].forEach(f=>{if(x[f]!==undefined)cd[f]=String(x[f])});[["lt","logoType"],["ls","logoStyle"],["tp","typePers"],["cs","colorStyle"]].forEach(([f,k])=>{const v=x[k]||x[f];if(v){const m=matchItem(k,v);if(m)cd[f]=m.id}});const tt=x.touch||x.tpc;if(tt&&typeof tt==="object")Object.entries(tt).forEach(([t,v])=>{const it=byId("compareTouch",t)||matchItem("compareTouch",t);if(it)cd.tpc[it.id]=String(v)});c++});if(c){touched.add("compare");out.applied.push(`候選方向：${c} 個`)}return}
    out.unknown.push(key)});
  [...touched].filter(Boolean).forEach(c=>touchCard(s,c,true));
  if(touched.size)out.applied.push("已把涉及的卡片標為『AI 提案』（未經人類審視，不是核准）");
  if(!out.applied.length)out.errors.push("JSON 內沒有可辨識的欄位");if(out.unknown.length)out.errors.push("未識別的欄位已忽略："+out.unknown.join("、"));return out}
