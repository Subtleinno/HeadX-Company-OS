
// ===== Stage 04A · 核心品牌識別 — 完整選項庫 v1 =====
// 依《品牌與創意作業系統：範圍重整草案》：Logo 類型與風格分開；字體、色彩另為維度；每個選項有正式資料模型。
// 所有內容都是「可編輯的起始簡報」：設計慣例與經驗，不是實證結論；來源、授權、測試與專業驗證欄位預設為空，需要人類補上。
const I=(id,zh,desc,x)=>Object.assign({id,zh,desc:desc||""},x||{});
const F=(id,zh,desc,vis,feel,fit,avoid,pair,contrast,hard,params,ip)=>I(id,zh,desc,{vis,feel,fit,avoid,pair,contrast,hard,params,ip,formal:true});
const CAT={
keywords:{title:"識別關鍵字（這套識別要『像』什麼？最多選 5 個）",max:5,hint:"先用白話形容詞說清楚想要的感覺，再去選標誌、字體與色彩。若已匯入 Stage 2 的關鍵字，請以它為準，這裡補充視覺層面的詞。",groups:[
{g:"性格",items:[I("kw_calm","安靜","不吵、不搶，讓人放鬆"),I("kw_precise","精準","清楚、準確、有秩序"),I("kw_warm","溫暖","親切、有人味"),I("kw_bold","有力","有自信、有存在感"),I("kw_playful","俏皮","輕鬆、有趣"),I("kw_elegant","優雅","細緻、含蓄"),I("kw_raw","樸實","不修飾、真實"),I("kw_modern","現代","當代、乾淨"),I("kw_classic","經典","耐看、有歷史感"),I("kw_edgy","前衛","新穎、敢突破")]},
{g:"質感與感受",items:[I("kw_soft","柔和","邊角與色彩都不尖銳"),I("kw_sharp","銳利","線條與對比清晰有力"),I("kw_airy","通透","留白多、輕盈"),I("kw_dense","厚實","資訊或質感豐富"),I("kw_crafted","手作","有人手的痕跡"),I("kw_tech","科技","數碼、系統、精密"),I("kw_natural","自然","草木、泥土、天然材料"),I("kw_luxury","精緻","高品質、不炫耀"),I("kw_oriental","東方","東方文化語彙"),I("kw_cosmo","都會","城市、國際")]},
{g:"信任與關係",items:[I("kw_trust","可信","專業、穩妥、不誇張"),I("kw_care","關懷","讓人覺得被照顧"),I("kw_open","開放","包容、易親近"),I("kw_exclusive","專屬","私人、稀有"),I("kw_community","社群","歸屬、共同體")]}]},
keepAssets:{title:"現有識別資產：決定『保留』的（只有已營運或重塑時需要）",max:99,hint:"勾選要保留的現有識別資產。已有認知度或信任的通常值得保留；被誤用、不統一或侵權風險高的要重做。若已匯入 Stage 0 的現有資產清單，系統會提醒你還沒決定的項目。",groups:[{g:"資產",items:[I("ka_name","品牌名稱","已有認知；更改名稱成本最高"),I("ka_logo","現有標誌","已使用的標誌與其變體"),I("ka_color","現有品牌色","店面、物料、網站已使用的顏色"),I("ka_font","現有品牌字體","已使用的字體"),I("ka_slogan","標語","已使用的一句話"),I("ka_pack","包裝與標籤","已有包裝設計"),I("ka_store","店面與室內","已有空間與招牌"),I("ka_photo","影像素材","已有照片與影片"),I("ka_pattern","圖案或紋樣","已有的圖案、插圖或吉祥物")]}]},
dropAssets:{title:"現有識別資產：決定『更新或放棄』的",max:99,hint:"勾選要更新或放棄的資產。同一項資產不可同時保留與放棄；若只是部分保留（例如保留顏色但重畫標誌），請分開勾選。",groups:[{g:"資產",items:[I("da_name","品牌名稱","名稱有問題或要更換"),I("da_logo","現有標誌","難以縮小、不統一或侵權風險"),I("da_color","現有品牌色","對比不足或與同行混淆"),I("da_font","現有品牌字體","缺字、授權不清或不適合"),I("da_slogan","標語","與新定位衝突"),I("da_pack","包裝與標籤","與新識別不一致"),I("da_store","店面與室內","需要重新設計"),I("da_photo","影像素材","風格不統一"),I("da_pattern","圖案或紋樣","已過時或不再適用")]}]},
logoType:{title:"Logo 類型（最多選 2 個：主要＋輔助）",max:2,hint:"類型是『標誌的結構』，與表現風格（下一張卡）分開：文字標也可以是幾何或手繪。選主要類型，再視需要選一個輔助類型（例如文字標為主、字母標作小尺寸備援）。每個選項都有適用、避免與硬性限制，請展開閱讀。",groups:[{g:"結構",items:[
F("lt_word","文字標（Wordmark）","只用品牌名稱的字形當標誌，沒有獨立圖形。","以字母形狀、字距與筆畫細節構成；可在現成字體上微調，也可完全客製字形","直接、清楚、可信；性格由字形決定","名稱獨特又好讀；想讓人先記住名字；預算有限的新品牌","名稱很長或很普通；需要不靠文字也能辨認的小圖示（App 圖示、頭像）","字母標（小尺寸備援）、極簡、奢華襯線","圖像標（用圖形記號與文字形成反差）","中英名稱並列時須決定主次；若以商用字體為基礎，須確認授權是否允許用作標誌；中文字標需要專門設計漢字字形，工作量遠高於西文","字體基礎、客製程度、字距、粗細、大小寫","Wordmark logo for the brand name [BRAND NAME], custom lettering with refined letter spacing, vector flat style, black on white, shown at large and small sizes, no icon, no mockup, no extra text"),
F("lt_letter","字母標（Lettermark）","用名稱的縮寫或首字母當標誌。","一至三個字母，可組合、合體或放入形狀","精簡、現代、有機構感","名稱很長；需要很小也能辨認的記號；多語名稱需要共同符號","縮寫沒有意義或與其他品牌相近；中文名稱縮寫可能不成立","文字標（全名備援）、幾何、極簡","吉祥物標（以人格化角色對比冷硬縮寫）","縮寫需做商標與易混淆查證；注意首字母是否有負面意思","字母組合方式、字體、是否有容器形狀","Lettermark logo using the initials [INITIALS], geometric monogram, vector flat style, single color on white background, balanced negative space, no mockup, no extra text"),
F("lt_pict","圖像標（Pictorial）","用一個具體可辨認的圖形（物件、動物、自然）當標誌。","具象圖案，可簡化、風格化或線條化","直觀、好記、容易講故事","圖形與業務有自然關聯；需要快速被理解的品牌","圖形太通用或與同行相同；細節太多在小尺寸看不清","文字標（標誌外加名稱）、單線、手繪","抽象標（以意念取代具象）","圖形可能涉及他人著作權或商標；宗教、文化象徵須審慎","簡化程度、角度、線條粗細、是否封閉","Pictorial logo mark of [OBJECT], simplified, vector flat style, single color, clear silhouette, centered on white, no text, no mockup"),
F("lt_abstract","抽象標（Abstract）","用不指向具體物件的形狀、線條或色塊當標誌。","幾何或有機形狀、空間關係、符號化組合","現代、可延伸、有想像空間","業務跨度大、概念難具象；想避免與同行圖形相似","意義需要解釋；若缺乏故事，容易顯得空洞","文字標（用名稱提供意義）、幾何、負空間","圖像標（具象與抽象並用在子品牌）","須證明形狀來自品牌概念，並避免無意間像他人標誌","形狀數量、對稱性、圓與直的比例","Abstract logo mark expressing [CONCEPT], built from simple geometric shapes, vector flat style, single color on white, strong silhouette, no text, no mockup"),
F("lt_combo","組合標（Combination）","圖形標誌加文字標，可分開也可一起使用。","圖形與字標的固定組合，並有橫式、直式、單獨使用版本","完整、實用、辨識度高","大多數品牌；需要在不同尺寸與場景切換","圖形與文字比例不當會互相搶；元件數量多","圖像標或抽象標＋文字標","完全分離使用兩個元件以對比","需定義分開使用的規則與淨空間；中英並列時定主次","圖文比例、排列、是否可分開、基準線","Combination logo with symbol and wordmark for [BRAND NAME], horizontal and stacked lockups, vector flat style, black on white, clear spacing, no mockup"),
F("lt_emblem","徽章標（Emblem）","把文字與圖形放在徽章、盾形或圓形容器內。","封閉輪廓，文字環繞或置中，細節豐富","傳統、權威、有歷史感","老字號、教育、職人、酒類、食品與社群組織","縮小後文字與細節容易糊；與現代極簡氣質衝突","復古徽章風格、粗襯線","文字標（與極簡的對比）","小尺寸須準備簡化版；刺繡與燙金需檢查最小線寬","容器形狀、線條粗細、文字環繞方式","Emblem logo for [BRAND NAME], circular badge with text arc and central symbol, vector flat style, one color, high detail but clear at large size, no mockup"),
F("lt_mascot","吉祥物標（Mascot）","用一個角色當標誌，通常能表情與動作化。","擬人或擬物角色，多姿勢、多表情","親切、有趣、容易建立情感","兒童、社群、餐飲與娛樂；需要大量內容與互動","與專業醫療、金融或需高度嚴肅的定位相衝突；製作與維護成本高","文字標（角色搭配字標）、手繪、有機柔和","極簡幾何標誌（以冷靜對比可愛）","角色設計需有版權歸屬與授權文件；製作 3D 或動畫是另一組模組","角色比例、表情數量、簡化版本","Mascot logo of [CHARACTER DESCRIPTION], friendly expression, simple shapes, flat vector style, front and three-quarter views, white background, no mockup, no extra text")]}]},
logoStyle:{title:"Logo 表現風格（最多選 3 個）",max:3,hint:"風格是『表現方法』，不等於類型：同樣是文字標，可以是極簡、手繪或奢華襯線。風格不要一對一綁死字體與色彩；若要刻意反差，請寫下理由。",groups:[{g:"風格",items:[
F("ls_minimal","極簡","用最少的線條與元素說清楚。","少量形狀、大量留白、克制配色","清晰、冷靜、現代","需要多渠道一致與小尺寸辨認","過度簡化會失去個性，變得像同行","幾何、負空間、單線","手繪、復古徽章","極簡最需要精準的比例與字距，須有向量母檔","元素數量、留白比例、線條粗細","Minimalist logo for [BRAND], few shapes, generous negative space, vector flat, single color on white, no mockup"),
F("ls_geo","幾何","用圓、方、三角等基本形建構。","精準的幾何網格、對稱或規律","精準、理性、可靠","科技、金融、建築、現代服務","過於冰冷或與其他幾何標誌雷同","極簡、抽象標、字母標","手繪、有機柔和","須有構成網格；曲線需平滑","網格、圓角、斜切角度","Geometric logo built on a clear grid with circles and squares for [BRAND], vector flat, one color, no mockup"),
F("ls_hand","手繪","保留手繪或手寫的筆觸與不完美。","不規則線條、筆刷或鉛筆痕跡","人味、獨特、親切","手作、餐飲、創意與個人品牌","難以精準縮放與統一；專業與嚴謹定位可能受影響","有機柔和、單線","極簡幾何","手繪筆觸需轉為乾淨向量並測試小尺寸","筆觸粗細、粗糙程度、是否保留紋理","Hand-drawn logo for [BRAND], organic brush lines, imperfect but balanced, black on white, vector clean-up ready, no mockup"),
F("ls_vintage","復古徽章","借用舊式徽章、招牌與印刷質感。","圈形、飾帶、細線與襯線字，有時帶舊化效果","傳統、可信、有故事","老字號、手工、餐飲、酒、咖啡","現代科技或極簡定位；小尺寸容易糊","徽章標、粗襯線","極簡、科技漸變","舊化效果須能被單色化；避免抄襲他人老品牌","線條粗細、裝飾量、舊化程度","Vintage badge style logo for [BRAND], circular emblem, serif lettering, clean vector, one color, no distress texture, no mockup"),
F("ls_luxury","奢華襯線","用高反差或精緻襯線字傳達品質。","細線與粗線對比、優雅字距、留白","精緻、典雅、價值感","高端服務、時尚、護膚、珠寶","小尺寸細線消失；過度使用成為俗套","極簡、字母標、黑金色彩","粗黑強烈、俏皮","須確認字體授權可用作標誌；細線需有最小尺寸","字體對比、字距、是否加花飾","Luxury serif logo for [BRAND], high-contrast typography, refined spacing, elegant, black on ivory, vector, no mockup"),
F("ls_tech","科技漸變","以漸變與光感表現數碼與未來感。","色彩漸變、發光、圓形或線路意象","創新、數碼、動感","軟件、AI、數碼服務","漸變難以單色化與印刷；容易變成模板","幾何、抽象標","手繪、復古徽章","必須準備不使用漸變的單色版本；漸變需符合媒介","漸變色標、角度、光感強度","Tech gradient logo for [BRAND], smooth color gradient, abstract mark, modern, vector, plus a flat one-color version, no mockup"),
F("ls_organic","有機柔和","使用柔和曲線與自然形態。","圓潤邊角、流動曲線、自然物意象","溫和、療癒、親近","健康、保養、生活方式、母嬰","不夠精準，可能顯得不夠專業；過度圓潤易幼稚","手繪、單線、自然色彩","幾何銳利、粗黑強烈","曲線需保持平滑、避免輕易變形","曲率、對稱性、是否封閉","Organic soft logo for [BRAND], flowing curves, gentle rounded forms, calm, vector flat, no mockup"),
F("ls_line","單線","用一條連續或統一粗細的線畫成。","細而均勻的線條，輪廓為主","輕盈、精緻、現代","美容、建築、設計、咖啡","細線在小尺寸與刺繡、燙金、單色印刷容易失敗","極簡、負空間","粗黑強烈","必須測最小線寬；單色製程需放大版本","線條粗細、端點形狀、是否封閉","Single line logo for [BRAND], continuous monoline, minimal, vector, black on white, no mockup"),
F("ls_bold","粗黑強烈","厚重、重量感大的字與形。","粗體字、大色塊、高對比","有力、自信、直接","運動、餐飲、潮流、促銷","與安靜、療癒或高端細緻定位衝突","幾何、字母標","單線、奢華襯線","粗體在中文字形尤其重，須檢查字形平衡","粗細、字距、色塊比例","Bold heavy logo for [BRAND], thick sans-serif lettering, strong contrast, vector, black on white, no mockup"),
F("ls_motion","動態標識","標誌本身就是會變化的系統。","可變形、可響應內容或情境的標誌","活躍、當代、靈活","媒體、活動、數碼平台","需要動態製作能力；印刷與小尺寸需靜態備援","抽象標、幾何","復古徽章、極簡靜態","必須定義靜態主版本與變化規則；動態屬後續專業模組","變化規則、節奏、固定部分","Dynamic logo system for [BRAND], show five states of the same mark responding to content, vector flat, consistent core shape, no mockup"),
F("ls_negative","負空間","用空白與形狀之間形成第二個意象。","正形與負形互相構成，雙重含意","聰明、精準、有層次","想表達雙重概念的品牌","如果意象牽強會顯得做作；小尺寸負空間可能消失","極簡、幾何、圖像標","手繪、粗黑強烈","須驗證單色與反白版本仍成立","負空間比例、對比、是否反轉","Negative space logo for [BRAND], hidden second image in the white space, vector flat, one color, no mockup")]}]},
typePers:{title:"字體個性方向（最多選 2 個）",max:2,hint:"先決定字體『像什麼』，再選實際字體（下一張卡）。個性展示、手寫與書法字體通常只適合標題與短句，內文要另選清楚的字體。",groups:[{g:"方向",items:[
F("tp_geo","幾何無襯線","字形接近圓與方的基本形。","幾何字母形狀、字形均勻","現代、清爽、友善","科技、教育、年輕品牌","長文閱讀可能較單調；容易與他人相似","極簡、幾何標誌","古典襯線、手寫","須檢查 1 與 l、I 是否易混淆","字重、字距、是否客製","Typographic specimen in a geometric sans-serif for [BRAND], headline and body sample, clean layout, white background"),
F("tp_humanist","人文無襯線","字形帶書寫痕跡、閱讀友善。","開口大、字形略有變化","溫暖、可讀、親切","健康、教育、服務","個性不突出","有機柔和、關懷","高反差襯線","需檢查中英混排的視覺大小","字重、字距","Typographic specimen in a humanist sans-serif for [BRAND], readable and warm, headline and body, white background"),
F("tp_swiss","中性瑞士無襯線","非常中性、秩序感強。","均勻筆畫、緊湊結構","清晰、客觀、國際","金融、介面、專業服務","缺乏個性，容易被視為冷淡","極簡、精準色彩","個性展示","數字與標點需檢查對齊","字重、行距、字距","Typographic specimen in a neutral Swiss-style sans-serif for [BRAND], grid layout, headline and body"),
F("tp_classic","古典襯線","傳統書籍與報刊的襯線字。","穩定的襯線、清楚比例","可信、文化、人文","出版、教育、法律、手作","不合適數碼小字級時需檢查可讀性","復古徽章、奢華襯線","粗黑強烈、等寬","須確認中文字體是否與襯線協調","字重、字距","Typographic specimen in a classic serif for [BRAND], editorial layout, headline and body"),
F("tp_didone","高反差襯線","粗細對比強烈的襯線字。","極細髮絲線與粗線並存","時尚、精緻、戲劇性","時裝、美妝、精品","小字級與螢幕上細線容易消失","奢華襯線","圓體、粗黑","只用於大標題或數字；內文另選","字重、字級","Typographic specimen in a high-contrast Didone serif for [BRAND], large editorial headline, white background"),
F("tp_slab","粗襯線","厚實的方形襯線。","粗壯襯線、堅實字形","穩重、手作、復古","餐飲、工藝、運動","精緻或療癒定位可能過重","復古、粗黑","極簡、細線","需檢查粗體與中文並用的平衡","字重","Typographic specimen in a slab serif for [BRAND], bold headline, warm background"),
F("tp_mono","等寬","每個字母寬度相同。","機械式、程式碼質感","技術、工程、精密","開發者工具、科技、數據","長文閱讀吃力；與溫暖定位衝突","科技、極簡","人文、手寫","適合標籤、編號與技術資料，不適合大量內文","字重、字級","Typographic specimen in a monospaced typeface for [BRAND], technical layout, labels and numbers"),
F("tp_round","圓體","筆畫端點圓潤。","圓端、柔和曲線","友善、輕鬆、親切","兒童、社群、食品、輕鬆服務","嚴肅專業定位可能不合適","有機柔和、俏皮","高反差襯線","中文圓體須確認授權與字形涵蓋","字重","Typographic specimen in a rounded sans-serif for [BRAND], friendly headline and body, light background"),
F("tp_kai","楷書／書法","以手寫楷書或書法筆意呈現。","筆畫有起收與輕重","文化、人文、溫度","文藝、傳統、茶與器物","長文可讀性差；法定或醫療資訊不宜使用","東方、手作","幾何、等寬","只適合標題、短句與落款；字形完整度需檢查","字重、筆意強度","Typographic specimen in a Chinese kai calligraphy style for [BRAND], title and short phrase, paper background"),
F("tp_display","個性展示","為標題設計、有明顯性格的字體。","獨特字形、誇張比例","突出、有記憶點","活動、潮流、出版封面","幾乎不能作內文；易過時","粗黑強烈、動態標識","中性瑞士","只作標題；須有可讀的內文備援","字重、字級","Typographic specimen in a distinctive display typeface for [BRAND], oversized headline only, bold layout"),
F("tp_hand","手寫／草寫","模仿手寫字。","不規則筆畫、連筆","親切、個人、有溫度","手作、個人品牌、溫馨訊息","長文可讀性低；重要資訊與價格不宜","手繪、有機柔和","中性瑞士、等寬","須避免用於需要精確辨認的資訊","字重、傾斜度","Typographic specimen in a handwritten script for [BRAND], short headline and signature, paper texture")]}]},
colorStyle:{title:"色彩風格方向（最多選 2 個）",max:2,hint:"色彩風格是『探索方向』，不是心理學結論。聯想會因人群、文化與行業而異，請以實際客人的反應為準。先選方向，再在下面定義色票角色與色值。",groups:[{g:"方向",items:[
F("cs_mono","單色柔和","同一色相的不同明度，加中性色。","單一色相、低對比漸階","安靜、統一、成熟","極簡、健康、服務","缺乏重點，容易沉悶","極簡、有機柔和","高飽和撞色","須檢查文字與背景對比不足的風險","色相、明度階數","Moodboard in monochrome soft tones of [HUE] with neutral accents, calm and cohesive, no text"),
F("cs_pastel","粉彩","高明度、低彩度的柔和色。","淡粉、淡藍、淡綠等","溫柔、輕盈、可愛","母嬰、美容、教育","文字對比常不足；可能顯得幼稚","有機柔和","黑金、霓虹","需特別檢查文字與按鈕對比","色相數量、明度","Moodboard in pastel colors, soft pink, mint, pale blue, airy and gentle, no text"),
F("cs_morandi","莫蘭迪低飽和","灰度高、低飽和的低調色。","灰調的粉、藍、綠、棕","沉靜、優雅、成熟","家居、文創、美妝","可能顯得髒或沉悶；數碼介面對比需處理","大地色、單色柔和","高飽和撞色","低飽和需配足夠的明度差；螢幕與印刷色差大","灰度、明度","Moodboard in Morandi muted tones, dusty rose, sage, greige, calm and sophisticated, no text"),
F("cs_clash","高飽和撞色","高彩度、互補或對比的組合。","鮮明色塊、強烈對比","活力、年輕、大膽","潮流、娛樂、餐飲","容易刺眼、疲勞；不適合需要安靜或可信的定位","粗黑強烈","單色柔和、莫蘭迪","印刷色域較小，鮮豔色可能偏暗；對比須檢查","色相數量、飽和度","Moodboard in high-saturation clashing colors, vibrant blocks with strong contrast, energetic, no text"),
F("cs_retro","復古暖調","偏黃、橘、棕的暖色。","暖橘、芥末黃、磚紅","懷舊、溫暖、有人味","餐飲、手作、生活風格","與冷靜精準的定位衝突","復古徽章、粗襯線","冷調科技","暖色與紙張組合最佳；螢幕上要檢查飽和度","暖度、明度","Moodboard in retro warm tones, mustard, burnt orange, cream and brown, nostalgic, no text"),
F("cs_coolTech","冷調科技","偏藍與青的冷色。","藍、青、深灰","精準、可信、數碼","科技、金融、醫療設備","容易冰冷、與同行相同","幾何、等寬","復古暖調","醫療與健康場景要避免『冰冷醫院感』","色相、明度、中性色偏向","Moodboard in cool tech palette, blue, teal and graphite, precise and modern, no text"),
F("cs_earth","大地色","來自泥土、石頭與植物的顏色。","棕、赭、橄欖、米","踏實、自然、溫暖","手作、有機食品、家居","與科技或前衛氣質衝突","有機柔和、手繪","霓虹暗色","自然色在不同材質與光線下差異大","色相、明度","Moodboard in earth tones, terracotta, olive, sand and clay, natural and grounded, no text"),
F("cs_blackgold","黑金","深黑搭金色。","深色底配金屬或金黃色","奢華、尊貴、儀式感","高端服務、珠寶、酒","極易變成俗套；金色在螢幕與印刷差異大","奢華襯線","粉彩、自然綠","金色須決定是印刷金屬或螢幕金黃；兩者不能互換","金色種類、黑色處理","Moodboard in black and gold palette, luxurious, restrained, matte black with brushed gold accents, no text"),
F("cs_neon","霓虹暗色","深色底配螢光色。","暗背景、發光的高彩色","未來、夜間、潮流","遊戲、夜生活、科技","與克制、可信、療癒氣質衝突；長時間閱讀不適","科技漸變","莫蘭迪、單色柔和","螢光色印刷困難；暗色模式需檢查對比","螢光色數量、亮度","Moodboard in neon dark palette, deep black background with glowing cyan and magenta, futuristic, no text"),
F("cs_green","自然綠","以綠色為主的自然色系。","草木綠、苔蘚綠、淺綠","清新、自然、健康","草本、有機、環保","容易落入保健品或環保的刻板；與綠色禁忌聯想須留意","有機柔和、大地色","霓虹暗色","綠色與紅色的區分對色盲不友善；狀態色需另行處理","色相偏黃偏藍、明度","Moodboard in natural green palette, leaf, moss and pale green, fresh and calm, no text"),
F("cs_duotone","雙色調","只用兩個主色，加中性色。","兩色互相對比或呼應","清楚、有記憶點、成本低","新品牌、單色印刷","色彩變化少，需靠形狀與字體增加層次","極簡、幾何","彩虹多色","單色與灰階版本最易處理；須檢查兩色對比","兩色明度差","Moodboard in a two-color palette, [COLOR 1] and [COLOR 2] with neutrals, clean and distinctive, no text"),
F("cs_cleanAccent","潔淨白＋點綴","大面積白或淺底，只用少量點綴色。","大量留白、單一點綴色","清爽、可信、乾淨","專業服務、健康、介面","太乾淨可能顯得冷淡；點綴色可能不夠辨識","極簡、精準","黑金、霓虹","大面積白底與純黑對比過強；須選帶色調的底色","點綴色、底色色溫","Moodboard in a clean white palette with one restrained accent color, airy and trustworthy, no text")]}]},
logoVariants:{title:"Logo 組合與變體（要製作哪些版本？）",max:99,hint:"至少要有：預設版本、反白版本、單色黑、單色白、小尺寸簡化版。其餘依觸點增加。每個版本都要有向量母檔、最小尺寸與淨空間規則（下方登記表）。",groups:[
{g:"主要版本",items:[I("lv_h","橫式組合","標誌與文字並排；網站頁首、文件與簽名檔最常用",{must:true}),I("lv_v","直式組合","標誌在上、文字在下；方形空間與包裝",{}),I("lv_mark","獨立圖形","只用標誌；頭像、圖示、印章",{}),I("lv_word","獨立字標","只用文字；窄長空間與正式文件",{}),I("lv_small","小尺寸簡化版","在很小尺寸時去除細節或調整字距",{must:true})]},
{g:"語言版本",items:[I("lv_bi_side","雙語並列","中文與英文並列，兩者同等重要",{}),I("lv_bi_main","雙語主次","一種語言為主、另一種為輔",{}),I("lv_zh","中文版","只用中文名稱",{}),I("lv_en","英文版","只用英文名稱",{})]},
{g:"色彩與媒介版本",items:[I("lv_black","單色黑","純黑；傳真、單色印刷、刻印",{must:true}),I("lv_white","單色白／反白","純白用於深色底、刺繡與燙金",{must:true}),I("lv_gray","灰階","黑白影印與無彩色顯示",{}),I("lv_app","App 圖示／頭像","圓形或方形裁切後仍辨識的版本",{}),I("lv_fav","Favicon（極小尺寸）","瀏覽器分頁與書籤",{}),I("lv_motion","動態版本","標誌動態或開場（屬後續動態模組）",{}),I("lv_emboss","工藝版本（燙金、壓凸）","用於特殊工藝的單色線稿",{})]}]},
colorRules:{title:"色彩使用規則（最多選 8 條）",max:8,hint:"把『誰能配誰、什麼時候用什麼』寫成規則。標示『自動』的規則，系統會依色票檢查。",groups:[{g:"對比與使用",items:[I("cr_accent","點綴色不作文字色","點綴色通常偏淺，作文字對比不足；文字與連結用互動色或墨色",{auto:true}),I("cr_action","互動元件一律用互動色","讓人一眼分辨可以按的東西",{auto:true}),I("cr_contrast","正文對比至少 4.5:1，大字與圖形至少 3:1","WCAG 的一般標準",{auto:true}),I("cr_notcolor","狀態不能只靠顏色","需搭配圖示或文字",{}),I("cr_noPureBlack","不用純黑作文字","用帶色調的墨色",{auto:true}),I("cr_noPureWhite","純白不作全頁背景","純白用於卡片與浮層",{auto:true}),I("cr_max3","同一畫面最多 3 種彩色","避免失去重點",{}),I("cr_logo","標誌只用核准的色彩變體","不自行換色",{}),I("cr_print","印刷色須以打樣確認","螢幕色不等於印刷色",{}),I("cr_share","子品牌或服務色只用在專屬面","避免主品牌被稀釋",{}),I("cr_photo","相片上的標誌或文字須有遮罩","背景會變動",{})]}]},
colorways:{title:"配色組合（Colorways）：標誌與核心圖形的核准前景／背景",max:99,hint:"每個組合是一組『前景＋背景』。系統用你填的色票計算對比。標誌文字依 WCAG 屬豁免項目，但可辨識性仍建議至少 3:1。",groups:[{g:"組合",items:[
I("cw_default","預設：墨色在底色上","最常用版本",{fg:"ink",bg:"canvas"}),I("cw_surface","墨色在卡片上","卡片、文件",{fg:"ink",bg:"surface"}),I("cw_brand","品牌色在底色上","品牌感更強；須確認對比",{fg:"brand",bg:"canvas"}),I("cw_accent","墨色在點綴色上","標籤與重點區塊",{fg:"ink",bg:"accent"}),I("cw_action","反白在互動色上","按鈕與主視覺色塊",{fg:"onAction",bg:"action"}),I("cw_inverse","反白在深色底上","頁尾、夜間與深色包裝",{fg:"canvas",bg:"ink"}),I("cw_black","單色黑在白底","傳真、單色印刷",{fg:"#000000",bg:"#FFFFFF"}),I("cw_white","單色白在深色底","刺繡、燙金、深色周邊",{fg:"#FFFFFF",bg:"ink"}),I("cw_gray","灰階版","黑白影印",{fg:"gray:ink",bg:"gray:canvas"})]}]},
outputNeeds:{title:"輸出與重現需求（哪些輸出需要特別處理？）",max:99,hint:"這張卡只記錄『需要什麼』，不替你批准製程。實際工藝、材質與色彩管理要由印刷廠或專業人士確認，並在後續模組深化。",groups:[{g:"螢幕",items:[I("on_srgb","sRGB 基準","所有螢幕的預設色彩空間"),I("on_p3","Display P3 增強","廣色域螢幕可顯示更鮮豔的顏色；必須有 sRGB 備援"),I("on_dark","深色模式","需要一組深色色票並重新檢查對比")]},{g:"印刷與實物",items:[I("on_cmyk","CMYK 印刷","色域小於 sRGB；鮮豔的藍、綠、橙可能偏暗；需 ICC 描述檔與打樣"),I("on_spot","專色（如 Pantone）","需要精確品牌色；成本較高"),I("on_metal","金屬或螢光色","無法用 RGB 或 CMYK 準確表現；需特殊油墨或箔"),I("on_mono","單色製程（刺繡、燙印、雷射）","需要專用單色版本與最小線寬"),I("on_sample","實物色樣","產品、制服、招牌需要實物色卡確認"),I("on_none","不需要印刷或實物","純數碼品牌")]}]},
nextModules:{title:"後續需要哪些專業模組？（Stage 5，先選需要的，其餘標為不適用）",max:99,hint:"4A 只做核心識別。依業務選擇後續模組，沒有選到的就是『不適用或暫不需要』；每個模組之後都有自己的選項、提示詞與驗證。",groups:[{g:"模組",items:[I("nm_pattern","圖案與紋樣","母題、單元、重複方式、密度、縮放、用途與接縫驗證"),I("nm_image","影像與攝影","人物、燈光、構圖、色調與後製"),I("nm_video","影片與動態","鏡頭、節奏、字幕與格式"),I("nm_sound","聲音","音訊標誌、品牌音樂、旁白與授權；需要專業聲音模組"),I("nm_3d","3D","造型、材質、場景、光照與渲染"),I("nm_product","產品與材質","使用需求、造型、CMF、結構、製程；工程規格須由專業人士驗證"),I("nm_digital","數碼與服務","任務流程、資訊架構、元件狀態與無障礙"),I("nm_space","空間","動線、私隱、照明、聲學與材質"),I("nm_marketing","行銷","目標、受眾、訊息、渠道與實驗"),I("nm_motion","動態識別","標誌與介面動態規則"),I("nm_none","全部不適用","目前只需要靜態核心識別")]}]},
compareTouch:{title:"候選比較觸點（所有候選使用相同觸點）",max:99,hint:"所有候選方向都要用相同內容比較同一批觸點，才公平。不適用要寫理由，不可靜悄悄省略。",groups:[{g:"觸點",items:[I("ct_logo","Logo 與縮小版","辨識度、小尺寸、單色"),I("ct_poster","海報","視覺張力與版面"),I("ct_web","網站首頁","字體、色彩與互動"),I("ct_pack","包裝","材質、工藝與色差"),I("ct_video","影片分鏡","時間、節奏與動態"),I("ct_sound","聲音簡報","若沒有聲音模組可標為不適用")]}]}
};
const CAT_KEYS=Object.keys(CAT);

const O=(id,zh,desc)=>({id,zh,desc:desc||""});
const dial=(id,title,left,right,q)=>({id,title,q:q||`${left}　←→　${right}`,opts:[O(id+"_m2","很偏「"+left+"」",""),O(id+"_m1","偏「"+left+"」",""),O(id+"_z","中間／兩者並重",""),O(id+"_p1","偏「"+right+"」",""),O(id+"_p2","很偏「"+right+"」","")],left,right});
const SETS={
arch:{title:"識別任務與品牌架構",dims:[
{id:"archModel",title:"這套識別代表誰？（品牌架構）",q:"先決定識別代表公司、單一產品還是一個家族；選錯架構，後面每個版本都會混亂。",opts:[O("ar_corp","企業品牌","公司名稱就是品牌；產品用公司品牌或只做描述"),O("ar_single","單一產品／服務品牌","品牌就是這一個產品"),O("ar_endorse","母品牌背書","子品牌有自己的名字與個性，但標示母品牌背書"),O("ar_family","子品牌家族","共享同一套識別系統，變化顏色或圖形"),O("ar_house","獨立多品牌","各品牌互不相關，只在法律層面連結"),O("ar_event","活動或期間限定","短期識別，結束後停用"),O("ar_unsure","還不確定","先用企業品牌處理，之後再拆")]},
{id:"idJob",title:"這次識別的任務",q:"不同任務，保留與改變的比例完全不同。",opts:[O("ij_new","從零新建","沒有任何既有識別"),O("ij_keep","延續並整理","保留大部分元素，統一規範"),O("ij_refresh","微調更新","保留標誌核心，更新細節、字體與顏色"),O("ij_rebrand","全面重塑","大幅改變，只保留必須保留的資產"),O("ij_sub","新增子品牌","在現有識別系統下增加新成員"),O("ij_partial","只更新局部","例如只補單色版或小尺寸版")]}]},
dials:{title:"識別個性刻度（把策略翻譯成視覺偏好）",dims:[
dial("d_logic","理性或感性","理性、精準","感性、人味"),dial("d_trad","傳統或前衛","傳統、經典","前衛、新穎"),dial("d_auth","權威或親切","權威、專業","親切、友善"),dial("d_refined","精緻或樸實","精緻、克制","樸實、直接"),dial("d_quiet","安靜或鮮明","安靜、低調","鮮明、搶眼"),dial("d_craft","工整或手作","工整、規則","手作、不完美")]},
logoSys:{title:"標誌系統與規格",dims:[
{id:"langLockup",title:"中英文名稱的處理",q:"雙語品牌必須決定哪個為主，否則每個人排出來都不一樣。",opts:[O("ll_zh","中文為主、英文為輔",""),O("ll_en","英文為主、中文為輔",""),O("ll_side","中英並列、同等重要","要製作兩套比例"),O("ll_zhonly","只用中文",""),O("ll_enonly","只用英文",""),O("ll_tbd","未決定","")]},
{id:"clearSpace",title:"淨空間（標誌周圍的留白）怎麼定義",q:"淨空間是保護標誌的最小留白，要用標誌自身的某部分當單位，才會隨大小縮放。",opts:[O("cs_h","以標誌高度的比例",""),O("cs_x","以某個字母或圖形的高度",""),O("cs_ratio","固定比例框",""),O("cs_tbd","待測試後決定","")]},
{id:"vectorStatus",title:"向量母檔狀態",q:"只有 PNG 或 JPG 不算母檔。向量母檔（例如 SVG、AI、PDF 向量）才能無損縮放與製版。",opts:[O("vs_none","還沒有",""),O("vs_sketch","只有草圖或點陣圖",""),O("vs_master","已有向量母檔",""),O("vs_verified","向量母檔已通過尺寸與單色測試","")]},
{id:"minSizeStatus",title:"最小尺寸測試",q:"最小尺寸要在真實媒介上測：螢幕與印刷分開。",opts:[O("ms_none","還沒測試",""),O("ms_screen","螢幕已測試",""),O("ms_print","印刷已測試",""),O("ms_both","螢幕與印刷都已測試","")]}]},
typeSys:{title:"字體與排版規格",dims:[
{id:"tyScale",title:"字級比例",q:"相鄰兩級字的倍數；比例越大，層次越誇張。",opts:[O("ts_112","1.125（很細緻）",""),O("ts_120","1.2（溫和）",""),O("ts_125","1.25（最常用）",""),O("ts_133","1.333（明顯、有編輯感）",""),O("ts_150","1.5（戲劇化）","")]},
{id:"tyBase",title:"內文基本字級",q:"",opts:[O("tb_16","16 px","資訊密度較高"),O("tb_17","17 px","略大，閱讀舒適"),O("tb_18","18 px","大，文字導向或長者友善")]},
{id:"tyLhCjk",title:"中文內文行高",q:"中文方塊字需要比西文更大的行距。",opts:[O("tl_16","1.6","偏緊，只適合短文"),O("tl_17","1.7","標準"),O("tl_18","1.8","寬鬆，長文最舒適"),O("tl_19","1.9","非常寬鬆")]},
{id:"tyMeasure",title:"單行長度",q:"每行不要太長。中文約 30–40 字、英文約 60–75 字元是常見參考，不是定律。",opts:[O("tm_n","窄（中文約 28 字）","手機優先"),O("tm_s","標準（中文約 36 字）","最通用"),O("tm_w","寬（中文約 44 字）","資訊型頁面")]},
{id:"tyWeights",title:"使用的字重數量",q:"字重越多，檔案越大、越難統一。",opts:[O("tw_2","只用兩種","常規＋粗體"),O("tw_3","三種","常規、中等、粗體"),O("tw_4","四種以上","需要更完整的層次")]}]},
colorSys:{title:"色彩系統策略",dims:[
{id:"cRatio",title:"色彩比例模型",q:"畫面上顏色怎麼分配。『60／30／10』是 60% 主導、30% 輔助、10% 點綴的比例原則。",opts:[O("cr_80155","80／15／5：底色／墨色／點綴","極簡，點綴只佔很小"),O("cr_603010","60／30／10：主導／輔助／點綴","傳統比例，有大面積品牌輔助色"),O("cr_dual","淺色與深色雙主題同等重要",""),O("cr_mono","單色相＋中性",""),O("cr_multi","多色（多服務線）","需要額外規則")]},
{id:"cChroma",title:"彩度傾向",q:"",opts:[O("cc_soft","柔和（低彩）","安靜、成熟"),O("cc_std","標準","平衡"),O("cc_vivid","鮮明（高彩）","只適合小面積")]},
{id:"cNeutral",title:"中性色偏向",q:"背景與文字用的灰與白，偏暖、偏冷還是跟隨主色。",opts:[O("cn_warm","偏暖","溫潤"),O("cn_cool","偏冷","精密"),O("cn_follow","跟隨主色（微染色）","最協調"),O("cn_pure","純中性灰","最中立")]},
{id:"cContrast",title:"文字對比目標",q:"WCAG 一般文字 AA 為 4.5:1、AAA 為 7:1。",opts:[O("ct_aa","AA（4.5:1）","標準要求"),O("ct_aaa","AAA（7:1）","高要求場景")]},
{id:"cDark",title:"深色模式",q:"",opts:[O("cd_none","不提供",""),O("cd_auto","跟隨系統設定",""),O("cd_dual","品牌雙主題",""),O("cd_section","只在局部使用深色區塊","")]},
{id:"cStatus",title:"狀態色（成功／警告／錯誤／資訊）",q:"狀態不可只靠顏色，要配圖示或文字。",opts:[O("cs_std","標準（綠黃紅藍）","最易辨識"),O("cs_soft","柔化","與品牌色協調，須再檢查對比"),O("cs_brand","只用品牌色加圖示","不建議用於錯誤訊息")]}]},
outSys:{title:"輸出細節",dims:[
{id:"printProfile",title:"CMYK 色彩描述檔（ICC）",q:"RGB 轉 CMYK 必須使用描述檔，並以印刷廠實際使用的為準。",opts:[O("pp_ask","向印刷廠確認（建議）",""),O("pp_fogra","FOGRA39／51（歐洲膠版）",""),O("pp_gracol","GRACoL／SWOP（北美）",""),O("pp_japan","Japan Color（日本）",""),O("pp_na","不印刷","")]},
{id:"proofStatus",title:"品牌色打樣狀態",q:"打樣後才能記錄官方 CMYK 與專色色號。",opts:[O("pf_none","還沒有打樣",""),O("pf_done","已打樣，待確認",""),O("pf_ok","已打樣並由指定人員確認","")]}]},
decision:{title:"方向選擇",dims:[
{id:"finalDir",title:"目前傾向的方向",q:"選擇不等於核准；核准需要在最後一張卡記錄。",opts:[O("fd_a","候選 A",""),O("fd_b","候選 B",""),O("fd_c","候選 C",""),O("fd_mix","混合後重新驗證","需要重新做同內容比較"),O("fd_more","需要補充證據",""),O("fd_none","暫不決定","")]}]}
};
const DIMS_ALL=Object.entries(SETS).flatMap(([set,g])=>g.dims.map(d=>Object.assign({set},d)));
const DIAL_IDS=SETS.dials.dims.map(d=>d.id);
const T=(id,label,ph,help,rows)=>({id,label,ph:ph||"",help:help||"",rows:rows||2});
const TEXTS=[
T("brandName","品牌名稱（用於標誌）","例：滿月堂","標誌上會出現的文字；若已匯入 Stage 0 會自動帶入。",1),
T("brandNameEn","英文名稱（如有）","例：Moonic","沒有可留空。",1),
T("idBrief","識別任務（一句話）","例：把一間中醫診所的識別整理成可在網站、包裝與制服一致使用的系統","說清楚這套識別要解決什麼。",2),
T("mustKeep","一定要保留","例：現有的月亮意象與紫藍色","列出不可丟的資產與理由。",2),
T("mustAvoid","絕對要避免","例：像連鎖美容院、像醫院","可參考 Stage 1 的 Anti-Persona。",2),
T("logoConcept","標誌的概念與故事","例：月相代表日夜調理與循環","標誌背後的意念；避免空泛字眼。",3),
T("logoNotes","標誌補充說明","例：中文字標需客製，英文用現成字體微調","製作要求、已知風險與待決事項。",3),
T("typeNotes","字體補充說明","例：標題用襯線強調人味，內文用黑體確保可讀","",3),
T("colorNotes","色彩補充說明","例：紫藍為主色，粉紅與杏色只用於服務標記","",3),
T("tmNote","商標與相似度查證備註","例：已自行搜尋，未見相同標誌；尚未請專業人士確認","只是記錄；不構成法律意見。",2),
T("statement","識別宣言（一句話）","例：安靜而精準，像月光下的診間","一句話說清楚這套識別的選擇與取捨。",3)
];
const TEXT_BY=Object.fromEntries(TEXTS.map(t=>[t.id,t]));
const LINKS={tm:["知識產權署：搜尋商標","https://www.ipd.gov.hk/en/trade-marks/search-for-a-trade-mark/index.html"],blis:["商業牌照資料服務（BLIS）自我評估","https://www.success.tid.gov.hk/tid/eng/blics/index.jsp"]};
// 色票角色（手動輸入並計算對比）
const PAL_ROLES=[{id:"canvas",zh:"頁面底色",desc:"整頁背景，面積最大"},{id:"surface",zh:"卡片底色",desc:"卡片、浮層"},{id:"ink",zh:"主文字",desc:"標題與內文"},{id:"muted",zh:"次要文字",desc:"說明與註腳"},{id:"brand",zh:"品牌主色",desc:"標誌與品牌識別色"},{id:"accent",zh:"點綴色",desc:"標籤、重點面；通常偏淺"},{id:"action",zh:"互動色",desc:"連結、按鈕、焦點"},{id:"onAction",zh:"互動上文字",desc:"按鈕文字"}];
const PAL_PAIRS=[["ink","canvas",4.5,"主文字在頁面底色"],["ink","surface",4.5,"主文字在卡片"],["muted","canvas",4.5,"次要文字在頁面底色"],["muted","surface",4.5,"次要文字在卡片"],["action","canvas",4.5,"連結（互動色）在頁面底色"],["onAction","action",4.5,"按鈕文字"],["brand","canvas",3,"品牌主色（標誌、圖形）在底色"]];
// 字體登記
const TYPE_ROLES=[{id:"display",zh:"西文標題"},{id:"body",zh:"西文內文"},{id:"cjkDisplay",zh:"中文標題"},{id:"cjkBody",zh:"中文內文"},{id:"num",zh:"數字與價格"},{id:"mono",zh:"等寬／技術資料"},{id:"fallback",zh:"系統備援"},{id:"other",zh:"其他語言"}];
const TYPE_SRC=[["","未選"],["open","開源（如 OFL，附來源）"],["buy","購買商用授權"],["system","系統字體"],["custom","品牌專屬／客製"],["tbd","未定"]];
const TYPE_LIC=[["","未選"],["unknown","授權未知／未查"],["open_ok","開源授權已確認（附連結）"],["buy_ok","商用授權已購（附證明）"],["system","系統內建（不可自行嵌入）"],["custom_ok","客製合約已簽"],["na","不適用"]];
const TYPE_HK=[["","未選"],["no","未檢查"],["hk","已檢查香港字形"],["tc","台灣字形（已知差異）"],["na","不適用"]];
const LOGO_STATUS=[["","未選"],["none","未製作"],["sketch","草圖"],["vector","向量母檔"],["tested","已測試最小尺寸"],["approved","已核准（本機記錄）"]];
const STATUS=[["draft","草稿"],["ai","AI 提案（未經人類審視）"],["verify","待驗證"],["review","請求人類核准"],["approved","已核准（本機記錄）"],["revise","需修訂"]];
const CARD_IDS=["arch","brief","logoType","logoStyle","logoSys","type","typeSpec","colorStyle","palette","colorways","output","compare","approval"];
const DOWNSTREAM={logoType:["圖案與紋樣（母題）","影像構圖","3D 吉祥物或造型","產品標示與工藝"],logoStyle:["圖案風格","圖示與插圖","動態識別","包裝工藝"],type:["介面字體","文件與簡報模板","包裝文案","影片字幕"],colorStyle:["影像色調","UI 色彩 token","包裝與印刷","空間與產品 CMF"],palette:["UI 色彩 token","對比與無障礙測試","印刷打樣","簡報與文件模板"],logoSys:["所有觸點的標誌使用","供應商交付包","商標與資產登記"]};
