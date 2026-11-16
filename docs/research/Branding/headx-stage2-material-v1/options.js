
// ===== Stage 02 · 材質隱喻與感官定調 — 完整選項庫 =====
// 流程依：感受關鍵字 → 選材質與環境 → 定義視覺物理（光、深度、邊緣）→ 細節。感官面向參考 Fluent 2 的五個感官元素（光、深度、動態、材質、尺度）與多感官品牌（觸、聲、視覺質地）。
const X=(id,zh,desc,sw,t)=>({id,zh,desc,sw:sw||"",t:t||[]});
const CAT={
material:{title:"物理材質隱喻（這個品牌如果是一個物件，它是什麼做的？）",max:2,swatch:true,hint:"選 1–2 個。材質決定整個品牌的觸感、重量與溫度；選太多會變成雜燴。第一個是主材質，第二個是輔助。",groups:[
{g:"陶瓷與礦物",items:[
X("ceramic","霧面陶瓷","細膩、安靜、微涼；像剛洗淨的杯子。適合需要潔淨又不冰冷的品牌。","var(--nz),radial-gradient(120% 120% at 30% 20%,#F4F1EA,#E3DED3)",["soft","clinical-soft"]),
X("porcelain","瓷器／骨瓷","明亮、精緻、易碎的珍貴感。","radial-gradient(120% 120% at 30% 15%,#FFFFFF,#EFEDE8)",["luxe","soft"]),
X("marble","大理石／石灰華","厚重、冷靜、帶天然紋理的奢華。","var(--nz),linear-gradient(115deg,#F3F1EE 0%,#DAD6CF 35%,#EEEBE6 55%,#CFCAC2 100%)",["luxe","cold"]),
X("concrete","混凝土","粗獷、工業、誠實；不討好人。","var(--nz2),linear-gradient(#B9B8B4,#A6A5A1)",["industrial","hard","dark"]),
X("glass_clear","清透玻璃","通透、精準、一目了然；需注意易顯冷。","linear-gradient(135deg,rgba(255,255,255,.9),rgba(190,215,230,.55)),#cfe3ee",["cold","clinical"]),
X("glass_frost","磨砂玻璃","柔化、有層次、私密；光線被溫柔擴散。","var(--nz),linear-gradient(135deg,rgba(255,255,255,.75),rgba(210,225,235,.6)),#dbe6ee",["soft"]),
X("crystal","水晶","折射、閃爍、珍貴；容易過度華麗。","conic-gradient(from 40deg at 50% 50%,#fff,#dfe9ff,#f4e6ff,#fff)",["luxe","loud"])]},
{g:"金屬",items:[
X("anodized","陽極氧化鋁","精密、輕、微冷的科技質感；Apple 式硬體語彙的核心。","repeating-linear-gradient(90deg,rgba(255,255,255,.18) 0 1px,rgba(0,0,0,.04) 1px 3px),linear-gradient(135deg,#C9CDD2,#9EA4AB 50%,#C4C8CD)",["cold","precise"]),
X("brushed_steel","拉絲不鏽鋼","耐用、專業、帶方向感的紋理；易與醫院器械混淆。","repeating-linear-gradient(90deg,rgba(255,255,255,.25) 0 1px,rgba(0,0,0,.06) 1px 2px),linear-gradient(#D9DCDF,#A9AEB3)",["cold","clinical","industrial"]),
X("brass","黃銅／銅","溫暖、有歷史、會隨時間生出光澤。","repeating-linear-gradient(90deg,rgba(255,255,255,.12) 0 1px,rgba(0,0,0,.05) 1px 3px),linear-gradient(135deg,#C9A25A,#8C6A2F 55%,#C7A055)",["warm","luxe","heritage"]),
X("titanium","鈦金屬","輕而強、低調的高端；帶一點冷灰。","linear-gradient(135deg,#8E9096,#5C5F66 55%,#9A9CA3)",["cold","precise","dark"]),
X("chrome","鉻／鏡面","反光、未來、誇張；很容易顯得廉價或炫技。","linear-gradient(180deg,#fff 0%,#9aa 45%,#fff 50%,#556 100%)",["loud","neon","cold"]),
X("gunmetal","槍灰黑陽極","沉穩、暗、專業裝備感。","repeating-linear-gradient(90deg,rgba(255,255,255,.06) 0 1px,transparent 1px 3px),linear-gradient(135deg,#3A3D42,#1C1E21)",["dark","industrial","hard"])]},
{g:"紙與纖維",items:[
X("recycled_paper","再生紙","誠實、樸素、帶一點粗糙的環保感。","var(--nz2),linear-gradient(#E8E2D2,#DDD5C2)",["organic","warm"]),
X("watercolor","水彩紙","柔軟、有吸水感、手作的溫柔。","var(--nz2),linear-gradient(#F7F4EC,#EEE9DD)",["soft","organic","warm"]),
X("xuan","宣紙","通透、含蓄、有墨韻的東方留白。","var(--nz),linear-gradient(#F4EFE3,#EAE3D2)",["soft","heritage","warm"]),
X("linen","亞麻／麻布","天然、透氣、帶紋理的日常高級。","repeating-linear-gradient(0deg,rgba(0,0,0,.05) 0 1px,transparent 1px 3px),repeating-linear-gradient(90deg,rgba(0,0,0,.05) 0 1px,transparent 1px 3px),#DCD3BF",["organic","warm","soft"]),
X("felt","羊毛氈","柔軟、吸音、安靜、親近。","var(--nz2),#9C9A97",["soft","warm"]),
X("cotton","棉布","乾淨、柔和、貼身。","var(--nz),#F2EFE9",["soft","warm"]),
X("leather","皮革","厚實、成熟、帶歲月質地。","var(--nz2),linear-gradient(#6B4A36,#4B3223)",["warm","luxe","dark","heritage"])]},
{g:"木與自然",items:[
X("oak","淺色木（橡木／白蠟木）","明亮、溫暖、北歐式的安心。","repeating-linear-gradient(95deg,rgba(120,90,50,.12) 0 2px,transparent 2px 9px),linear-gradient(#D9BE96,#C8A97C)",["warm","organic","soft"]),
X("walnut","深色木（胡桃木）","穩重、成熟、書房感。","repeating-linear-gradient(95deg,rgba(0,0,0,.18) 0 2px,transparent 2px 10px),linear-gradient(#6A4A33,#4A3222)",["warm","dark","heritage"]),
X("bamboo","竹","清爽、有節奏、東方的輕。","repeating-linear-gradient(0deg,rgba(0,0,0,.08) 0 1px,transparent 1px 24px),linear-gradient(90deg,#D8D79A,#C4C479)",["organic","soft"]),
X("cork","軟木","彈性、溫暖、帶顆粒的樸實。","var(--nz2),#C69C6D",["organic","warm"]),
X("herb","草本／植物","生機、柔和、帶青草氣息。","radial-gradient(circle at 30% 30%,#9DB38A,#5E7A4F)",["organic","soft"]),
X("clay","陶土／泥土","原始、踏實、手捏的溫度。","var(--nz2),linear-gradient(#B97F5C,#9A6446)",["organic","warm"]),
X("sand","沙","乾爽、細緻、流動中的靜。","var(--nz2),linear-gradient(#E6D5B4,#D8C49B)",["organic","warm","soft"]),
X("water","水面／水滴","流動、清涼、反映周圍。","repeating-radial-gradient(circle at 50% 120%,rgba(255,255,255,.25) 0 6px,transparent 6px 18px),linear-gradient(#A9D2E0,#5C9DB5)",["soft","cold"]),
X("moss","苔蘚／石","沉靜、潮濕、原始的安定。","var(--nz2),linear-gradient(#6F7F5B,#4A5A3C)",["organic","dark"])]},
{g:"光與氣體",items:[
X("mist","晨霧","朦朧、涼、什麼都慢下來。","linear-gradient(#F4F6F8,#DDE3E8)",["soft","cold"]),
X("afterglow","黃昏餘暉","日落後那抹天：柔、暖、帶紫粉。","linear-gradient(180deg,#DCD6F2 0%,#F3D9E1 55%,#F6E4CF 100%)",["soft","warm"]),
X("moonlight","月光","清冷、安靜、帶一點神秘。","linear-gradient(180deg,#1F2540,#4A5380)",["cold","dark"]),
X("candle","蠟燭光","小範圍的暖、私密、搖曳。","radial-gradient(circle at 50% 80%,#FFD38A,#6B3E1E 70%)",["warm","dark"]),
X("scope","示波器／霓虹","發光的訊號、精準、夜間遙測。","radial-gradient(circle at 50% 50%,#0B0C0E 40%,#001a12),#0B0C0E",["neon","dark","precise"]),
X("steam","水蒸氣","溫熱、柔化邊界、濕潤。","radial-gradient(circle at 40% 60%,rgba(255,255,255,.9),rgba(220,230,235,.4)),#DDE6EA",["soft","warm"]),
X("aurora","極光","流動的彩光、夢幻；容易過度炫技。","linear-gradient(120deg,#0E2A3A,#2BA58B 45%,#7A5BD6 75%,#0E2A3A)",["neon","loud","dark"])]},
{g:"合成與工業",items:[
X("silicone","矽膠／橡膠","軟、貼手、防滑的安心觸感。","var(--nz2),#7E8C86",["soft"]),
X("matte_plastic","磨砂塑料","輕、實用；處理不好會顯廉價。","var(--nz),linear-gradient(#E9E9E7,#D5D5D2)",["cheap","hard"]),
X("carbon","碳纖維","輕、強、運動競技感。","repeating-linear-gradient(45deg,#222 0 4px,#2b2b2b 4px 8px)",["dark","hard","energetic","loud"]),
X("foam","泡棉／軟墊","緩衝、柔軟、被承托的感覺。","var(--nz2),#CFCBC4",["soft"]),
X("pcb","電路板","露出技術細節的極客感。","repeating-linear-gradient(90deg,rgba(255,215,120,.25) 0 1px,transparent 1px 12px),#1F5A3A",["neon","dark","industrial"]),
X("pixel","螢幕像素","數位原生、顆粒清晰。","repeating-linear-gradient(90deg,#f33 0 1px,#3f3 1px 2px,#33f 2px 3px),#111",["neon","dark","loud"])]}]},

tactile:{title:"觸感與表面質地（摸起來是什麼感覺？）",max:4,hint:"即使是數位產品，觸感也會變成介面的圓角、陰影與留白。選 2–4 個最能代表品牌的詞。",groups:[
{g:"表面",items:[X("smooth","光滑","沒有阻力，手指滑過"),X("matte","霧面","不反光、安靜、有一點阻力"),X("fine","細顆粒","像細砂紙或磨砂塑料的微粒感"),X("rough","粗糙","明顯紋理，原始、誠實"),X("fibrous","纖維紋理","織物、紙張的方向性紋路"),X("silky","絲滑","順、流動、輕微涼")]},
{g:"硬度與重量",items:[X("soft","柔軟","可以壓下去、被承托"),X("firm","硬挺","有骨架、不變形"),X("springy","有彈性","按下去會回彈"),X("weighted","沉甸甸","拿起來有重量，讓人覺得可靠"),X("featherlight","輕盈","幾乎感覺不到重量")]},
{g:"溫度與濕度",items:[X("warm_touch","溫暖","像體溫、像曬過太陽的木頭"),X("cool_touch","冰涼","像金屬與玻璃"),X("dry","乾爽","沒有黏膩、清爽"),X("moist","濕潤","潤、柔、帶水氣")]},
{g:"透明度",items:[X("translucent","半透明","光透過來但看不清"),X("transparent","通透","一眼看穿")]}]},

light:{title:"光線感（品牌在什麼光下最好看？）",max:2,swatch:true,hint:"光決定氣氛：同一個材質，在晨光與霓虹下是兩個品牌。選 1–2 個。",groups:[
{g:"自然光",items:[
X("dawn","晨光（冷淡）","涼、乾淨、剛開始的一天","linear-gradient(#E8EEF5,#F6F4F0)",["cold","soft"]),
X("noon","正午日光","明亮、平均、沒有祕密","linear-gradient(#FFFFFF,#F4F6F8)",["cold"]),
X("golden","黃金時刻","暖、斜、拉長影子","linear-gradient(135deg,#FFE2B0,#F2B880)",["warm","soft"]),
X("bluehour","藍調時刻","日落後的冷藍，安靜帶憂","linear-gradient(#2F3E6E,#7F8FB8)",["cold","dark","soft"]),
X("overcast","陰天柔光","沒有陰影、平靜、克制","linear-gradient(#DADEE2,#C8CDD2)",["cold","soft"]),
X("window","窗邊側光","一側明亮、一側柔暗，像居家","linear-gradient(100deg,#FFF6E4 0%,#EDE6D8 45%,#BFB6A6 100%)",["warm","soft"]),
X("diffuse","霧中擴散光","沒有光源方向，整體發亮","radial-gradient(circle at 50% 40%,#fff,#d9dde0 80%)",["soft"])]},
{g:"人造光",items:[
X("warmlamp","暖燈","小範圍的暖、居家、私密","radial-gradient(circle at 50% 30%,#FFE3B5,#B77E43)",["warm","dark"]),
X("clinical","螢光冷白","明亮、均勻、診所式","linear-gradient(#F4FBFF,#DCEFF7)",["clinical","cold"]),
X("selfglow","自發光（螢幕／霓虹）","物體自己會亮","radial-gradient(circle,#2BE7A8 0,#0A1F1A 70%)",["neon","dark","loud"])]},
{g:"戲劇性",items:[
X("rim","輪廓背光","暗中一圈亮邊，神秘","linear-gradient(90deg,#0c0c10 60%,#fff 100%)",["dark","loud"]),
X("hard","硬光強陰影","對比強烈、雕塑感","linear-gradient(110deg,#fff 0 48%,#222 48% 100%)",["hard","loud"]),
X("flat","無影平光","沒有立體感，平面、誠實","linear-gradient(#F2F2F2,#F2F2F2)",["cold"])]}]},

atmosphere:{title:"空氣與氛圍（品牌所在的空間是什麼天氣？）",max:2,swatch:true,hint:"空氣感決定留白與節奏：通透、朦朧、潮濕、乾爽各是不同的呼吸。",groups:[
{g:"空氣",items:[
X("clear","通透乾淨","空氣清楚、遠近分明","linear-gradient(#EAF4FA,#FFFFFF)"),
X("hazy","朦朧柔霧","邊界模糊、柔和","linear-gradient(#F0EEF4,#DEDCE6)"),
X("drycool","乾爽","沒有濕氣，俐落","linear-gradient(#F7F7F4,#ECECE6)"),
X("humid","濕潤","有水氣，溫潤","linear-gradient(#E4EEEA,#C9DDD6)"),
X("still","靜止","時間像停住","linear-gradient(#EFEFEF,#E6E6E6)"),
X("flowing","流動","有風、有動","linear-gradient(120deg,#E2ECF4,#F4EEF6,#E8F2EC)")]},
{g:"天氣與季節",items:[
X("afterrain","雨後","洗過的乾淨、地面反光","linear-gradient(#D4E2E6,#EEF3F4)"),
X("snow","雪","全部被吸音、純白寂靜","linear-gradient(#FFFFFF,#E8EEF4)"),
X("springmorn","春日清晨","新生、輕、帶涼","linear-gradient(#EAF3E4,#FBFAEF)"),
X("lateafternoon","午後靜謐","暖、慢、帶倦意","linear-gradient(#F6EBD6,#EAD9BC)"),
X("deepnight","深夜","私密、安靜、只有自己","linear-gradient(#14162B,#2A2E52)")]}]},

motionsound:{title:"動態與聲音（會動的時候怎麼動？有聲音的話是什麼聲音？）",max:3,hint:"動態與聲音是常被忽略的品牌觸點：一個按鈕的回饋聲、一個頁面的淡入速度，都在說品牌性格。選 2–3 個，至少包含一個動態。",groups:[
{g:"動態質感",items:[X("breath","緩慢呼吸","1 秒以上的緩慢起伏，像呼吸"),X("fade","輕柔漸變","柔和淡入淡出，不突兀"),X("linear","精準線性","等速、準確，像儀器"),X("spring","彈性有力","有回彈，活潑有能量"),X("instant","瞬間無動畫","立即反應，極簡"),X("flow","流體連貫","元素之間液態過渡"),X("snap","乾脆咔嗒","短而確定的卡位感")]},
{g:"聲音質感",items:[X("silent","無聲","完全安靜，尊重專注"),X("ambient","輕柔環境音","背景極低音量的氛圍"),X("click","機械咔嗒","按鍵、開關的實體聲"),X("woodsound","木質敲擊","溫暖、有共鳴"),X("dropsound","水滴","清、短、乾淨"),X("chime","風鈴／鐘聲","輕、亮、有餘韻"),X("hum","低頻嗡鳴","穩定、沉靜、機器在運作"),X("papersound","紙張翻動","沙沙聲、日常、親近")]}]},

keywords:{title:"情緒關鍵字（用 5 個詞定義感覺）",max:5,hint:"剛好 5 個。之後所有圖片、文案、介面都要用這 5 個詞檢查。寧缺勿濫。",groups:[
{g:"溫度",items:[X("k_warm","溫暖",""),X("k_mellow","溫潤",""),X("k_cool","涼爽",""),X("k_calmcold","冷靜",""),X("k_crisp","清冽",""),X("k_gentle","柔和","")]},
{g:"重量",items:[X("k_light","輕盈",""),X("k_airy","空靈",""),X("k_thick","厚實",""),X("k_steady","穩重",""),X("k_solid","紮實",""),X("k_clear","通透","")]},
{g:"能量",items:[X("k_quiet","安靜",""),X("k_soothing","舒緩",""),X("k_peace","平靜",""),X("k_lively","有活力",""),X("k_sharp","銳利",""),X("k_uplift","振奮","")]},
{g:"質地",items:[X("k_fine","細緻",""),X("k_moist","潤澤",""),X("k_dry","乾爽",""),X("k_rugged","粗獷",""),X("k_plain","樸實",""),X("k_precise","精密",""),X("k_clean","光潔","")]},
{g:"性格",items:[X("k_accurate","精準",""),X("k_friendly","親切",""),X("k_mystic","神秘",""),X("k_honest","誠實",""),X("k_elegant","優雅",""),X("k_restrained","克制",""),X("k_bold","大膽",""),X("k_pure","純粹",""),X("k_composed","沉穩",""),X("k_playful","童趣",""),X("k_poetic","詩意",""),X("k_agile","俐落",""),X("k_unhurried","從容","")]}]},

antiKeywords:{title:"反關鍵字（絕對不要有的感覺）",max:5,hint:"3–5 個。用來擋掉不屬於品牌的圖片與文案。可參考 Stage 1 的 Anti-Persona。",groups:[
{g:"溫度與重量",items:[X("a_cold","冰冷",""),X("a_heavy","沉重",""),X("a_flimsy","單薄廉價",""),X("a_stuffy","悶熱壓迫",""),X("a_sterile","無菌冷漠","")]},
{g:"能量與性格",items:[X("a_loud","吵鬧",""),X("a_hype","浮誇",""),X("a_anxious","焦躁",""),X("a_childish","幼稚",""),X("a_arrogant","傲慢",""),X("a_gloomy","陰鬱",""),X("a_cheap","廉價",""),X("a_fake","虛假",""),X("a_cluttered","雜亂","")]},
{g:"質地",items:[X("a_greasy","油膩",""),X("a_gaudy","俗豔",""),X("a_harsh","刺眼",""),X("a_rough","粗劣",""),X("a_slick","過度光滑做作","")]}]},

avoidMaterials:{title:"物理禁區（絕對不能看起來像什麼材質？）",max:5,swatch:true,hint:"和『反關鍵字』不同，這裡是具體材質。選 2–5 個，用來擋掉素材庫與 AI 生圖的雷區。",groups:[
{g:"容易出現的雷區",items:[
X("v_cheapplastic","廉價塑膠感","光亮、薄、有塑膠味","linear-gradient(135deg,#ff9ec0,#ff5a8a)"),
X("v_mirror","過度反光鏡面","到處都是高光與反射","linear-gradient(180deg,#fff 0%,#889 45%,#fff 50%,#445 100%)"),
X("v_fakewood","假木紋貼皮","印刷的木紋，沒有真實感","repeating-linear-gradient(95deg,#a67c52 0 3px,#8a6240 3px 6px)"),
X("v_fakeleather","過度擬真仿皮","假皮革的人造紋","var(--nz2),#4a2f22"),
X("v_jelly","果凍泡泡感","圓鼓鼓的半透明塑膠","radial-gradient(circle at 30% 30%,#fff9,#6cf9 60%,#39c)"),
X("v_distressed","刻意做舊髒污","假的舊，沒有故事","var(--nz2),linear-gradient(#8b7d6a,#5e5546)"),
X("v_gold","過度金屬金","滿版金色，俗豔","linear-gradient(135deg,#f9e27a,#b8860b 50%,#f6d860)"),
X("v_neon","霓虹螢光","刺眼的螢光色","linear-gradient(135deg,#39ff14,#ff00e6)"),
X("v_cardboard","廉價瓦楞紙箱感","便宜的包裝紙感","repeating-linear-gradient(0deg,#c9a46a 0 3px,#b98f55 3px 6px)"),
X("v_steelcold","醫院式冷不鏽鋼","冰冷、器械、制式","linear-gradient(#cfd6dc,#9aa5ad)"),
X("v_glitter","亮粉閃片","閃爍、孩子氣","radial-gradient(circle at 20% 30%,#fff,#f9c 20%,#c9f 60%)"),
X("v_vinylglossy","亮面貼紙感","反光、易廉價","linear-gradient(135deg,#fff,#e1e8ff 40%,#fff 45%,#dce 100%)")]}]}
};
const MAT_KEYS=["material","tactile","light","atmosphere","motionsound","keywords","antiKeywords","avoidMaterials"];

// ===== 視覺物理規則：9 個決策面向（單選）=====
const R=(id,zh,desc,tok,sample)=>({id,zh,desc,tok:tok||{},sample:sample||""});
const DIMS=[
{id:"density",title:"版面密度與留白（尺度）",q:"畫面是留白多還是資訊密？",opts:[
R("gallery","畫廊級留白","每個元素都有大量呼吸空間；適合高端、形象導向。代價：一頁放得少、需要更多捲動。",{"--space-unit":"12px","--section-gap":"160px","--line-height":"1.85","--measure":"54ch"}),
R("airy","寬鬆","舒適留白，閱讀輕鬆。適合大多數服務型品牌。",{"--space-unit":"10px","--section-gap":"120px","--line-height":"1.75","--measure":"60ch"}),
R("balanced","均衡","留白與資訊各半。代價：不夠突出個性。",{"--space-unit":"8px","--section-gap":"96px","--line-height":"1.65","--measure":"66ch"}),
R("dense","資訊緊湊","一頁放很多資訊；適合工具、儀表。代價：容易顯得壓迫。",{"--space-unit":"6px","--section-gap":"64px","--line-height":"1.5","--measure":"78ch"})]},
{id:"surface",title:"卡片表面材質（深度）",q:"介面的卡片、面板，看起來是什麼做的？",opts:[
R("flat","實色平面","純色、無陰影；最乾淨最輕。",{bg:"#FFFFFF",border:"none",shadow:"none",blur:"0px"}),
R("paper","紙感","白底＋極細邊＋極淡陰影，像一張紙放在桌上。",{bg:"#FFFFFF",border:"1px solid rgba(20,20,20,.10)",shadow:"0 1px 2px rgba(20,20,20,.06)",blur:"0px"}),
R("frosted","磨砂玻璃","半透明＋背景模糊＋亮邊。須在實際合成背景上測試文字對比。",{bg:"rgba(255,255,255,.55)",border:"1px solid rgba(255,255,255,.6)",shadow:"0 8px 32px rgba(20,20,40,.10)",blur:"20px"}),
R("ceramic","霧面陶瓷","柔和漸層＋內側高光，溫潤細膩。",{bg:"linear-gradient(160deg,#FBFAF7,#EDEAE3)",border:"1px solid rgba(0,0,0,.06)",shadow:"0 1px 0 rgba(255,255,255,.9) inset,0 6px 18px rgba(60,50,30,.08)",blur:"0px"}),
R("metal","拉絲金屬","細密橫紋＋高光邊，精密硬體感。",{bg:"repeating-linear-gradient(90deg,rgba(255,255,255,.35) 0 1px,rgba(0,0,0,.03) 1px 3px),linear-gradient(135deg,#E4E7EA,#BFC4C9)",border:"1px solid rgba(255,255,255,.7)",shadow:"0 1px 0 rgba(255,255,255,.8) inset,0 8px 20px rgba(0,0,0,.12)",blur:"0px"}),
R("hard","硬朗邊框","粗黑邊＋硬陰影，直白有態度。",{bg:"#FFFFFF",border:"2px solid #111",shadow:"4px 4px 0 #111",blur:"0px"}),
R("neumorph","新擬態（軟凸）","同色底＋雙陰影。注意：邊界對比通常達不到 WCAG 3:1，不建議作為主要互動元件。",{bg:"#E8E8EC",border:"none",shadow:"8px 8px 16px #C5C5CB,-8px -8px 16px #FFFFFF",blur:"0px"})]},
{id:"border",title:"邊框處理",q:"面板的邊界怎麼畫？",opts:[
R("none","無邊框","靠色差或陰影分隔。",{border:"none"}),
R("hair","1px 細線","安靜、精緻。",{border:"1px solid rgba(20,20,20,.12)"}),
R("bold","2px 粗線","清楚、有態度。",{border:"2px solid currentColor"}),
R("double","雙線","古典、書卷氣。",{border:"3px double currentColor"})]},
{id:"radius",title:"圓角",q:"轉角是尖的還是圓的？",opts:[
R("sharp","直角（0）","嚴謹、建築感、冷靜。",{"--radius":"0px"}),
R("subtle","微圓（4px）","專業、克制。",{"--radius":"4px"}),
R("medium","中圓（12px）","友善但不幼稚，最通用。",{"--radius":"12px"}),
R("large","大圓（24px）","柔和、親切、有溫度。",{"--radius":"24px"}),
R("pill","全圓（膠囊）","輕鬆、活潑、現代。",{"--radius":"999px"})]},
{id:"elevation",title:"陰影與高度（深度）",q:"元素浮在畫面上多高？",opts:[
R("none","無陰影","完全平面。",{shadow:"none"}),
R("ambient","極淡環境陰影","若有似無的浮起。",{shadow:"0 2px 12px rgba(0,0,0,.06)"}),
R("layered","層疊陰影","兩層陰影，真實自然。",{shadow:"0 1px 2px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.08)"}),
R("hardoffset","硬陰影（偏移）","不模糊的偏移陰影，普普風。",{shadow:"4px 4px 0 currentColor"}),
R("glow","發光","自發光的外暈，適合夜間／訊號感。",{shadow:"0 0 24px rgba(80,220,170,.45)"})]},
{id:"transparency",title:"透明與模糊",q:"面板能透出背景嗎？",opts:[
R("opaque","完全不透明","最可讀、最穩定。",{alpha:"1",blur:"0px"}),
R("subtle","輕微半透明","背景隱約透出。",{alpha:".92",blur:"6px"}),
R("frost","磨砂模糊","明顯模糊背景。",{alpha:".6",blur:"16px"}),
R("glass","強玻璃感","高透明＋強模糊；可讀性風險最高。",{alpha:".35",blur:"32px"})]},
{id:"contrast",title:"對比強度",q:"整體明暗反差要多強？",opts:[
R("low","柔和（4.5–7:1）","避免純黑純白，文字仍須達 AA。",{"--contrast-min":"4.5"}),
R("standard","標準（7–12:1）","穩定清晰。",{"--contrast-min":"7"}),
R("high","高對比（12:1 以上）","最強可讀性，可用近純黑白。",{"--contrast-min":"12"}),
R("accentonly","大面積中性＋局部高彩","約 95% 中性色，只有 5% 高彩點綴。",{"--contrast-min":"7"})]},
{id:"motion",title:"動態規則",q:"元素出現與切換時的速度與手感。",opts:[
R("static","靜止","無動畫，立即切換。",{"--motion-duration":"0ms","--motion-easing":"linear"}),
R("fade","緩慢淡入","400ms 柔和淡入。",{"--motion-duration":"400ms","--motion-easing":"cubic-bezier(.2,.6,.2,1)"}),
R("precise","精準線性","150ms 等速，儀器感。",{"--motion-duration":"150ms","--motion-easing":"linear"}),
R("spring","彈性回彈","320ms 帶回彈。",{"--motion-duration":"320ms","--motion-easing":"cubic-bezier(.34,1.56,.64,1)"}),
R("breath","呼吸節奏","1200ms 緩入緩出。",{"--motion-duration":"1200ms","--motion-easing":"ease-in-out"})]},
{id:"imagery",title:"圖像處理",q:"照片與插圖的調性。",opts:[
R("softfocus","柔焦","邊緣柔和、對比略低。",{"--img-filter":"contrast(.94) saturate(.95)"}),
R("crisp","銳利清晰","細節分明。",{"--img-filter":"contrast(1.08)"}),
R("highkey","高調明亮","整體偏亮、陰影淡。",{"--img-filter":"brightness(1.08) contrast(.92)"}),
R("lowkey","低調暗沉","偏暗、對比高、戲劇。",{"--img-filter":"brightness(.86) contrast(1.1)"}),
R("desat","低飽和","顏色收斂、安靜。",{"--img-filter":"saturate(.6)"}),
R("grain","顆粒膠片感","保留顆粒，有溫度。",{"--img-filter":"contrast(1.02) saturate(.9)"})]}
];
const DIM=id=>DIMS.find(d=>d.id===id);
const OPT=(dim,id)=>((DIM(dim)||{opts:[]}).opts.find(o=>o.id===id));
