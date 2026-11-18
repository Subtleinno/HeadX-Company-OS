
const KEY="brand_stage0_v2";
const norm=t=>String(t||"").replace(/\s+/g,"").toLowerCase();
const emptyState=()=>{const s={pick:{basic:{},name:{},money:{},econ:{},scale:{},legal:{}},text:{currency:"HKD",timezone:"Asia/Hong_Kong"},custom:{}};CAT_KEYS.forEach(k=>{s[k]=[];s.custom[k]=[]});return s};
function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||"null");const e=emptyState();if(!s)return e;const m=Object.assign(e,s);m.custom=Object.assign(e.custom,s.custom||{});m.pick=Object.assign(e.pick,s.pick||{});m.text=Object.assign(e.text,s.text||{});CAT_KEYS.forEach(k=>{if(!Array.isArray(m[k]))m[k]=[];if(!Array.isArray(m.custom[k]))m.custom[k]=[]});return m}catch(x){return emptyState()}}
function save(s){try{localStorage.setItem(KEY,JSON.stringify(s))}catch(x){}}
const flat=k=>CAT[k].groups.flatMap(g=>g.items);
const byId=(k,id)=>flat(k).find(i=>i.id===id);
const labels=(k,s)=>[...s[k].map(id=>(byId(k,id)||{zh:id}).zh),...s.custom[k]];
const items=(k,s)=>[...s[k].map(id=>byId(k,id)||{id,zh:id,desc:""}),...s.custom[k].map(t=>({id:"custom",zh:t,desc:"（自訂）"}))];
const count=(k,s)=>s[k].length+s.custom[k].length;
const dimInfo=id=>DIMS_ALL.find(d=>d.id===id);
const pv=(s,id)=>{const d=dimInfo(id);return d?s.pick[d.set][id]:undefined};
const picked=(s,id)=>{const d=dimInfo(id),v=pv(s,id);return d&&v?d.opts.find(o=>o.id===v)||null:null};
const T_=(s,id)=>String(s.text[id]||"").trim();
const dimsDone=(s,set)=>SETS[set].dims.filter(d=>picked(s,d.id)).length;

const REG_FLAGS=["med","tcm","fin","edu","travel","hotel","alc","food","emp","care","prop","prof","precious","device","hprod","health"];
function flags(s){const f=new Set();s.industry.forEach(id=>{const i=byId("industry",id);(i&&i.r||[]).forEach(x=>f.add(x))});s.regflags.forEach(id=>{const i=byId("regflags",id);if(i&&i.f)f.add(i.f)});return f}
const regulated=s=>{const f=flags(s);return REG_FLAGS.some(x=>f.has(x))};
const claimsRisk=s=>{const f=flags(s);return ["health","hprod","med","tcm","claims"].some(x=>f.has(x))};
const dataRisk=s=>{const f=flags(s);return ["pdata","hdata","child","pay","vuln"].some(x=>f.has(x))};
const physical=s=>["lc_street","lc_unit","lc_share","lc_multi"].some(x=>s.location.includes(x));
const isRunning=s=>["st_new","st_run","st_est","st_rebrand"].includes(pv(s,"status"));
const isPre=s=>["st_idea","st_pre"].includes(pv(s,"status"));
const psTags=s=>new Set(s.pricingStrategy.flatMap(id=>(byId("pricingStrategy",id)||{}).t||[]));
const hasDiscount=s=>s.pricingStrategy.some(id=>(byId("pricingStrategy",id)||{}).disc)||["tc_intro","tc_offpeak","tc_prepay","tc_points","tc_group","tc_freeconsult","tc_sample"].some(id=>s.tactics.includes(id));

// ---------- 單位經濟 ----------
function unitEcon(s){
  const n=id=>{const v=parseFloat(String(T_(s,id)).replace(/[,%\s$]|HKD|港元|元/gi,""));return isFinite(v)?v:null};
  const ticket=n("calcTicket"),m=n("calcMargin"),vis=n("calcVisits"),yrs=n("calcYears"),cac=n("calcCac"),fixed=n("calcFixed"),target=n("calcTarget");
  const gp=ticket!=null&&m!=null?ticket*m/100:null;
  const ltv=gp!=null&&vis!=null&&yrs!=null?gp*vis*yrs:null;
  const ltvCac=ltv!=null&&cac!=null&&cac>0?ltv/cac:null;
  const monthlyGp=gp!=null&&vis!=null?gp*vis/12:null;
  const firstTxn=gp!=null&&cac!=null&&gp>=cac;
  const payback=cac!=null&&monthlyGp>0?(firstTxn?0:cac/monthlyGp):null;
  const breakEven=fixed!=null&&gp>0?fixed/gp:null;
  const targetTxn=fixed!=null&&gp>0?(fixed+(target||0))/gp:null;
  return {ticket,m,vis,yrs,cac,fixed,target,gp,ltv,ltvCac,monthlyGp,payback,firstTxn,breakEven,targetTxn,any:[ticket,m,vis,yrs,cac,fixed].some(x=>x!=null)};
}
const fmt=(x,d=0)=>x==null?"—":Number(x).toLocaleString("en-US",{maximumFractionDigits:d,minimumFractionDigits:d});
function econRows(s){const u=unitEcon(s);return [
 ["每次消費的毛利（港元）",u.gp,"客單價 × 毛利率",fmt(u.gp)],
 ["每位客人終身毛利 LTV（港元）",u.ltv,"每次毛利 × 每年次數 × 維持年數",fmt(u.ltv)],
 ["LTV ÷ 獲客成本",u.ltvCac,"常用經驗法則：3 倍或以上較健康；不是定律",u.ltvCac==null?"—":fmt(u.ltvCac,1)+" 倍"],
 ["回本時間",u.payback,"獲客成本 ÷ 每月毛利；中小企常見參考：12 個月內",u.payback==null?"—":(u.firstTxn?"第一次消費就回本":fmt(u.payback,1)+" 個月")],
 ["每月需成交次數（打平）",u.breakEven,"固定成本 ÷ 每次毛利",u.breakEven==null?"—":fmt(Math.ceil(u.breakEven))+" 次"],
 ["每月需成交次數（達成淨利目標）",u.targetTxn,"（固定成本＋目標淨利）÷ 每次毛利",u.targetTxn==null?"—":fmt(Math.ceil(u.targetTxn))+" 次"]]}
const BAND={gm_1:[0,20],gm_2:[20,40],gm_3:[40,60],gm_4:[60,80],gm_5:[80,100]};

// ---------- 業務背景文字 ----------
function ctxBusiness(s){
  const P=id=>{const o=picked(s,id);return o?o.zh:"（尚未選擇）"},L=k=>labels(k,s).join("、")||"（尚未選擇）",X=id=>T_(s,id)||"（尚未填寫）";
  const u=unitEcon(s);
  return [`業務狀態：${P("status")}${s.reasons.length||s.custom.reasons.length?"｜重塑原因："+L("reasons"):""}`,
  `一句話：我們做「${X("what")}」，主要給「${X("who")}」，收費方式「${X("how")}」`,
  `行業：${L("industry")}｜提供形式：${L("offering")}｜交付：${L("delivery")}`,
  `客人類型：${L("customer")}｜收入形式：${L("revenue")}｜價格定位：${P("priceTier")}｜客單價（港元）：${P("avgTicket")}｜回購頻率：${P("repeat")}`,
  `賺錢策略型態：${L("bmodel")}｜定價策略：${L("pricingStrategy")}`,
  `增加收入的槓桿：${L("levers")}｜具體做法：${L("tactics")}`,
  `單位經濟：毛利率 ${P("grossMargin")}｜獲客成本 ${P("cacLevel")}｜回本 ${P("paybackPeriod")}｜現金流 ${P("cashflow")}｜季節性 ${P("seasonality")}｜產能上限 ${P("capacity")}｜收入集中度 ${P("concentration")}`,
  u.any?`估算：每次毛利 HKD ${fmt(u.gp)}｜LTV HKD ${fmt(u.ltv)}｜LTV÷獲客成本 ${u.ltvCac==null?"—":fmt(u.ltvCac,1)}｜回本 ${u.payback==null?"—":(u.firstTxn?"首次消費":fmt(u.payback,1)+" 個月")}｜每月打平需 ${u.breakEven==null?"—":fmt(Math.ceil(u.breakEven))} 次成交`:"估算：（尚未填寫計算器）",
  `銷售渠道：${L("channels")}｜獲客：${L("acquisition")}`,
  `市場：${L("markets")}｜營運形式：${L("location")}｜服務語言：${L("languages")}`,
  `團隊：${P("team")}｜資金：${P("funding")}｜品牌預算（港元）：${P("brandBudget")}｜上線時間：${P("launchTime")}｜現有客人：${P("customersNow")}`,
  `可能涉及：${L("regflags")}｜業務形式：${P("entity")}｜商業登記：${P("br")}｜商標：${P("tm")}｜牌照／註冊：${P("licence")}`,
  `為什麼做：${X("purpose")}｜願景：${X("vision")}｜價值觀：${L("values")}`,
  `競爭對手：${[1,2,3].map(i=>T_(s,"comp"+i)).filter(Boolean).join("；")||"（尚未填寫）"}｜欣賞的品牌：${[1,2,3].map(i=>T_(s,"admire"+i)).filter(Boolean).join("；")||"（尚未填寫）"}`,
  `12 個月目標：${L("goals")}｜限制：${L("constraints")}｜一定要：${X("mustHave")}｜絕不接受：${X("dealBreaker")}`,
  `名稱現況：${P("nameStatus")}｜名稱語言：${P("nameLang")}｜現有名稱：${X("existingName")}｜候選：${X("nameCandidates").replace(/\n/g,"、")}`,
  `現有資產：${L("assets")}`].join("\n")}

// ---------- 檢查 ----------
function checks(s){
  const out=[],A=(l,m)=>out.push({level:l,msg:m});const f=flags(s);
  const br=pv(s,"br"),en=pv(s,"entity"),lic=pv(s,"licence"),tm=pv(s,"tm"),nm=pv(s,"nameStatus"),lt=pv(s,"launchTime"),bb=pv(s,"brandBudget"),pt=pv(s,"priceTier");
  if(isRunning(s)&&(br==="br_none"||br==="br_na"))A("warn","已營運，但商業登記是「未辦理／不確定」。依稅務局說明，在香港經營業務須在開業起 1 個月內申請商業登記；請盡快確認。");
  if(isRunning(s)&&en==="en_none")A("warn","已營運，但業務形式是「還沒有註冊」，請確認是以獨資、合夥還是公司形式經營。");
  if(isPre(s)&&lt==="lt_now")A("warn","狀態是「未開業」，但上線時間選了「已營運」，請確認。");
  if(lt==="lt_1"&&(br==="br_none"||br==="br_na"))A("info","1 個月內要開業：獨資／合夥須在開業後 1 個月內辦理商業登記；有限公司通常在註冊成立時一併辦理。稅務局不接受尚未開業的獨資／合夥申請。");
  if((regulated(s)||f.has("unsure"))&&lic==="lc_na")A("warn","你的行業或業務涉及可能受規管的範疇，卻選了「確認不需要牌照或註冊」。請用政府 BLIS 自我評估系統核對。");
  if(regulated(s)&&(lic==="lc_unsure"||lic==="lc_need"))A("warn","你的業務涉及可能受規管的範疇，請用 BLIS 自我評估系統確認需要哪些牌照、許可或註冊。");
  if(regulated(s)&&!lic)A("info","你的業務涉及可能受規管的範疇，記得填寫「牌照或專業註冊」並用 BLIS 自我評估。");
  if(f.has("prof")&&!s.regflags.length)A("info","你選了需要專業資格的行業，請在「可能涉及」中確認是否需要註冊。");
  if(["nm_chosen","nm_using"].includes(nm)&&(tm==="tm_n"||!tm))A("warn","名稱已決定／使用中，但還沒查過商標。知識產權署提供公開搜尋，建議在投入設計前先查。");
  if(nm==="nm_none"&&T_(s,"nameCandidates"))A("info","名稱現況是「還沒有名字」，但你寫了候選名稱，請把狀態改為「有幾個候選」。");
  if(f.has("hdata"))A("warn","涉及健康或身體資料，屬較敏感的個人資料。請留意《個人資料（私隱）條例》的六項保障資料原則（收集、準確與保存、使用、保安、公開政策、查閱更正）。");
  else if(f.has("pdata")||f.has("child")||f.has("pay"))A("info","你會收集個人資料（或服務兒童、處理付款）。請留意《個人資料（私隱）條例》的六項保障資料原則。");
  if(claimsRisk(s))A("info","你的業務涉及健康、療效或效果式宣傳。Stage 3 的禁用詞與必備提示句請從嚴設定，並核對《不良廣告（醫藥）條例》及相關專業守則。");
  if(f.has("tcm"))A("info","中醫服務：招牌、網站與宣傳須符合中醫藥管理委員會專業守則（例如不可作比較、優越或保證療效的宣稱）。");
  if(["pt_lux","pt_prem"].includes(pt)&&bb==="bb_1")A("info","價格定位偏高端，但品牌預算低於 1 萬港元。高端感依賴細節與一致性，建議把預算集中在 1–2 個最關鍵的接觸點。");
  if(pt==="pt_budget"&&s.goals.includes("gl_price"))A("warn","價格定位是「平價」，但目標包含「提升價格或定位」，兩者方向相反，請確認。");
  if(s.revenue.includes("rv_sub")&&pv(s,"repeat")==="rp_once")A("warn","收入形式有「訂閱」，但回購頻率是「通常只買一次」，兩者矛盾。");
  if(s.location.includes("lc_online")&&(s.channels.includes("ch_store")||s.delivery.includes("dl_store")))A("warn","營運形式是「純網上」，但渠道或交付包含實體店，請確認。");
  if(s.markets.includes("mk_global")&&s.languages.length&&!s.languages.includes("lg_en"))A("info","市場包含「全球網上」，但服務語言沒有英文。");
  if(s.markets.includes("mk_gba")&&!s.languages.includes("lg_cmn")&&s.languages.length)A("info","市場包含大灣區／內地，但服務語言沒有普通話。");
  if(pv(s,"team")==="tm_1"&&count("offering",s)>=3)A("info","只有一個人卻提供 3 種以上形式，可能太分散，建議先聚焦。");
  if(s.goals.includes("gl_invest")&&pv(s,"customersNow")==="cn_0")A("info","目標是吸引投資，但還沒有客人。投資人通常會看實際的客人證據。");
  if(s.customer.length&&s.customer.every(c=>["cu_b2b","cu_inst"].includes(c))&&s.acquisition.length&&s.acquisition.every(a=>["aq_kol","aq_social","aq_footfall"].includes(a)))A("info","客人是企業／機構，但獲客方式只有社群、KOL 或舖位人流，可能觸及不到採購者。");
  if(isRunning(s)&&!count("assets",s))A("warn","已營運或要重塑，但「現有品牌資產」還沒填。");
  if(pv(s,"status")==="st_rebrand"&&!count("reasons",s))A("warn","要重塑品牌，但還沒選重塑原因。");
  if(count("values",s)>5)A("warn","價值觀超過 5 個，會失去取捨的意義。");
  if(T_(s,"mustHave")&&T_(s,"dealBreaker")&&T_(s,"mustHave")===T_(s,"dealBreaker"))A("warn","『一定要做到的事』與『絕對不接受的事』內容相同。");
  // ----- 賺錢策略 -----
  const ts=psTags(s),lv=s.levers,tc=s.tactics,bm=s.bmodel,cp=pv(s,"capacity"),u=unitEcon(s),mg=pv(s,"grossMargin");
  if(["pt_budget"].includes(pt)&&(ts.has("skim")||ts.has("value")||ts.has("nodisc")))A("warn","價格定位是「平價」，但定價策略是撇脂／價值導向／不打折，方向不一致。");
  if(["pt_lux","pt_prem"].includes(pt)&&(ts.has("pen")||ts.has("trial")))A("warn","價格定位偏高端，但定價策略有滲透定價或免費試用。低價入場可能留下『便宜貨』的印象，之後也難加價。");
  if(["pt_lux"].includes(pt)&&(tc.includes("tc_intro")||tc.includes("tc_offpeak")||tc.includes("tc_threshold")))A("info","高端定位搭配折扣類做法（首次體驗價、離峰優惠、滿額優惠），請確認不會稀釋品牌格調。");
  if(ts.has("nodisc")&&hasDiscount(s))A("warn","你選了『不打折』，但同時選了折扣類的策略或做法（例如首次體驗價、預付折扣、離峰優惠），兩者矛盾。");
  if(ts.has("dynamic")&&!tc.includes("tc_offpeak")&&!tc.includes("tc_peak")&&s.levers.includes("lv_util")===false)A("info","你選了時段／動態定價，但沒有選對應的產能做法（離峰優惠或尖峰加價）。");
  if(bm.includes("bm_sub")&&!lv.includes("lv_ret")&&!tc.some(x=>["tc_membership","tc_longplan","tc_report","tc_winback","tc_feedback"].includes(x)))A("info","賺錢策略是訂閱制，但沒有選『留存』相關的槓桿或做法。訂閱的利潤來自留存。");
  if(bm.includes("bm_razor")&&!s.offering.some(x=>["of_goods","of_hwsw"].includes(x)))A("warn","賺錢策略是『刀片與刀架』，但提供形式沒有實體商品或硬件＋軟件，似乎沒有可持續銷售的耗材。");
  if(bm.includes("bm_platform")&&!s.offering.includes("of_platform"))A("info","賺錢策略有平台抽佣，但提供形式沒有『平台／市集』。");
  if(bm.includes("bm_data"))A("warn","『數據變現』是最容易傷害信任的做法，且須符合《個人資料（私隱）條例》；請務必核對並先設定 Stage 1 的 Anti-Persona（過度收集個資）。");
  if(bm.includes("bm_freemium")&&mg==="gm_1")A("info","免費增值需要足夠的付費轉化來覆蓋免費部分成本，而毛利率很低時更難平衡。");
  if(bm.includes("bm_project")&&(cp==="cp_1"))A("info","專案／顧問制的收入受你的時間限制。要突破天花板，可考慮提高客單價或把做法產品化。");
  if(bm.includes("bm_hybrid")&&bm.length<2)A("info","選了『混合型』，請在上面再選一個主要型態，說明哪一種是主角。");
  if(s.goals.includes("gl_first")&&!lv.includes("lv_acq")&&lv.length)A("info","12 個月目標是找到首批客人，但槓桿沒有選『獲取更多新客』。");
  if(s.goals.includes("gl_repeat")&&!lv.some(x=>["lv_freq","lv_ret","lv_ref"].includes(x))&&lv.length)A("info","12 個月目標是增加回頭客，但槓桿沒有選回購頻率、留存或轉介。");
  if(s.goals.includes("gl_price")&&!lv.includes("lv_price")&&!lv.includes("lv_aov")&&lv.length)A("info","12 個月目標是提升價格或定位，但槓桿沒有選『提高價格』或『提高客單價』。");
  if(["cp_1","cp_2"].includes(cp)&&lv.includes("lv_acq")&&!lv.some(x=>["lv_price","lv_aov","lv_util"].includes(x)))A("info","產能上限來自人員時間或場地時段，單靠『獲取更多新客』會很快撞到天花板，可考慮同時提高價格、客單價或利用率。");
  lv.forEach(id=>{if(!tc.some(t=>(byId("tactics",t)||{}).lv===id))A("info","槓桿「"+(byId("levers",id)||{zh:id}).zh+"」還沒有對應的具體做法。")});
  if(tc.includes("tc_proof")&&claimsRisk(s))A("warn","你選了案例與見證，而業務涉及健康或療效宣稱。這類宣傳風險最高，請核對《不良廣告（醫藥）條例》與專業守則後再使用。");
  if(tc.includes("tc_kol")&&claimsRisk(s))A("info","與網紅或專家合作，宣稱內容同樣要符合健康與療效相關規定。");
  if(tc.includes("tc_guarantee")&&claimsRisk(s))A("warn","『退款或滿意保證』在健康類業務容易被視為效果承諾，請謹慎。");
  if(tc.includes("tc_refreward")&&dataRisk(s))A("info","推薦獎勵會牽涉收集第三方（被推薦人）的個人資料，請在設計流程時留意個人資料規定。");
  if(tc.includes("tc_ppc")&&s.constraints.includes("ct_budget")&&pv(s,"brandBudget")==="bb_1")A("info","預算有限時，付費廣告要先設定上限並追蹤轉化，否則容易超支。");
  if(s.revenue.includes("rv_package")||bm.includes("bm_prepay")){if(pv(s,"cashflow")&&pv(s,"cashflow")!=="cf_1")A("info","你有預付套票或儲值，但現金流特徵不是『先收錢後服務』，請確認。")}
  if(pv(s,"cashflow")==="cf_4"&&(pv(s,"brandBudget")==="bb_1"||s.constraints.includes("ct_budget")))A("info","要先買貨、庫存壓資金，而預算有限：請小心控制庫存量，考慮預售或小批量測試。");
  if(pv(s,"concentration")==="cc_4"&&pv(s,"team")==="tm_1")A("info","收入依賴單一專家，而團隊只有你一個人：你本人就是最大的風險，請考慮流程標準化或培訓接班人。");
  if(pv(s,"concentration")==="cc_3"&&s.channels.length<=1)A("info","收入依賴單一渠道，而渠道只有一個：任何平台規則改變都會直接影響收入。");
  if(pv(s,"seasonality")==="sn_3"&&pv(s,"cashflow")==="cf_5")A("info","有明顯淡季又要先投入大額，現金儲備必須撐過淡季。");
  if(mg==="gm_6"&&!u.gp)A("info","毛利率還不知道。毛利率是定價與折扣的底線，請先用卡片 09 的計算器估算。");
  if(BAND[mg]&&u.m!=null&&(u.m<BAND[mg][0]-5||u.m>BAND[mg][1]+5))A("warn","你選的毛利率區間與計算器輸入（"+u.m+"%）不一致，請確認。");
  if(u.m!=null&&u.m<30&&hasDiscount(s))A("warn","毛利率只有 "+u.m+"%，卻同時使用折扣類策略或做法。折扣會直接吃掉利潤，請先試算折扣後的毛利。");
  if(u.m!=null&&(u.m<0||u.m>100))A("warn","毛利率應介乎 0–100%。");
  if(u.ltvCac!=null){
    if(u.ltvCac<1)A("warn","每位客人的終身毛利（HKD "+fmt(u.ltv)+"）低於獲客成本（HKD "+fmt(u.cac)+"），每獲得一位客人都在虧錢，除非只是短期投入。");
    else if(u.ltvCac<3)A("warn","LTV÷獲客成本只有 "+fmt(u.ltvCac,1)+" 倍，低於常見經驗法則（3 倍以上較健康）。這只是經驗法則，不是定律；請同時看回本時間與現金流。");
    else if(u.ltvCac>5)A("info","LTV÷獲客成本為 "+fmt(u.ltvCac,1)+" 倍，高於 5 倍，常見解讀是可能在成長投入上偏保守，仍需看產能是否撐得住。")}
  if(u.payback!=null&&!u.firstTxn&&u.payback>12)A("warn","回本時間約 "+fmt(u.payback,1)+" 個月，超過常見參考（中小企 12 個月內）。拉長的回本期需要足夠的現金支撐。");
  if(u.breakEven!=null&&u.breakEven>0&&cp==="cp_1"&&u.ticket!=null&&u.breakEven>200)A("info","每月需成交約 "+fmt(Math.ceil(u.breakEven))+" 次才打平，而產能上限來自專業人員時間，請確認這個次數是否做得到。");
  return out}

// ---------- 給下游階段的建議 ----------
function hints(s){
  const H=[],A=(stage,field,text,why)=>H.push({stage,field,text,why});const f=flags(s),ts=psTags(s);
  const names=k=>labels(k,s);
  s.industry.forEach(id=>{const i=byId("industry",id);if(i&&i.s1)A("Stage 1","市場類別",`建議選「${i.s1}」`,`你的行業是「${i.zh}」`)});
  if(claimsRisk(s)){A("Stage 3","禁用詞","預選整類：絕對保證、醫療宣稱、恐嚇與焦慮","你的業務涉及健康或效果式宣傳");A("Stage 3","必備提示句","建議：效果因人而異；請先諮詢註冊醫師或專業人士；本資訊不能取代專業診斷與治療","涉及健康建議或療效描述");A("Stage 3","情境語氣","「健康／效果相關資訊」＝更嚴謹（合規優先）","高風險內容");A("Stage 3","用語偏好","描述效果用「有助於」或「支援」，避免「效果」","避免被視為承諾");A("Stage 1","Anti-Persona","建議包含：誇大療效／絕對保證、製造焦慮／恐嚇、冒充醫療診斷","涉及健康宣稱")}
  if(dataRisk(s))A("Stage 1","Anti-Persona","建議包含：過度收集個資",f.has("hdata")?"收集健康資料":"收集個人資料");
  if(f.has("child")||f.has("vuln"))A("Stage 3","語氣","偏溫和、不使用壓迫式字眼，並避免讓兒童或弱勢者承受壓力","服務對象較易受影響");
  if(s.customer.some(c=>["cu_b2b","cu_pro","cu_inst"].includes(c))){A("Stage 3","語氣刻度","『正式／隨和』偏正式；稱呼用姓氏＋稱謂","客人是企業、專業夥伴或機構");A("Stage 1","客群","客人與使用者可能不同，請同時定義採購者與使用者","B2B 或專業夥伴")}
  if(s.customer.includes("cu_family"))A("Stage 1","客群","買的人不是用的人：兩邊的顧慮都要寫","為家人購買");
  const lg=s.languages;
  if(lg.includes("lg_yue")&&lg.includes("lg_en"))A("Stage 3","語言規則","書寫形態建議「港式書面語」，中英夾雜選「只保留品牌與專有名詞的英文」","同時服務廣東話與英文讀者");
  if((s.markets.includes("mk_gba")||(lg.includes("lg_cmn")&&!lg.includes("lg_yue")))&&s.languages.length)A("Stage 3","語言規則","書寫形態建議「標準書面中文」，避免粵語用字","面向普通話或內地讀者");
  if(["pt_lux","pt_prem"].includes(pv(s,"priceTier"))){A("Stage 2","材質與物理規則","偏精緻、留白多、細節克制的材質與表面","價格定位偏高端");A("Stage 1","Anti-Persona","建議包含：廉價促銷感、限時倒數壓迫","價格定位偏高端")}
  if(pv(s,"brandBudget")==="bb_1"){A("Stage 2","風格","避免需要大量客製攝影或特殊材質的風格","品牌預算低於 1 萬港元");A("Stage 4","字體與色彩","優先選擇開源字體與簡單色彩系統","預算有限")}
  if(s.delivery.includes("dl_ship"))A("Stage 2","觸感","包裝與開箱觸感是品牌的一部分，請認真選擇","需要郵寄或速遞");
  if(s.delivery.includes("dl_store")||physical(s))A("Stage 2","光線與氛圍","需要同時考慮店內實際光線與空間，而不只是螢幕","有實體空間");
  if(s.delivery.includes("dl_video")||s.delivery.includes("dl_cloud")||s.location.includes("lc_online"))A("Stage 2","動態與聲音","介面動態與提示聲是主要接觸點","數碼交付");
  if(s.offering.includes("of_platform")||s.offering.includes("of_hwsw"))A("Stage 1","客群","涉及兩邊或兩層使用者（供應與需求，或裝置與 App），請分別定義","平台或硬件＋軟件");
  if(pv(s,"status")==="st_rebrand")A("Stage 1","流程","先決定現有品牌資產哪些保留、哪些丟棄，再定位",`現有資產：${names("assets").join("、")||"未填寫"}`);
  if(isPre(s))A("Stage 1","提問方式","可跳過『現有替代方案』的客人行為細節，改為先用訪談或小規模測試驗證","尚未開業，缺乏客人數據");
  if(pv(s,"nameStatus")==="nm_none")A("Stage 1","品牌名稱","在 Stage 1 最後一步做命名研究，並先避開已被註冊的商標","還沒有名字");
  // 賺錢策略
  if(ts.has("value")||ts.has("skim")||ts.has("nodisc"))A("Stage 1","定位宣言","必須清楚說出『客人得到什麼價值』，因為你的價格不是靠便宜取勝","定價策略是價值導向／撇脂／不打折");
  if(ts.has("value")||ts.has("nodisc")||ts.has("skim"))A("Stage 3","禁用詞","壓迫促銷類（限時、最後機會、搶購等）請整類禁用","價格靠價值而非促銷支撐");
  if(hasDiscount(s))A("Stage 3","語氣與用語","折扣要說清楚條件（對象、期限、內容），不使用『限時』『最後機會』式的壓迫字眼","你有折扣類策略或做法");
  if(s.bmodel.includes("bm_sub")||s.revenue.includes("rv_sub"))A("Stage 1","Anti-Persona","建議包含：暗黑模式介面（難以取消訂閱）","訂閱制");
  if(s.bmodel.includes("bm_data"))A("Stage 1","Anti-Persona","建議包含：過度收集個資","數據變現");
  if(s.bmodel.includes("bm_razor"))A("Stage 2","觸感與包裝","耗材包裝與補充流程的體驗，是持續收入的關鍵","刀片與刀架");
  if(s.bmodel.includes("bm_svcprod")||s.tactics.includes("tc_homecare"))A("Stage 3","Anti-Persona","建議包含：硬廣式推銷、推銷式連鎖美容院","服務帶產品容易變成硬推銷");
  if(s.levers.some(x=>["lv_freq","lv_ret","lv_ref"].includes(x)))A("Stage 3","情境語氣","EDM／WhatsApp 的語氣要設定清楚（提醒、關懷、喚回），避免變成騷擾","你重視回購、留存或轉介");
  if(s.tactics.includes("tc_refreward"))A("Stage 3","必備提示句","推薦獎勵的條款需要簡單說明","雙邊推薦獎勵");
  if(s.tactics.includes("tc_proof"))A("Stage 3","必備提示句","見證與案例旁加上『個別結果可能不同』等提示（並核對健康類的廣告規定）","使用案例與見證");
  if(s.levers.includes("lv_price")||s.levers.includes("lv_aov"))A("Stage 1","定位","價格上調必須有可被說出的理由（品質、資歷、成果），否則客人只感到被加價","提高價格或客單價");
  return H}

// ---------- 起步清單 ----------
function checklist(s){
  const L=[],A=(id,title,status,detail,links)=>L.push({id,title,status,detail,links:links||[]});const f=flags(s),br=pv(s,"br"),tm=pv(s,"tm"),lic=pv(s,"licence"),dm=pv(s,"domain"),nm=pv(s,"nameStatus");
  A("br","商業登記",br==="br_done"?"done":br==="br_ing"?"doing":"todo",
    br==="br_done"?"已有商業登記。":(isPre(s)?"稅務局不接受尚未開業的獨資／合夥申請，須在開業後 1 個月內辦理；有限公司通常在註冊成立時一併辦理。":isRunning(s)?"已營運請盡快確認：獨資／合夥須在開業起 1 個月內申請。逾期可能被追收過往年度費用，並可能被罰款，請以稅務局為準。":"請確認開業日期，並在開業後 1 個月內辦理。"),[LINKS.br,LINKS.brOnline]);
  const lics=s.industry.map(id=>byId("industry",id)).filter(i=>i&&i.lic).map(i=>`【${i.zh}】${i.lic}`);
  A("licence","牌照、許可或專業註冊",lic==="lc_have"?"done":lic==="lc_ing"?"doing":lic==="lc_na"?"check":"todo",
    (lics.length?lics.join("\n")+"\n":"")+"香港沒有單一的通用營業牌照；是否需要，視乎行業與活動。請用 BLIS 自我評估，並確認需要先有商業登記證。",[LINKS.blis]);
  A("trademark","商標搜尋與註冊",tm==="tm_r"||tm==="tm_a"?"done":nm==="nm_none"?"later":"todo",
    nm==="nm_none"?"還沒有名字，待命名後再做。":"先用知識產權署的公開搜尋查有無相同或相似的商標，再決定是否申請；申請前建議諮詢專業人士。",[LINKS.tm]);
  A("domain","網域與社群帳號",dm&&dm!=="dm_n"&&dm!=="dm_unsure"?"done":nm==="nm_none"?"later":"todo",nm==="nm_none"?"待命名後再做。":"在公開宣傳前先確認網域與主要社群帳號名稱可用，並盡量一致。",[]);
  if(dataRisk(s))A("pdpo","個人資料保障","todo","收集個人資料須符合六項保障資料原則：收集目的與方式、準確性與保存期、使用、保安、公開政策、查閱與更正。請在網站與表格上清楚說明收集目的。"+(f.has("hdata")?"健康資料更為敏感，請加倍小心。":""),[LINKS.pcpd]);
  if(claimsRisk(s))A("ads","廣告與宣稱審查","todo","涉及健康或療效式宣傳。請核對《不良廣告（醫藥）條例》及所屬專業的守則，並在 Stage 3 設定禁用詞與必備提示句。",[LINKS.umao]);
  if(isRunning(s)&&count("assets",s))A("assets","整理現有品牌資產","todo",`逐項決定保留或更新：${labels("assets",s).join("、")}。`,[]);
  const u=unitEcon(s);
  if(!u.gp)A("econ","估算單位經濟","todo","在卡片 09 填入客單價、毛利率、回購次數、獲客成本與固定成本，才知道每月要成交多少次才打平。",[]);
  return L}

// ---------- 業務畫布 ----------
function canvas(s){const L=k=>labels(k,s),P=id=>{const o=picked(s,id);return o?o.zh:""},X=id=>T_(s,id),j=a=>a.filter(Boolean);
  const tcs=lvs=>s.tactics.map(id=>byId("tactics",id)).filter(i=>i&&lvs.includes(i.lv)).map(i=>i.zh);
  return [
  {id:"customer_segments",zh:"客群",en:"Customer Segments",lines:j([L("customer").join("、"),X("who")])},
  {id:"value_propositions",zh:"價值主張",en:"Value Propositions",lines:j([X("what"),X("purpose")])},
  {id:"channels",zh:"渠道",en:"Channels",lines:j([L("channels").join("、"),L("delivery").length?"交付："+L("delivery").join("、"):"",tcs(["lv_acq"]).length?"獲客做法："+tcs(["lv_acq"]).join("、"):""])},
  {id:"customer_relationships",zh:"客人關係",en:"Customer Relationships",lines:j([L("acquisition").length?"獲客："+L("acquisition").join("、"):"",P("repeat")?"回購："+P("repeat"):"",tcs(["lv_freq","lv_ret","lv_ref"]).length?"關係做法："+tcs(["lv_freq","lv_ret","lv_ref"]).join("、"):""])},
  {id:"revenue_streams",zh:"收入來源",en:"Revenue Streams",lines:j([L("revenue").join("、"),L("bmodel").length?"賺錢策略："+L("bmodel").join("、"):"",L("pricingStrategy").length?"定價策略："+L("pricingStrategy").join("、"):"",X("how"),P("priceTier")?"價格定位："+P("priceTier"):"",P("avgTicket")?"客單價（港元）："+P("avgTicket"):""])},
  {id:"key_resources",zh:"關鍵資源",en:"Key Resources",lines:j([P("team")?"團隊："+P("team"):"",X("founder"),L("assets").length?"品牌資產："+L("assets").join("、"):"",P("licence")?"牌照／註冊："+P("licence"):"",P("capacity")?"產能上限："+P("capacity"):""])},
  {id:"key_activities",zh:"關鍵活動",en:"Key Activities",lines:j([L("offering").join("、"),L("delivery").join("、")])},
  {id:"key_partners",zh:"關鍵合作夥伴",en:"Key Partnerships",lines:j([X("partners")])},
  {id:"cost_structure",zh:"成本結構",en:"Cost Structure",lines:j([X("costs"),P("grossMargin")?"毛利率："+P("grossMargin"):"",X("calcFixed")?"每月固定成本：HKD "+X("calcFixed"):""])}]}

// ---------- 完成度 ----------
function completeness(s){
  const run=isRunning(s),reb=pv(s,"status")==="st_rebrand";
  const c=[
   ["status","業務狀態（營運中／重塑須填資產與原因）",!!picked(s,"status")&&(!run||count("assets",s)>=1)&&(!reb||count("reasons",s)>=1)],
   ["oneline","一句話說明（做什麼／給誰／怎麼收錢）",T_(s,"what").length>=4&&T_(s,"who").length>=2&&T_(s,"how").length>=2],
   ["industry","行業",count("industry",s)>=1],
   ["offering","提供形式與交付",count("offering",s)>=1&&count("delivery",s)>=1],
   ["model","客人類型、收入形式與價格定位",count("customer",s)>=1&&count("revenue",s)>=1&&!!picked(s,"priceTier")],
   ["earn","賺錢策略型態",count("bmodel",s)>=1],
   ["pricing","定價策略",count("pricingStrategy",s)>=1],
   ["growth","增加收入的槓桿與做法（至少 1 個槓桿、3 個做法）",count("levers",s)>=1&&count("tactics",s)>=3],
   ["econ","單位經濟（至少 5/7 項＋計算器 4 項數字）",dimsDone(s,"econ")>=5&&["calcTicket","calcMargin","calcVisits","calcCac"].every(k=>unitEcon(s)&&String(T_(s,k)).length>0)],
   ["channels","渠道與獲客",count("channels",s)>=1&&count("acquisition",s)>=1],
   ["market","市場、地點與語言",count("markets",s)>=1&&count("location",s)>=1&&count("languages",s)>=1],
   ["resources","規模、預算與時間",!!picked(s,"team")&&!!picked(s,"brandBudget")&&!!picked(s,"launchTime")],
   ["legal","法規與起步狀態（5 項＋可能涉及）",dimsDone(s,"legal")>=5&&count("regflags",s)>=1],
   ["purpose","品牌目的與價值觀（3–5 個）",T_(s,"purpose").length>=6&&count("values",s)>=3&&count("values",s)<=5],
   ["compete","競爭對手（至少 1 個）",T_(s,"comp1").length>=2],
   ["goals","目標與限制",count("goals",s)>=1&&count("constraints",s)>=1],
   ["name","名稱現況",!!picked(s,"nameStatus")],
   ["company","公司基本資料（名稱與電郵）",(T_(s,"legalZh")||T_(s,"legalEn")||T_(s,"trading")).length>=2&&/.+@.+\..+/.test(T_(s,"email"))]];
  const done=c.filter(x=>x[2]).length;return {done,total:c.length,pct:Math.round(done/c.length*100),missing:c.filter(x=>!x[2]).map(x=>({key:x[0],label:x[1]}))}}

function buildBrief(s){const c=completeness(s),pk=k=>items(k,s).map(i=>({id:i.id,name:i.zh,note:i.desc}));
  const sel={};CAT_KEYS.forEach(k=>sel[k]=pk(k));const ch={};DIMS_ALL.forEach(d=>{const o=picked(s,d.id);if(o)ch[d.id]={name:o.zh,note:o.desc}});
  const tx={};TEXTS.forEach(t=>{if(T_(s,t.id))tx[t.id]=T_(s,t.id)});
  const f=[...flags(s)],u=unitEcon(s);
  return {schema:"brand/stage0-business/v2",status:c.missing.length?"incomplete":"complete",completeness:c.pct,missing:c.missing,
   selections:sel,choices:ch,text:tx,
   derived:{flags:f,regulated:regulated(s),claims_risk:claimsRisk(s),data_risk:dataRisk(s),running:isRunning(s),pre_launch:isPre(s),has_discount:hasDiscount(s),licence_notes:s.industry.map(id=>byId("industry",id)).filter(i=>i&&i.lic).map(i=>({industry:i.zh,note:i.lic})),
     unit_economics:{gross_profit_per_transaction:u.gp,ltv:u.ltv,ltv_to_cac:u.ltvCac,payback_months:u.payback,first_transaction_payback:u.firstTxn,break_even_transactions_per_month:u.breakEven,target_transactions_per_month:u.targetTxn,note:"LTV÷CAC≥3、回本期＜12 個月只是常見經驗法則，不是定律。"}},
   business_canvas:canvas(s),downstream_hints:hints(s),startup_checklist:checklist(s),consistency_checks:checks(s),business_context:ctxBusiness(s),
   agent_rules:["所有後續階段與文案必須與 business_context 一致。","derived.claims_risk 或 regulated 為 true 時，涉及健康、療效、價格的內容必須保守，並附上必備提示句。","derived.has_discount 為 true 時，折扣必須說明對象、期限與內容，不使用壓迫式字眼。","startup_checklist 只是提醒，不構成法律意見；需要時請人類諮詢專業人士。","status 為 incomplete 時，缺少的欄位不得自行補寫，須回報人類。","不得把公司資料（地址、電話、電郵）放進對外文案，除非人類明確要求。"]}}

// ---------- 貼回 ----------
function matchItem(k,name){const n=norm(name);if(!n)return null;const L=flat(k);return L.find(i=>i.id===name||norm(i.zh)===n)||L.find(i=>n.length>=2&&(norm(i.zh).includes(n)||(norm(i.zh).length>=2&&n.includes(norm(i.zh)))))||null}
function matchOpt(dimId,name){const d=dimInfo(dimId);if(!d)return null;const n=norm(name);return d.opts.find(o=>o.id===name||norm(o.zh)===n)||d.opts.find(o=>n.length>=2&&(norm(o.zh).includes(n)||(norm(o.zh).length>=2&&n.includes(norm(o.zh)))))||null}
function extractJSON(text){const f=text.match(/```(?:json)?\s*([\s\S]*?)```/i);return JSON.parse(f?f[1]:text.slice(text.indexOf("{"),text.lastIndexOf("}")+1))}
function normalizeBrief(j){if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage0"))return j;const o={};
  Object.entries(j.selections||{}).forEach(([k,a])=>o[k]=(a||[]).map(x=>x.name));Object.entries(j.choices||{}).forEach(([k,v])=>o[k]=v.name);Object.entries(j.text||{}).forEach(([k,v])=>o[k]=v);return o}
function applyPaste(text,s){const out={applied:[],custom:[],errors:[],unknown:[]};let j;
  try{j=normalizeBrief(extractJSON(text))}catch(e){out.errors.push("找不到可解析的 JSON 區塊（請連同 ```json 區塊一起貼上）");return out}
  const aliases={industries:"industry",customers:"customer",business_model:"bmodel",pricing:"pricingStrategy",anti:null,tags:null};
  Object.entries(j).forEach(([key0,val])=>{const key=aliases.hasOwnProperty(key0)?aliases[key0]:key0;if(!key)return;
    if(CAT[key]&&Array.isArray(val)){const ids=[],cu=[];val.forEach(n=>{const m=matchItem(key,n);if(m){if(!ids.includes(m.id))ids.push(m.id)}else if(String(n).trim()&&!cu.includes(String(n).trim()))cu.push(String(n).trim())});
      s[key]=ids;s.custom[key]=cu;out.applied.push(`${CAT[key].title.replace(/[（(].*/,"")}：${ids.length} 項`+(cu.length?`＋自訂 ${cu.length} 項`:""));cu.forEach(c=>out.custom.push(c));return}
    const d=dimInfo(key);if(d&&typeof val==="string"){const o=matchOpt(key,val);if(o){s.pick[d.set][key]=o.id;out.applied.push(`${d.title}：${o.zh}`)}else out.errors.push(`「${d.title}」的值「${val}」不在清單內，未套用`);return}
    if(TEXT_BY[key]&&(typeof val==="string"||typeof val==="number")){s.text[key]=String(val);out.applied.push(TEXT_BY[key].label);return}
    out.unknown.push(key0)});
  if(!out.applied.length)out.errors.push("JSON 內沒有可辨識的欄位");if(out.unknown.length)out.errors.push("未識別的欄位已忽略："+out.unknown.join("、"));return out}
