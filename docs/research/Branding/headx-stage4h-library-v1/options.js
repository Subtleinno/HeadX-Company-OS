
// ===== Stage 04H · 風格庫與 AI 生成契約 — 完整選項庫 v1 =====
// 範圍依《品牌創意系統範圍重整》：風格庫（把漸變、Pattern、紋理、配色變體存成可重用條目，附 Image Prompt 與負面約束）與 AI 生成契約（情緒板／Behance 參考、風格選擇、提示詞、模型、生成參數、參考圖、禁止項、驗收）。
// 這是 Stage 4 的最後一站：把 4A–4G 的規格、禁區與治理變成 AI 可讀的條目與守門規則。可讀性、無障礙、授權、私隱與合規屬硬性限制；風格一致屬人類判斷。不提供「風格相符度」分數。
// 本原型不指定任何模型或供應商，也不判斷任何工具的條款可否商用；模型條款、版權歸屬與披露要求因工具與法域而異，須逐項核對並由合資格專業人士確認，這不是法律意見。
// 色彩距離（ΔE76）與尺寸量度只是事實量度，用來輔助驗收，不代表風格相符；圖片只在你的瀏覽器內分析，不會上傳。
const P=s=>{const a=s.split("|");const n=i=>{const v=parseFloat(a[i]);return isFinite(v)?v:0};return{id:a[0],zh:a[1],desc:a[2],fit:a[3],avoid:a[4],pair:a[5],t:a[6]?a[6].split(","):[],sw:a[7]||"",conf:a[8]?a[8].split(","):[],cost:n(9),n1:n(10),n2:n(11),risk:n(12)===1,pro:n(13)===1,auto:n(14)===1,note:a[15]||""}};
const CAT={
libTypes:{title:"風格庫條目類型（12 種）",max:12,pv:"",hint:"選要維護的條目類型。每個條目都是一個可重用的「風格零件」：規格、Image Prompt、負面約束、允許與禁止用途、版本與核准。",groups:[{g:"類型",items:[
P("lt_grad|漸變|||須附色標與對比說明（4B）。|||||0|0|0|0|0|0|"),
P("lt_pat|Pattern（無縫圖案）|||AI 圖案的接縫與重複須人手驗證；正式版建議用向量重製。|||||0|0|0|0|0|0|"),
P("lt_tex|紋理|||紋理圖常有重複感與雜訊。|||||0|0|0|0|0|0|"),
P("lt_cw|配色變體|||須對應 4G 的允許與禁止場景。|||||0|0|0|0|0|0|"),
P("lt_shape|形狀與圓角|||形狀條目通常用規則而不是生圖。|||||0|0|0|0|0|0|"),
P("lt_mat|材質與 CMF（3D 與產品）|||AI 材質圖不等於實物色樣（4D）。|||||0|0|0|0|0|0|"),
P("lt_photo|攝影風格|||真人與肖像須同意與披露。|||||0|0|0|0|0|0|"),
P("lt_icon|插圖與圖示風格|||風格模仿須避免指名在世藝術家。|||||0|0|0|0|0|0|"),
P("lt_motion|動態風格|||動態須附減少動態版本（4C）。|||||0|0|0|0|0|0|"),
P("lt_tpl|版面與廣告模板|||宣稱與披露須人類審核（4F）。|||||0|0|0|0|0|0|"),
P("lt_ui|UI 元件風格|||無障礙須實測（4E）。|||||0|0|0|0|0|0|"),
P("lt_space|空間與室內概念|||只是概念，不是建築圖（4E）。|||||0|0|0|0|0|0|")]}]},

useCases:{title:"AI 使用情境（14 種）",max:14,pv:"",hint:"選這個品牌可能用 AI 的情境。每個情境要有「允許／有條件／禁止」、審核層級與是否須披露。風險越高，審核越嚴。",groups:[{g:"情境",items:[
P("uc_sketch|草圖與方向探索|||不可把草圖直接當成品。|||||0|0|0|0|0|0|"),
P("uc_mood|情緒板與提案參考|||參考圖來源與權利須記錄。|||||0|0|0|0|0|0|"),
P("uc_bg|背景、紋理與漸變素材|||色彩須後驗收；印刷須人手重製。|||||0|0|0|0|0|0|"),
P("uc_pattern|圖案與裝飾素材|||接縫與相似度須檢查。|||||0|0|0|0|0|0|"),
P("uc_tpl|社群模板底圖|||文字與標誌在設計軟件加入。|||||0|0|0|0|0|0|"),
P("uc_product|產品概念圖|||不可暗示未驗證的功能（4D）。|||||0|0|0|1|0|0|"),
P("uc_person|人物肖像與模特兒|||肖像、同意、偏見與披露；不可冒充真實人物或客人。|||||0|0|0|1|1|0|"),
P("uc_logo|標誌與標識|||建議禁止：標誌須人手設計並可註冊與保護。|||||0|0|0|1|0|0|"),
P("uc_text|含大量文字的海報|||AI 圖內文字常亂碼；文字應後製。|||||0|0|0|0|0|0|"),
P("uc_ad|廣告成品|||宣稱、披露與授權須完整審核（4F）。|||||0|0|0|1|1|0|"),
P("uc_health|健康或效果相關視覺|||建議禁止：易構成療效暗示（見 4F）。|||||0|0|0|1|1|0|"),
P("uc_video|短影片素材|||字幕、音樂授權與披露（4C）。|||||0|0|0|1|0|0|"),
P("uc_audio|音樂、旁白與聲音|||聲音權、授權與披露（4C）。|||||0|0|0|1|1|0|"),
P("uc_3d|3D 資產與動畫|||工程與認證另計（4D）。|||||0|0|0|1|0|0|")]}]},

modelTypes:{title:"模型與工具類型（8 種）",max:8,pv:"",hint:"選會用到的工具類型。具體工具、版本與條款在模型登記冊裡記錄；原型不指定任何供應商，也不替你判斷哪個工具的條款可否商用。",groups:[{g:"類型",items:[
P("mt_t2i|文字生成圖像（雲端服務）|||條款、可否商用、資料處理因服務而異。|||||0|0|0|1|0|0|"),
P("mt_local|本地或自行託管的圖像模型|||模型授權與訓練資料來源須核對；須管理版本與硬件。|||||0|0|0|1|0|0|"),
P("mt_edit|圖像編輯與修補|||輸入圖片的權利與個資。|||||0|0|0|1|0|0|"),
P("mt_vid|影片生成|||肖像與音樂；披露要求通常更嚴。|||||0|0|0|1|0|0|"),
P("mt_music|音樂生成|||授權與可否註冊；見 4C。|||||0|0|0|1|0|0|"),
P("mt_tts|語音合成|||聲音權與披露；不可冒充真人。|||||0|0|0|1|1|0|"),
P("mt_3d|3D 生成|||拓撲與授權；工程另計。|||||0|0|0|1|0|0|"),
P("mt_llm|文案與提示詞輔助（語言模型）|||不可輸入個資與機密；輸出須人類審稿。|||||0|0|0|1|0|0|")]}]},

refTypes:{title:"參考來源類型（8 種）",max:8,pv:"",hint:"選會使用的參考來源。情緒板用的參考圖，不等於可以丟進 AI 當輸入；每張參考圖要記錄來源、權利與用途。",groups:[{g:"來源",items:[
P("rt_own|自有素材（自己拍、自己畫）|||須確認含第三方肖像或物品。|||||0|0|0|0|0|0|"),
P("rt_stock|授權素材庫|||須確認授權是否涵蓋作為 AI 輸入與衍生。|||||0|0|0|1|0|0|"),
P("rt_client|客戶或合作方提供|||須書面確認可用於 AI。|||||0|0|0|1|0|0|"),
P("rt_vendor|供應商提供|||合約是否允許再用。|||||0|0|0|1|0|0|"),
P("rt_cc|公開資源（CC 等）|||須核對署名、商用與改作條件。|||||0|0|0|1|0|0|"),
P("rt_web|網上收集（Behance、Pinterest 等）|||只適合作內部靈感；通常沒有授權，不可作為 AI 輸入或對外使用。|||||0|0|0|1|0|0|"),
P("rt_ai|AI 生成的參考|||輸出的權利與可重用性須確認。|||||0|0|0|1|0|0|"),
P("rt_comp|他牌或競品作品（僅供對照）|||不可模仿；不可作為輸入。|||||0|0|0|1|0|0|")]}]},

promptRules:{title:"提示詞規則（12 種）",max:12,pv:"",hint:"選這個品牌要遵守的提示詞規則。規則會被 Prompt 檢查器自動檢查。",groups:[{g:"規則",items:[
P("pr_en|提示詞用英文（多數模型對英文較穩定）|||中文品牌名與禁區須另附英文對照。|||||0|0|0|0|0|0|"),
P("pr_only|只使用已核准的風格庫條目|||未核准條目只可用於探索。|||||0|0|0|0|0|0|"),
P("pr_noartist|不指名在世藝術家或特定平台風格|||避免模仿與侵權爭議。|||||0|0|0|0|0|0|"),
P("pr_nobrand|不使用他牌、角色或 IP 名稱|||包括 Disney、Pixar 等。|||||0|0|0|0|0|0|"),
P("pr_nologo|不要求生成標誌；標誌用向量母檔後製|||見 4G。|||||0|0|0|0|0|0|"),
P("pr_text|圖內文字在設計軟件加入，不靠 AI 生成|||避免亂碼與錯字。|||||0|0|0|0|0|0|"),
P("pr_hex|顏色用 HEX，並後驗收|||模型不保證精準色彩。|||||0|0|0|0|0|0|"),
P("pr_one|一次只改一個變數|||便於比較與回溯。|||||0|0|0|0|0|0|"),
P("pr_seed|記錄 seed、模型版本與參數|||不記錄就無法重現。|||||0|0|0|0|0|0|"),
P("pr_neg|必附負面約束|||來自風格庫與各階段禁區。|||||0|0|0|0|0|0|"),
P("pr_nopii|提示詞與輸入不含個人資料與機密|||見 PCPD 清單。|||||0|0|0|0|0|0|"),
P("pr_nochild|不生成可辨識的真實兒童或客人肖像|||兒童與客人尤其敏感。|||||0|0|0|0|0|0|")]}]},

acceptCriteria:{title:"驗收條件（16 種）",max:16,pv:"",hint:"選這個品牌的驗收條件。「自動」代表原型可輔助測量；「人工」必須由人類判斷。驗收是通過或不通過的清單，不是風格相符度分數。",groups:[{g:"驗收",items:[
P("ac_palette|色彩在調色盤內（可上傳圖片量度色彩距離）|||色彩距離只是事實量度，不代表風格相符。|||||0|0|0|0|0|1|"),
P("ac_neg|負面項目沒有出現|||逐項核對禁區。|||||0|0|0|0|0|0|"),
P("ac_text|沒有亂碼或錯字|||AI 圖內文字常出錯。|||||0|0|0|0|0|0|"),
P("ac_logo|沒有未經核准的標誌或類標誌圖形|||不可出現他牌標誌或浮水印。|||||0|0|0|0|0|0|"),
P("ac_human|人體、手與臉沒有明顯錯誤|||包括多餘手指與扭曲。|||||0|0|0|0|0|0|"),
P("ac_ip|沒有可辨識的他牌、角色或在世藝術家風格|||見提示詞規則。|||||0|0|0|1|0|0|"),
P("ac_safe|版面安全區與留白正確|||見 4F。|||||0|0|0|0|0|0|"),
P("ac_contrast|文字與元件對比達標|||見 4E。|||||0|0|0|0|0|0|"),
P("ac_size|尺寸、比例與檔案格式正確（可上傳圖片量度）||||||||0|0|0|0|0|1|"),
P("ac_a11y|附替代文字與字幕|||見 4G。|||||0|0|0|0|0|0|"),
P("ac_disc|已按政策披露 AI 使用|||見披露政策。|||||0|0|0|1|0|0|"),
P("ac_source|來源、授權與參考圖記錄完整|||見參考登記冊。|||||0|0|0|1|0|0|"),
P("ac_log|生成紀錄完整（模型、版本、seed、提示詞、參數）||||||||0|0|0|0|0|1|"),
P("ac_claim|宣稱與文案已人類審核|||見 4F。|||||0|0|0|1|1|0|"),
P("ac_style|風格一致（人類判斷）|||這是主觀判斷，不給分數。|||||0|0|0|0|0|0|"),
P("ac_craft|材質與工藝可行（4B／4D）|||AI 圖不等於可製作。|||||0|0|0|0|1|0|")]}]},

avoidAI:{title:"AI 生成禁區（14 種）",max:99,pv:"",hint:"選至少 6 個。這些禁區會被帶進提示詞檢查、驗收與 AI 守門。",groups:[{g:"禁區",items:[
P("av_artist|模仿在世藝術家或特定創作者風格||-||||||0|0|0|0|0|0|"),
P("av_person|生成真人肖像冒充真實人物、客人或專家||-||||||0|0|0|0|0|0|"),
P("av_fake|生成假見證、假評論或假的前後對比||-||||||0|0|0|0|0|0|"),
P("av_logo|用 AI 生成或重繪品牌標誌||-||||||0|0|0|0|0|0|"),
P("av_ref|使用未授權的參考圖作為輸入||-||||||0|0|0|0|0|0|"),
P("av_undisclosed|未披露的 AI 生成內容（按政策須披露者）||-||||||0|0|0|0|0|0|"),
P("av_pii|把個人資料或機密提交給外部模型||-||||||0|0|0|0|0|0|"),
P("av_cure|生成療效或治療暗示的視覺||-||||||0|0|0|0|0|0|"),
P("av_printcolor|把 AI 圖的顏色當作印刷色或 CMF 色樣||-||||||0|0|0|0|0|0|"),
P("av_final|把 AI 輸出直接當最終印刷或生產檔||-||||||0|0|0|0|0|0|"),
P("av_nolog|沒有記錄 seed、版本與提示詞||-||||||0|0|0|0|0|0|"),
P("av_terms|忽略模型條款（商用、署名、資料處理）||-||||||0|0|0|0|0|0|"),
P("av_child|生成可辨識的真實兒童影像||-||||||0|0|0|0|0|0|"),
P("av_ip|生成他牌 IP、角色或商標||-||||||0|0|0|0|0|0|")]}]}
};

const CAT_KEYS=Object.keys(CAT);
const R=(id,zh,desc,tok,t)=>({id,zh,desc,tok:tok||{},t:t?t.split(","):[]});
const DIMS=[
{id:"aiPolicy",title:"整體 AI 使用態度",q:"品牌對 AI 生成內容的整體立場？",opts:[R("ai_open","開放（在核准用途與核准模型內）","可用於探索與成品素材，但須遵守契約。"),R("ai_limited","受限（只作探索與素材，成品須人手重製）","最常見的穩妥做法。"),R("ai_off","不用於對外成品（只作內部探索）","風險最低。")]},
{id:"reviewLevel",title:"AI 輸出審核層級",q:"AI 輸出發布前誰要看？（高風險情境見使用情境政策）",opts:[R("rv_self","製作者自查","最快；只適合內部探索。"),R("rv_two","第二人審稿（製作者與審核者分開）","對外內容的最低建議。"),R("rv_pro","第二人＋專業人士（合規、法務、工程）","健康、肖像、優惠與產品功能等高風險內容。")]},
{id:"disclosurePolicy",title:"AI 披露與標示政策",q:"什麼時候要標示 AI 生成？",opts:[R("dc_all","所有對外的 AI 輔助內容都標示","最透明；須定義標示方式。"),R("dc_real","寫實人物、聲音與可能誤導的內容必須標示","常見的折衷；須定義『可能誤導』。"),R("dc_none","不主動標示（不建議）","可能違反平台或法域的要求，須專業人士確認。")]},
{id:"provenance",title:"來源紀錄與內容憑證",q:"怎樣記錄 AI 內容的來源？",opts:[R("pv_log","保存生成紀錄（模型、版本、提示詞、seed、參數）","最低限度，沒有它就無法重現與稽核。"),R("pv_c2pa","加上內容憑證／機器可讀標記（如 C2PA 等標準，視工具支援）","部分法域要求提供者標記；須核對工具功能。"),R("pv_both","兩者皆做","最完整。")]},
{id:"seedPolicy",title:"生成參數與 seed",q:"生成參數怎樣管理？",opts:[R("sd_rec","每次記錄 seed、模型版本與主要參數","可重現與稽核。"),R("sd_fix","同一系列固定 seed 與參數，記錄在條目","系列一致性較高；仍須逐張驗收。"),R("sd_none","不記錄","不建議。")]},
{id:"dataPolicy",title:"輸入資料政策",q:"可以向模型輸入什麼？（對照 PCPD 清單：輸入的資料種類與數量）",opts:[R("dt_none","不輸入個人資料與機密","最安全。"),R("dt_anon","匿名化後的資料可輸入（須有程序）","須定義匿名化標準。"),R("dt_priv","只在私有或自行託管環境處理敏感資料","仍須保安與保存規則。")]},
{id:"refPolicy",title:"參考圖政策",q:"參考圖（情緒板與 AI 輸入）怎樣管理？",opts:[R("rf_own","只有自有或已明確授權（含 AI 輸入）的圖片可作 AI 輸入","最穩。"),R("rf_int","網上收集（如 Behance）只作內部靈感，不作 AI 輸入，也不對外","常見做法；須記錄來源。"),R("rf_open","不限制","不建議。")]},
{id:"libVersion",title:"風格庫版本規則",q:"條目與庫的版本怎樣編？",opts:[R("lv_sem","主版本.次版本.修訂（如 1.2.0）","重大改動升主版本。"),R("lv_date","日期版本","簡單，看不出改動大小。")]},
{id:"evalCadence",title:"守門評估頻率",q:"多久用測試集重新驗證 AI 守門？",opts:[R("ec_each","每次更新模型、條目或規則","最穩；成本較高。"),R("ec_q","每季","通用。"),R("ec_y","每年","小型品牌；不建議在模型常更新時使用。")]}
];
const DIM=id=>DIMS.find(d=>d.id===id);
const OPTD=(dim,id)=>((DIM(dim)||{opts:[]}).opts.find(o=>o.id===id));
const T=(id,label,ph,help,rows)=>({id,label,ph:ph||"",help:help||"",rows:rows||1});
const TEXTS=[
T("brandName","品牌名稱","例：滿月堂","未匯入前階段時請手動填寫。"),T("owner","風格庫與 AI 契約負責人","例：品牌經理","最終負責人。"),
T("style_base","全局風格描述（英文，所有提示詞共用）","calm, trustworthy, soft natural light, restrained palette, generous negative space","用英文寫 1–2 句；不指名在世藝術家或他牌。",2),
T("neg_extra","額外負面約束（英文，逗號分隔）","neon colours, cheap plastic look, stock photo feel","與下方『常用負面約束』合併。",2),
T("thr","色彩距離門檻（ΔE76）","20","你自訂的門檻，不是標準；越小越嚴。"),T("target_w","目標寬度（px，選填）","1080",""),T("target_h","目標高度（px，選填）","1350",""),
T("retention","AI 輸出的保存與刪除規則","例：生成紀錄與核准輸出保存 3 年；未用草稿 90 天後刪除","對照 PCPD 清單：輸出的保存與資料保留政策。",2),T("sec_note","保安要求（裝置、帳戶、多重驗證）","例：只可用公司帳戶；啟用多重驗證；不可用個人帳戶","對照 PCPD 清單的資料保安。",2),T("viol_note","違規與事故處理","例：發現個資外洩或違規生成，24 小時內通報負責人","違反政策的後果與通報流程。",2),
T("mood_note","情緒板與參考圖說明","例：情緒板放在 Figma；網上收集只作內部靈感，不作輸入","情緒板放在哪裡、誰維護、怎樣標示來源。",2),
T("st_note","備註（專業人士、條款版本、核准）","","",3),T("statement","風格庫與 AI 生成契約一句話（選填，留空自動生成草稿）","","",3)
];
const TEXT_BY=Object.fromEntries(TEXTS.map(t=>[t.id,t]));
const LIBSTATUS=["草稿","待審","已核准","已下架"];
const ENTRYTYPES={lt_grad:"漸變",lt_pat:"Pattern",lt_tex:"紋理",lt_cw:"配色變體",lt_shape:"形狀與圓角",lt_mat:"材質與 CMF",lt_photo:"攝影風格",lt_icon:"插圖與圖示",lt_motion:"動態風格",lt_tpl:"版面與廣告模板",lt_ui:"UI 元件風格",lt_space:"空間與室內"};
const ENTRYCOLS=[["id","編號"],["name","名稱"],["type","類型"],["ver","版本"],["status","狀態"],["approver","核准者"],["date","核准日期"]];
const MODELCOLS=[["name","工具／模型名稱"],["ver","版本"],["provider","提供者"],["type","類型"],["terms","條款連結與版本"],["comm","商用已確認"],["data","輸入資料處理（是否用於訓練、保存）"],["disc","披露或標記要求"],["uses","允許用途"],["approver","核准者"],["date","核准日期"],["status","狀態"]];
const REFCOLS=[["id","編號"],["title","標題"],["stype","來源類型"],["loc","位置或連結"],["rights","權利狀態"],["use","允許用途"],["note","備註"]];
const GENCOLS=[["id","編號"],["date","日期"],["operator","操作者"],["model","模型"],["mver","模型版本"],["entry","條目編號"],["prompt","提示詞"],["neg","負面約束"],["seed","Seed"],["params","其他參數"],["refs","參考圖編號"],["output","輸出檔名"],["status","審核狀態"],["reviewer","審核者"],["disc","已披露"]];
const REFRIGHTS=["已授權（含 AI 輸入）","自有","僅供內部靈感","未確認"];
const REFUSES=["風格參考","構圖參考","色彩參考","不可作 AI 輸入"];
const GENSTATUS=["待審","通過","退回"];
const MODELCOMM=["是","否","未確認"];
const POLICY_STATE={"":"未定","A":"允許","C":"有條件","X":"禁止"};
const REVIEWS=["製作者自查","第二人審稿","第二人＋專業人士"];
const NEGCOMMON="watermark, signature, gibberish text, misspelled text, extra fingers, distorted hands, deformed face, extra limbs, low resolution, blurry, jpeg artifacts, banding, cropped subject, duplicate objects, brand logos, trademarks, celebrity likeness";
const NEGMAP={"廉價塑膠感":"cheap plastic look","過度反光鏡面":"excessive mirror reflections","霓虹螢光":"neon fluorescent colours","亮粉閃片":"glitter sparkles","醫院式冷不鏽鋼":"clinical cold stainless steel","假木紋貼皮":"fake wood veneer","紫藍光暈背景":"purple-blue glow background","過時科技漸變與光暈":"dated tech gradient and halo glow","滿版金色與過度金屬":"full-bleed gold, excessive metallic","螢光刺眼色":"harsh fluorescent colours","亮面高光塑膠感":"glossy plastic highlights","素材庫假照片感":"generic stock photo feel","素材庫假照片":"generic stock photo feel","過度濾鏡":"heavy filters","閃爍":"flashing or strobing effects","恐嚇式訴求":"fear-based imagery","療效或治療承諾":"imagery implying cure or treatment","虛假倒數與限量":"fake countdown timers","偽造見證、評論或數字":"fake testimonials","冰冷醫院感":"cold clinical hospital feel","廉價促銷感":"cheap promotional look","過度科技炫技":"flashy over-technical look","炫富浮誇":"ostentatious luxury","陰暗沉重":"dark heavy mood","過度幼稚":"childish look","製造焦慮／恐嚇":"anxiety-inducing or threatening imagery","限時倒數壓迫":"pressure countdown visuals","拉伸或壓扁標誌":"stretched or squashed logo","圖案壓住文字":"pattern covering text","過度模糊玻璃":"over-blurred glass effect","明顯色帶（Banding）":"visible colour banding","刺眼霓虹與發光":"harsh neon glow","恐怖谷人像":"uncanny valley human faces"};
const ENMAP={"線性漸變":"linear gradient","徑向光暈":"radial glow gradient","錐形／角度漸變":"conic gradient","網格／彌散漸變（Mesh）":"soft mesh gradient","金屬／光澤漸變":"metallic sheen gradient","雙色調映射（Gradient map）":"duotone gradient map","紙紋疊層":"subtle paper grain overlay","顆粒膠片":"fine film grain","布紋":"woven fabric texture","磨砂模糊":"frosted blur","水彩暈染":"soft watercolour bleed","石材／混凝土":"concrete stone texture","金屬拉絲":"brushed metal texture","極淡噪點（抗色帶）":"very subtle noise","圓點":"dots","方塊":"squares","菱形":"diamonds","十字":"plus signs","波浪線":"wavy lines","斜線":"diagonal lines","格網":"grid lines","葉形":"leaf shapes","弧形（鱗紋）":"scallop arcs","直接重複（Block）":"straight repeat","半跳（Half-drop）":"half-drop repeat","磚式（Brick）":"brick repeat","鏡像":"mirror repeat","隨機散落（Tossed）":"tossed repeat","磨砂塑料":"matte plastic","陶瓷":"ceramic","玻璃":"glass","拉絲金屬":"brushed metal","鏡面鉻":"mirror chrome","橡膠／矽膠":"rubber silicone","布料":"fabric","木材":"wood","紙／卡紙":"paper card","寫實 Photoreal":"photorealistic","低多邊形":"low poly","黏土感 Clay":"clay render","柔光棚":"soft box lighting","三點光":"three-point lighting","日光":"daylight","高調明亮":"high-key bright","低調戲劇":"low-key dramatic","自然窗光":"natural window light"};
const en=t=>ENMAP[t]||t;
