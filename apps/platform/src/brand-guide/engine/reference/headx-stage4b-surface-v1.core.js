
const KEY="brand_stage4b_v1";
const BK={s0:"brand_brief_stage0",s1:"brand_brief_stage1",s2:"brand_brief_stage2",s3:"brand_brief_stage3",s4a:"brand_brief_stage4a"};
const norm=t=>String(t||"").replace(/\s+/g,"").toLowerCase();
const emptyState=()=>{const s={s0:null,s1:null,s2:null,s3:null,s4a:null,dims:{},text:{},cw:{},cm:{},custom:{}};CAT_KEYS.forEach(k=>{s[k]=[];s.custom[k]=[]});return s};
function load(){let s=emptyState();try{const r=JSON.parse(localStorage.getItem(KEY)||"null");if(r){const e=emptyState();s=Object.assign(e,r);s.custom=Object.assign(e.custom,r.custom||{});s.dims=r.dims||{};s.text=r.text||{};s.cw=r.cw||{};s.cm=r.cm||{};CAT_KEYS.forEach(k=>{if(!Array.isArray(s[k]))s[k]=[];if(!Array.isArray(s.custom[k]))s.custom[k]=[]})}}catch(x){}return autoImport(s)}
function autoImport(s){Object.keys(BK).forEach(n=>{if(s[n])return;try{const raw=localStorage.getItem(BK[n]);if(raw){const p=PARSE[n](raw);if(p){s[n]=p;if(n==="s4a")fillPalette(s,p)}}}catch(x){}});return s}
function fillPalette(s,p){Object.entries(p.palette||{}).forEach(([k,v])=>{if(/^c_/.test(k)&&!String(s.text[k]||"").trim()&&hex(v))s.text[k]=v})}
function save(s){try{localStorage.setItem(KEY,JSON.stringify(s))}catch(x){}}
const flat=k=>CAT[k].groups.flatMap(g=>g.items);
const byId=(k,id)=>flat(k).find(i=>i.id===id);
const labels=(k,s)=>[...s[k].map(id=>(byId(k,id)||{zh:id}).zh),...s.custom[k]];
const items=(k,s)=>[...s[k].map(id=>byId(k,id)||{id,zh:id,desc:"",t:[],conf:[]}),...s.custom[k].map(t=>({id:"custom",zh:t,desc:"（自訂）",t:[],conf:[]}))];
const count=(k,s)=>s[k].length+s.custom[k].length;
const has=(s,id)=>CAT_KEYS.some(k=>s[k].includes(id));
const anyName=id=>{for(const k of CAT_KEYS){const i=byId(k,id);if(i)return i.zh}return id};
const picked=(s,d)=>{const id=s.dims[d];return id?OPTD(d,id):null};
const T_=(s,id)=>String(s.text[id]||"").trim();
const nameList=a=>(a||[]).map(x=>x&&x.name).filter(Boolean);
function J(t){try{return typeof t==="string"?JSON.parse(t):t}catch(e){return null}}
const brandName=s=>T_(s,"brandName")||(s.s1&&s.s1.name)||(s.s0&&s.s0.name)||"品牌";

// ---------- 前階段匯入 ----------
function parseS0(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage0"))return null;const ch=j.choices||{},sel=j.selections||{};return {name:(j.text||{}).trading||(j.text||{}).legalZh||"",budget:(ch.brandBudget||{}).name||"",priceTier:(ch.priceTier||{}).name||"",industry:nameList(sel.industry),delivery:nameList(sel.delivery)}}
function parseS1(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage1"))return null;return {name:j.brand_name||"",statement:(j.positioning_statement||{}).text||"",dials:((j.core_tension||{}).dials||[]).map(d=>({id:d.id,left:d.left,right:d.right,position:d.position})),anti:nameList(j.anti_persona)}}
function parseS2(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage2"))return null;const rules={};Object.entries(j.physics_rules||{}).forEach(([k,v])=>rules[k]=(v&&v.name)||"");return {statement:(j.sensory_statement||{}).text||"",keywords:nameList(j.mood_keywords),anti:nameList(j.anti_keywords),avoid:nameList(j.avoid_materials),rules}}
function parseS3(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage3"))return null;return {statement:(j.voice_statement||{}).text||"",personality:nameList(j.personality)}}
function parseS4a(t){const j=J(t);if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4a"))return null;const c=j.color||{},ty=j.typography||{};
  return {statement:(j.visual_statement||{}).text||"",palette:c.palette||{},colorStyle:nameList(c.style),shape:nameList((j.shape||{}).style),pattern:nameList((j.pattern||{}).style),patternUse:((j.pattern||{}).use||{}).name||"",texture:nameList(j.texture),avoid:nameList(j.visual_avoid),tokens:j.visual_tokens||{},treatment:(((j.photography||{}).treatment)||{}).name||"",fonts:ty.fonts||{}}}
const PARSE={s0:parseS0,s1:parseS1,s2:parseS2,s3:parseS3,s4a:parseS4a};
function importBrief(text,s){const j=J(text);if(!j||typeof j.schema!=="string")return null;const m=j.schema.match(/^brand\/stage(\d)(a?)/);if(!m)return null;const k="s"+m[1]+m[2];if(!PARSE[k])return null;const p=PARSE[k](j);if(!p)return null;s[k]=p;if(k==="s4a")fillPalette(s,p);try{localStorage.setItem(BK[k],JSON.stringify(j))}catch(e){}return k}
function ctxStages(s){const a=[];
  a.push(s.s0?`【Stage 0 業務】行業：${s.s0.industry.join("、")||"（無）"}｜價格定位：${s.s0.priceTier||"（無）"}｜品牌預算：${s.s0.budget||"（無）"}｜交付：${s.s0.delivery.join("、")||"（無）"}`:"【Stage 0 業務】（尚未匯入）");
  a.push(s.s1?`【Stage 1 定位】品牌：${s.s1.name||"（尚未命名）"}｜宣言：${s.s1.statement||"（無）"}｜張力刻度：${s.s1.dials.map(d=>`${d.left}↔${d.right}=${d.position}`).join("；")||"（無）"}｜絕對不要像：${s.s1.anti.join("、")||"（無）"}`:"【Stage 1 定位】（尚未匯入）");
  a.push(s.s2?`【Stage 2 感官】感官宣言：${s.s2.statement||"（無）"}｜關鍵字：${s.s2.keywords.join("、")||"（無）"}｜反關鍵字：${s.s2.anti.join("、")||"（無）"}｜物理禁區：${s.s2.avoid.join("、")||"（無）"}｜視覺物理規則：${Object.entries(s.s2.rules).map(([k,v])=>k+"="+v).join("；")||"（無）"}`:"【Stage 2 感官】（尚未匯入）");
  a.push(s.s3?`【Stage 3 語言】聲音宣言：${s.s3.statement||"（無）"}｜性格：${s.s3.personality.join("、")||"（無）"}`:"【Stage 3 語言】（尚未匯入）");
  a.push(s.s4a?`【Stage 4A 視覺語言】一句話：${s.s4a.statement||"（無）"}｜色彩風格：${s.s4a.colorStyle.join("、")||"（無）"}｜形狀：${s.s4a.shape.join("、")||"（無）"}｜圖案：${s.s4a.pattern.join("、")||"（無）"}（${s.s4a.patternUse||"未定"}）｜紋理：${s.s4a.texture.join("、")||"（無）"}｜視覺禁區：${s.s4a.avoid.join("、")||"（無）"}`:"【Stage 4A 視覺語言】（尚未匯入）");
  return a.join("\n")}
function ctxSurface(s){const L=k=>labels(k,s).join("、")||"（尚未選擇）",P=d=>{const o=picked(s,d);return o?o.zh:"（尚未選擇）"},X=id=>T_(s,id)||"（尚未填寫）";
  return [`漸變：${L("gradType")}｜用途 ${L("gradUse")}｜色數 ${P("gradStops")}｜備援 ${P("gradFallback")}｜色標 ${X("g_a")} / ${X("g_b")} / ${X("g_c")}｜角度 ${X("g_angle")}`,`填色：${L("fillType")}｜透明度 ${P("fillOpacity")}｜狀態 ${P("fillStates")}`,`邊框：${L("borderStyle")}｜粗細 ${P("borderWidth")}｜顏色 ${P("borderColor")}｜焦點 ${P("focusRing")}`,`形狀：${L("shapeKit")}｜圓角 ${P("radiusScale")}｜陰影 ${P("elevation")}`,`紋理：${L("texSpec")}｜混合 ${P("texBlend")}｜預算 ${P("texBudget")}`,`無縫圖案：母題 ${L("patMotif")}｜重複 ${L("repeat")}｜密度 ${P("patDensity")}｜對比 ${P("patContrast")}｜填法 ${P("patFill")}｜單元 ${X("pt_size")}px`,`配色變體：${L("colorways")}`,`色彩輸出：${L("colorOut")}｜P3 ${P("p3Policy")}｜CMYK ${P("cmykPolicy")}｜TAC ${P("tacLimit")}｜出血 ${P("bleed")}`,`承印物：${L("substrates")}｜工藝：${L("processes")}`,`表面禁區：${L("avoidSurface")}`,`色值：主 ${X("c_primary")}｜輔 ${X("c_secondary")}｜點綴 ${X("c_accent")}｜文字 ${X("c_ink")}｜背景 ${X("c_paper")}`].join("\n")}

// ---------- 色彩數學 ----------
function hex(v){const m=String(v||"").trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);if(!m)return null;let h=m[1];if(h.length===3)h=h.split("").map(c=>c+c).join("");return "#"+h.toUpperCase()}
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const lin=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
const enc=l=>l<=.0031308?12.92*l:1.055*Math.pow(l,1/2.4)-.055;
const toLin=h=>rgb(h).map(v=>lin(v/255));
const cl=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const fromLin=v=>"#"+v.map(x=>Math.round(cl(enc(cl(x)))*255).toString(16).padStart(2,"0")).join("").toUpperCase();
const lum=h=>{const [r,g,b]=toLin(h);return .2126*r+.7152*g+.0722*b};
const fr=x=>(Math.floor(x*100)/100).toFixed(2);
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
function hsl(h){const [r,g,b]=rgb(h).map(v=>v/255);const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;let H=0,S=0;if(mx!==mn){const d=mx-mn;S=l>.5?d/(2-mx-mn):d/(mx+mn);H=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;H*=60}return {h:H,s:S*100,l:l*100}}
const mul=(M,v)=>M.map(r=>r[0]*v[0]+r[1]*v[1]+r[2]*v[2]);
const M_S2X=[[0.4124564,0.3575761,0.1804375],[0.2126729,0.7151522,0.0721750],[0.0193339,0.1191920,0.9503041]];
const M_X2P3=[[2.4934969,-0.9313836,-0.4027108],[-0.8294890,1.7626641,0.0236247],[0.0358458,-0.0761724,0.9568845]];
const linToP3=v=>mul(M_X2P3,mul(M_S2X,v));
function toOklab(v){const l=Math.cbrt(.4122214708*v[0]+.5363325363*v[1]+.0514459929*v[2]),m=Math.cbrt(.2119034982*v[0]+.6806995451*v[1]+.1073969566*v[2]),s=Math.cbrt(.0883024619*v[0]+.2817188376*v[1]+.6299787005*v[2]);return [.2104542553*l+.7936177850*m-.0040720468*s,1.9779984951*l-2.4285922050*m+.4505937099*s,.0259040371*l+.7827717662*m-.8086757660*s]}
function fromOklab(L,a,b){const l=Math.pow(L+.3963377774*a+.2158037573*b,3),m=Math.pow(L-.1055613458*a-.0638541728*b,3),s=Math.pow(L-.0894841775*a-1.2914855480*b,3);return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.7076147010*s]}
function toOklch(h){const [L,a,b]=toOklab(toLin(h));let H=Math.atan2(b,a)*180/Math.PI;if(H<0)H+=360;return {L,C:Math.sqrt(a*a+b*b),H}}
const inGamut=v=>v.every(x=>x>=-.0005&&x<=1.0005);
function fromOklchSRGB(L,C,H){let c=C;for(let i=0;i<40;i++){const a=c*Math.cos(H*Math.PI/180),b=c*Math.sin(H*Math.PI/180);const v=fromOklab(L,a,b);if(inGamut(v))return fromLin(v);c*=.94}return fromLin(fromOklab(L,0,0))}
const adjustL=(h,dl)=>{const o=toOklch(h);return fromOklchSRGB(cl(o.L+dl,.02,.98),o.C,o.H)};
function p3Values(h,f){const o=toOklch(h);let c=o.C*f;let v=null;for(let i=0;i<40;i++){const a=c*Math.cos(o.H*Math.PI/180),b=c*Math.sin(o.H*Math.PI/180);const p=linToP3(fromOklab(o.L,a,b));if(inGamut(p)){v=p;break}c*=.94}if(!v)v=linToP3(toLin(h));return v.map(x=>cl(enc(cl(x))))}
const p3CSS=v=>`color(display-p3 ${v.map(x=>x.toFixed(4)).join(" ")})`;
function cmykNaive(h){const [r,g,b]=rgb(h).map(v=>v/255);const k=1-Math.max(r,g,b);if(k>=.9999)return {c:0,m:0,y:0,k:100,tac:100};const c=(1-r-k)/(1-k),m=(1-g-k)/(1-k),y=(1-b-k)/(1-k);const o={c:Math.round(c*100),m:Math.round(m*100),y:Math.round(y*100),k:Math.round(k*100)};o.tac=o.c+o.m+o.y+o.k;return o}
function grayOf(h){const y=lum(h);const g=Math.round(cl(enc(y))*255).toString(16).padStart(2,"0").toUpperCase();return "#"+g+g+g}
const CVD={"紅色盲（Protan）":[[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],"綠色盲（Deutan）":[[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],"藍黃色盲（Tritan）":[[1.255528,-0.076749,-0.178779],[-0.078411,0.930809,0.147602],[0.004733,0.691367,0.303900]]};
const simCVD=(h,M)=>fromLin(mul(M,toLin(h)).map(x=>cl(x)));
function toLab(h){const v=toLin(h),X=mul(M_S2X,v);const f=t=>t>216/24389?Math.cbrt(t):(24389/27*t+16)/116;const fx=f(X[0]/.95047),fy=f(X[1]),fz=f(X[2]/1.08883);return [116*fy-16,500*(fx-fy),200*(fy-fz)]}
function dE(a,b){const x=toLab(a),y=toLab(b);return Math.sqrt((x[0]-y[0])**2+(x[1]-y[1])**2+(x[2]-y[2])**2)}
const COLS=[["c_primary","主色"],["c_secondary","輔色"],["c_accent","點綴色"],["c_ink","文字色"],["c_paper","背景色"]];
function palette(s){const o={};COLS.forEach(([id])=>{const h=hex(s.text[id]);if(h)o[id]=h});return o}
const RAMPN=[50,100,200,300,400,500,600,700,800,900],RAMPL=[.97,.93,.86,.77,.68,.59,.50,.42,.34,.26],RAMPC=[.25,.45,.7,.9,1,1,1,.9,.75,.6];
function ramp(h){const o=toOklch(h);return RAMPN.map((n,i)=>({n,hex:fromOklchSRGB(RAMPL[i],o.C*RAMPC[i],o.H)}))}

// ---------- 漸變 ----------
function gradStops(s){const a=hex(s.text.g_a),b=hex(s.text.g_b),c=hex(s.text.g_c);if(!a||!c)return null;const mid=cl(parseFloat(s.text.g_mid)||50,1,99);const st=[{hex:a,pos:0}];if(b)st.push({hex:b,pos:mid});st.push({hex:c,pos:100});return st}
function sampleGrad(st,t){t=t*100;let i=0;while(i<st.length-2&&t>st[i+1].pos)i++;const a=st[i],b=st[i+1];const u=cl((t-a.pos)/Math.max(1,b.pos-a.pos));const A=rgb(a.hex),B=rgb(b.hex);return "#"+A.map((v,k)=>Math.round(v+(B[k]-v)*u).toString(16).padStart(2,"0")).join("").toUpperCase()}
function gradCSS(s){const st=gradStops(s);if(!st)return null;const ang=isFinite(parseFloat(s.text.g_angle))?parseFloat(s.text.g_angle):135;const list=st.map(x=>`${x.hex} ${x.pos}%`).join(", ");
  if(has(s,"gt_radial")&&!has(s,"gt_linear"))return `radial-gradient(circle at 50% 40%, ${list})`;if(has(s,"gt_conic")&&!has(s,"gt_linear"))return `conic-gradient(from ${ang}deg, ${list})`;return `linear-gradient(${ang}deg, ${list})`}
function gradSamples(s){const st=gradStops(s),tx=hex(s.text.g_txt);if(!st)return null;const out=[];for(let i=0;i<=10;i++){const c=sampleGrad(st,i/10);out.push({t:i*10,color:c,ratio:tx?ratio(c,tx):null})}return out}

// ---------- 無縫圖案 ----------
function patParams(s){const n=(id,d)=>{const v=parseFloat(T_(s,id));return isFinite(v)&&v>0?v:d};const p=palette(s);
  return {size:n("pt_size",48),motif:cl(n("pt_motif",40),5,100),stroke:n("pt_stroke",2),rot:parseFloat(T_(s,"pt_rot"))||0,c1:hex(T_(s,"pt_c1"))||p.c_primary||"#2F6BFF",bg:hex(T_(s,"pt_c2"))||p.c_paper||"#FFFFFF",mm:parseFloat(T_(s,"pt_mm"))||0}}
const MOTIF_KIND={pm_dot:"dot",pm_square:"square",pm_diamond:"diamond",pm_plus:"plus",pm_wave:"wave",pm_diag:"diag",pm_grid:"grid",pm_leaf:"leaf",pm_arc:"arc",pm_custom:"custom"};
function patKind(s){const id=s.patMotif[0];return MOTIF_KIND[id]||"dot"}
const STROKE_KINDS=["wave","diag","grid","arc"];
function motifShape(kind,m,sw,filled,c){const h=m/2;const F=filled&&!STROKE_KINDS.includes(kind);const a=F?`fill="${c}"`:`fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
  switch(kind){case"dot":return `<circle r="${h}" ${a}/>`;case"square":return `<rect x="${-h}" y="${-h}" width="${m}" height="${m}" ${a}/>`;case"diamond":return `<rect x="${-h*.75}" y="${-h*.75}" width="${m*.75}" height="${m*.75}" transform="rotate(45)" ${a}/>`;
  case"plus":return F?`<path d="M${-m*.15} ${-h}h${m*.3}v${h-m*.15}h${h-m*.15}v${m*.3}h${-(h-m*.15)}v${h-m*.15}h${-m*.3}v${-(h-m*.15)}h${-(h-m*.15)}v${-m*.3}h${h-m*.15}z" fill="${c}"/>`:`<path d="M0 ${-h}V${h}M${-h} 0H${h}" ${a}/>`;
  case"wave":return `<path d="M${-h} 0Q${-h/2} ${-h/2} 0 0T${h} 0" ${a}/>`;case"diag":return `<path d="M${-h} ${h}L${h} ${-h}" ${a}/>`;case"grid":return `<path d="M${-h} 0H${h}M0 ${-h}V${h}" ${a}/>`;
  case"leaf":return `<path d="M0 ${-h}C${h} ${-h/2} ${h} ${h/2} 0 ${h}C${-h} ${h/2} ${-h} ${-h/2} 0 ${-h}Z" ${F?`fill="${c}"`:a}/>`;case"arc":return `<path d="M${-h} ${h/2}A${h} ${h} 0 0 1 ${h} ${h/2}" ${a}/>`;
  default:return `<rect x="${-h}" y="${-h}" width="${m}" height="${m}" rx="${m*.2}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-dasharray="${sw*2} ${sw*2}"/>`}}
function patLayout(rep,S){const r=S;switch(rep){
  case"rp_half":return {w:2*S,h:S,it:[{x:S/2,y:S/2},{x:1.5*S,y:0},{x:1.5*S,y:S}]};
  case"rp_brick":return {w:S,h:2*S,it:[{x:S/2,y:S/2},{x:0,y:1.5*S},{x:S,y:1.5*S}]};
  case"rp_mirror":return {w:2*S,h:2*S,it:[{x:S/2,y:S/2,fx:1,fy:1},{x:1.5*S,y:S/2,fx:-1,fy:1},{x:S/2,y:1.5*S,fx:1,fy:-1},{x:1.5*S,y:1.5*S,fx:-1,fy:-1}]};
  case"rp_tossed":{let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};const it=[];for(let i=0;i<6;i++)it.push({x:rnd()*3*S,y:rnd()*3*S,r:rnd()*360});return {w:3*S,h:3*S,it}}
  default:return {w:S,h:S,it:[{x:S/2,y:S/2}]}}}
function patGroup(s){const p=patParams(s),kind=patKind(s),rep=s.repeat[0]||"rp_block",L=patLayout(rep,p.size),m=p.size*p.motif/100,filled=(picked(s,"patFill")||{id:"pf_fill"}).id==="pf_fill";let g="";
  L.it.forEach(i=>{for(const dx of[-L.w,0,L.w])for(const dy of[-L.h,0,L.h]){const x=i.x+dx,y=i.y+dy;if(x<-m||x>L.w+m||y<-m||y>L.h+m)continue;
    g+=`<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${((i.r||0)+p.rot).toFixed(1)}) scale(${i.fx||1} ${i.fy||1})">${motifShape(kind,m,p.stroke,filled,p.c1)}</g>`}});
  return {g,L,p,m}}
function tileSVG(s){const {g,L,p}=patGroup(s);return `<svg xmlns="http://www.w3.org/2000/svg" width="${L.w}" height="${L.h}" viewBox="0 0 ${L.w} ${L.h}"><rect width="${L.w}" height="${L.h}" fill="${p.bg}"/>${g}</svg>`}
function patternPreviewSVG(s,w=360,h=180,id="pp"){const {g,L,p}=patGroup(s);const band=(s.repeat[0]==="rp_border");return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice"><defs><pattern id="${id}" width="${L.w}" height="${L.h}" patternUnits="userSpaceOnUse"><rect width="${L.w}" height="${L.h}" fill="${p.bg}"/>${g}</pattern></defs><rect width="${w}" height="${h}" fill="${band?p.bg:"url(#"+id+")"}"/>${band?`<rect y="${h/2-L.h/2}" width="${w}" height="${L.h}" fill="url(#${id})"/>`:""}</svg>`}
const svgURI=svg=>"data:image/svg+xml,"+encodeURIComponent(svg).replace(/'/g,"%27").replace(/"/g,"%22");

// ---------- 配色變體 ----------
function suggestCW(id,s){const p=palette(s);const ink=p.c_ink||"#111111",paper=p.c_paper||"#FFFFFF",pri=p.c_primary||ink,acc=p.c_accent||pri;
  switch(id){case"cw_default":return {bg:paper,fg:ink,ac:pri};case"cw_reverse":return {bg:lum(pri)<.18?pri:ink,fg:paper,ac:adjustL(acc,.08)};case"cw_black":return {bg:"#FFFFFF",fg:"#000000",ac:"#000000"};case"cw_white":return {bg:ink,fg:"#FFFFFF",ac:"#FFFFFF"};
  case"cw_gray":return {bg:grayOf(paper),fg:grayOf(ink),ac:grayOf(pri)};case"cw_hc":return {bg:"#FFFFFF",fg:"#000000",ac:pri};case"cw_photo":return {bg:"#808080",fg:"#FFFFFF",ac:"#FFFFFF"};
  case"cw_dark":return {bg:lum(ink)<.1?ink:"#0F1115",fg:paper,ac:adjustL(acc,.15)};default:return {bg:paper,fg:ink,ac:acc}}}
function cwGet(s,id){const base=suggestCW(id,s),o=s.cw[id]||{};return {bg:hex(o.bg)||base.bg,fg:hex(o.fg)||base.fg,ac:hex(o.ac)||base.ac,custom:!!(o.bg||o.fg||o.ac)}}
function cwRows(s){return s.colorways.map(id=>{const c=cwGet(s,id);return {id,name:anyName(id),...c,textRatio:ratio(c.fg,c.bg),accRatio:ratio(c.ac,c.bg)}})}
function colorOutRows(s){const p=palette(s),f=cl(parseFloat(T_(s,"pf"))||1.1,1,1.4);return COLS.filter(([id])=>p[id]).map(([id,l])=>{const h=p[id],H=hsl(h),o=toOklch(h),cm=cmykNaive(h),pv=p3Values(h,f);return {id,label:l,hex:h,hsl:`hsl(${Math.round(H.h)} ${Math.round(H.s)}% ${Math.round(H.l)}%)`,hslv:H,oklch:`oklch(${(o.L*100).toFixed(1)}% ${o.C.toFixed(3)} ${Math.round(o.H)})`,p3:p3CSS(p3Values(h,1)),p3e:p3CSS(pv),cmyk:cm,proof:s.cm[id]||{}}})}

// ---------- 工藝 ----------
const procs=s=>s.processes.map(id=>byId("processes",id)).filter(Boolean);
const subs=s=>s.substrates.map(id=>byId("substrates",id)).filter(Boolean);
const COST=["—","低","中低","中高","高"];

// ---------- 標籤與一致性檢查 ----------
function selTags(s){const out={};CAT_KEYS.filter(k=>!["repeat","avoidSurface","colorways","colorOut"].includes(k)).forEach(k=>items(k,s).forEach(i=>(i.t||[]).forEach(t=>{(out[t]=out[t]||[]).push(i.zh)})));DIMS.forEach(d=>{const o=picked(s,d.id);if(o)(o.t||[]).forEach(t=>{(out[t]=out[t]||[]).push(o.zh)})});return out}
const ANTI_TAG={"冰冷醫院感":["clinical","cold"],"廉價促銷感":["loud","cheap"],"過度科技炫技":["neon","loud","halo"],"炫富浮誇":["flashy","loud"],"陰暗沉重":["dark"],"廉價模板感":["cheap","halo"],"純科技冷硬品牌":["cold","hard"],"老派藥房感":["dated"],"過度幼稚":["playful"],"網紅爆款保健品":["loud"],"推銷式連鎖美容院":["loud"]};
const AVOIDMAT=[["過度金屬金",["gt_metal","pr_foil","pr_metallic"],"warn"],["過度反光鏡面",["gt_metal","pr_holo","pr_lam_gloss"],"warn"],["亮粉閃片",["pr_holo"],"warn"],["霓虹螢光",["pr_fluor"],"warn"],["廉價塑膠感",["pr_lam_gloss"],"info"],["亮面貼紙感",["pr_lam_gloss","pr_holo"],"warn"],["醫院式冷不鏽鋼",["sb_metal","xt_brushed"],"warn"],["廉價瓦楞紙箱感",["sb_kraft"],"info"],["刻意做舊髒污",["xt_grain","xt_stone"],"info"],["果凍泡泡感",["gt_conic"],"info"]];
const A4AVOID=[["滿版金色",["gt_metal","pr_metallic"]],["螢光",["pr_fluor"]],["亮面",["pr_lam_gloss","pr_holo"]],["科技漸變",["gt_mesh","gt_radial"]],["光暈",["gt_mesh","gt_radial"]]];
const PAIRS=[["gt_none","gt_linear","error","「不使用漸變」與其他漸變類型同時選了，請擇一。"],["gt_none","gt_radial","error","「不使用漸變」與其他漸變類型同時選了。"],["gt_none","gt_conic","error","「不使用漸變」與其他漸變類型同時選了。"],["gt_none","gt_mesh","error","「不使用漸變」與其他漸變類型同時選了。"],["gt_none","gt_metal","error","「不使用漸變」與其他漸變類型同時選了。"],["gt_none","gt_map","error","「不使用漸變」與其他漸變類型同時選了。"],
["xt_none","xt_paper","error","「不使用紋理」與其他紋理同時選了。"],["xt_none","xt_grain","error","「不使用紋理」與其他紋理同時選了。"],["xt_none","xt_noise","error","「不使用紋理」與其他紋理同時選了。"],["xt_none","xt_frost","error","「不使用紋理」與其他紋理同時選了。"],
["co_none","co_cmyk","error","「不涉及印刷」與 CMYK 印刷互相矛盾。"],["co_none","co_spot","error","「不涉及印刷」與專色互相矛盾。"],["co_none","co_mono","error","「不涉及印刷」與單色印刷互相矛盾。"],
["pr_lam_matte","pr_lam_gloss","error","啞膜與光膜是相反的淋膜，不能同一面同時使用（若是不同位置請說明）。"],["ft_alpha","bs_none","info","半透明填色搭無邊框，邊界容易消失，請實測。"],["bs_hair","bs_bold","warn","細線與粗線同時選了，請在『邊框粗細』定義分級規則。"],["sk_poly","sk_pill","info","徽章多邊與膠囊形差異大，請定義各自用途。"],["gt_metal","pr_foil","info","螢幕金屬漸變不是燙金：燙金須向量、單色、不可漸變，請另做實物版本。"]];
function checks(s){
  const out=[],A=(l,m)=>out.push({level:l,msg:m});const tags=selTags(s),T=t=>tags[t]||[],J2=a=>[...new Set(a)].join("、");const P=procs(s),SB=subs(s),p=palette(s);
  CAT_KEYS.forEach(k=>{if(CAT[k].max<90&&count(k,s)>CAT[k].max)A("warn",`「${CAT[k].title.replace(/（.*/,"")}」選了 ${count(k,s)} 個，超過建議的 ${CAT[k].max} 個。`)});
  PAIRS.forEach(([a,b,l,m])=>{if(has(s,a)&&has(s,b))A(l,`「${anyName(a)}」＋「${anyName(b)}」：${m}`)});
  items("avoidSurface",s).forEach(av=>{(av.conf||[]).forEach(c=>{if(has(s,c))A("error",`表面禁區「${av.zh}」與你選的「${anyName(c)}」互相矛盾。`)})});
  if(count("avoidSurface",s)>0&&count("avoidSurface",s)<3)A("info","表面禁區建議至少 3 個。");
  // 色值
  COLS.forEach(([id,l])=>{if(T_(s,id)&&!p[id])A("warn",`「${l}」不是有效的 HEX 色值。`)});
  // 漸變
  const hasGrad=s.gradType.some(x=>x!=="gt_none"),st=gradStops(s),tx=hex(s.text.g_txt);
  ["g_a","g_b","g_c","g_txt"].forEach(id=>{if(T_(s,id)&&!hex(s.text[id]))A("warn",`漸變欄位 ${id} 不是有效的 HEX 色值。`)});
  if(hasGrad&&!st)A("info","選了漸變，但還沒填漸變的起點與終點色值，無法取樣檢查。");
  if(hasGrad&&!picked(s,"gradFallback"))A("warn","選了漸變，但還沒決定備援（純色備援／印刷版本）。標誌、印刷與刺繡都不能依賴漸變。");
  if(has(s,"gu_logo")&&picked(s,"gradFallback")&&picked(s,"gradFallback").id==="gf_none")A("warn","漸變用在標誌，但備援選了『不需要』。標誌必須有單色與反白版本。");
  if(has(s,"gu_logo")&&!has(s,"cw_black")&&!has(s,"cw_white"))A("warn","漸變用在標誌，但配色變體沒有單色黑／單色白。");
  if(st&&tx){const sm=gradSamples(s),mn=sm.reduce((a,x)=>x.ratio<a.ratio?x:a,sm[0]);if(mn.ratio<4.5)A(mn.ratio<3?"error":"warn",`文字色 ${tx} 壓在漸變上，最差位置約在 ${mn.t}%（${mn.color}），對比約 ${fr(mn.ratio)}:1，一般文字需 4.5:1（大字 3:1）。可縮小漸變幅度、加遮罩或把文字移到合格區域。`)}
  if(st&&st.length===2&&hasGrad&&ratio(st[0].hex,st[1].hex)<1.15&&!has(s,"xt_noise"))A("info","兩個色標很接近，8-bit 顯示大面積時容易出現色帶；可加極淡噪點或加大色差。");
  if(has(s,"gu_text")&&st&&tx===null)A("info","漸變文字填色須逐點檢查對比，且只限大字。");
  if(has(s,"gu_chart"))A("info","資料圖表使用漸變時，不可只靠顏色表意，須有數值標示並考慮色盲（見配色變體的色盲檢查）。");
  // 填色
  const fo=picked(s,"fillOpacity");if(has(s,"ft_alpha")&&fo&&fo.id==="fo_opaque")A("warn","填色類型選了半透明，但透明度規則是『以不透明為主』。");
  if(has(s,"ft_grad")&&!hasGrad)A("error","填色類型選了漸變填色，但漸變類型是空的或『不使用漸變』。");
  if(has(s,"ft_pattern")&&!s.patMotif.length)A("info","填色類型選了圖案填色，但還沒選 Pattern 母題。");
  const fs=picked(s,"fillStates");if(fs&&(fs.id==="fs_light"||fs.id==="fs_dark")&&!picked(s,"focusRing"))A("info","互動狀態不可只靠顏色表達；請同時定義焦點外框。");
  // 邊框與焦點
  const bc=picked(s,"borderColor");if(bc&&bc.id==="bc_neutral"&&p.c_secondary&&p.c_paper&&ratio(p.c_secondary,p.c_paper)<3)A("warn",`中性邊框色（輔色 ${p.c_secondary}）與背景對比約 ${fr(ratio(p.c_secondary,p.c_paper))}:1，低於非文字元件邊界所需的 3:1；若這是裝飾分隔線可忽略，但輸入框與按鈕邊界不行。`);
  const fring=picked(s,"focusRing");if(fring&&p.c_accent&&p.c_paper&&ratio(p.c_accent,p.c_paper)<3)A("warn",`焦點外框若使用點綴色 ${p.c_accent}，與背景對比約 ${fr(ratio(p.c_accent,p.c_paper))}:1，低於 3:1；請改用更深的顏色或雙環。`);
  if(!fring&&(count("borderStyle",s)>0))A("info","已選邊框，但還沒定義鍵盤焦點外框。");
  const bw=parseFloat(T_(s,"bd_mm"));
  if(bw>0)P.filter(x=>x.minLine>0&&bw<x.minLine).forEach(x=>A("warn",`印刷邊框線寬 ${bw}mm 低於「${x.zh}」的常見保守最小線寬 ${x.minLine}mm（各廠不同，須確認）。`));
  // 4A 交叉
  const a=s.s4a;
  if(a){const bwd=picked(s,"borderWidth"),lw=a.tokens["--line-width"];if(bwd&&lw&&bwd.tok["--border-width"]&&/px$/.test(lw)&&bwd.tok["--border-width"]!=="mixed"&&parseFloat(lw)!==parseFloat(bwd.tok["--border-width"]))A("info",`4A 的線條粗細是 ${lw}，但 4B 邊框粗細是 ${bwd.tok["--border-width"]}，請確認是否有意不同。`);
    const rs=picked(s,"radiusScale");const soft=a.shape.filter(x=>/大圓角|膠囊|有機/.test(x)),hard=a.shape.filter(x=>/直角|斜角/.test(x));
    if(rs&&rs.id==="rs_none"&&soft.length)A("warn",`4A 的形狀是「${soft.join("、")}」，但 4B 圓角比例尺是『直角（0）』。`);
    if(rs&&(rs.id==="rs_large"||rs.id==="rs_pill")&&hard.length)A("warn",`4A 的形狀是「${hard.join("、")}」，但 4B 圓角比例尺偏圓。`);
    if(a.pattern.some(x=>/不使用圖案/.test(x))&&s.patMotif.length)A("warn","4A 決定不使用圖案，但 4B 選了 Pattern 母題。");
    if(a.patternUse&&/不使用/.test(a.patternUse)&&s.patMotif.length)A("warn","4A 的圖案使用範圍是『不使用』，但 4B 選了 Pattern 母題。");
    if(a.texture.some(x=>/不使用紋理/.test(x))&&s.texSpec.some(x=>x!=="xt_none"))A("warn","4A 決定不使用紋理，但 4B 選了紋理。");
    if(a.pattern.length&&!a.pattern.some(x=>/不使用/.test(x))&&!s.patMotif.length)A("info","4A 選了圖案風格，但 4B 還沒定義母題。");
    a.avoid.forEach(v=>A4AVOID.forEach(([k,ids])=>{if(v.includes(k)){ids.filter(i=>has(s,i)).forEach(i=>A("warn",`4A 視覺禁區有「${v}」，但 4B 選了「${anyName(i)}」。`))}}));
    if(a.colorStyle.some(x=>/霓虹|高飽和/.test(x))&&has(s,"gt_mesh"))A("info","4A 色彩偏高飽和，網格漸變會更刺眼，請實測。")}
  // Stage 1
  const q=s.s1;
  if(q){q.anti.forEach(x=>{const hit=J2((ANTI_TAG[x]||[]).flatMap(t=>T(t)));if(hit)A("warn",`Stage 1 要避免「${x}」，但你選的 ${hit} 容易帶來這種感覺。`)});
    q.dials.forEach(d=>{if(d.id==="quiet_bold"&&d.position<=-1&&(T("loud").length||T("bold").length||T("neon").length))A("warn",`Stage 1 傾向「低調克制」，但 ${J2([...T("loud"),...T("bold"),...T("neon")])} 偏張揚。`);if(d.id==="premium_access"&&d.position<=-1&&T("cheap").length)A("warn",`Stage 1 傾向「高端稀有」，但 ${J2(T("cheap"))} 容易顯廉價。`);if(d.id==="calm_energy"&&d.position<=-1&&T("energetic").length)A("warn",`Stage 1 傾向「療癒安靜」，但 ${J2(T("energetic"))} 偏有活力。`)})}
  else A("info","尚未匯入 Stage 1，無法做定位交叉檢查。");
  // Stage 2
  const m=s.s2;
  if(m){m.avoid.forEach(av=>AVOIDMAT.forEach(([nm,ids,lv])=>{if(norm(av).includes(norm(nm)))ids.filter(i=>has(s,i)).forEach(i=>A(lv,`Stage 2 物理禁區有「${av}」，但你選了「${anyName(i)}」。`))}));
    m.anti.forEach(k=>{if(/浮誇|俗豔|刺眼|吵鬧/.test(k)){const hit=J2([...T("loud"),...T("flashy"),...T("neon")]);if(hit)A("warn",`Stage 2 的反關鍵字「${k}」，但 ${hit} 容易帶來這種感覺。`)}if(/廉價/.test(k)&&T("cheap").length)A("warn",`Stage 2 的反關鍵字「${k}」，但 ${J2(T("cheap"))} 容易顯廉價。`);if(/冰冷|無菌/.test(k)&&(T("cold").length||T("clinical").length))A("warn",`Stage 2 的反關鍵字「${k}」，但 ${J2([...T("cold"),...T("clinical")])} 偏冰冷。`)});
    const r=m.rules,rr=r.radius||"",rs=picked(s,"radiusScale");
    if(/直角/.test(rr)&&rs&&["rs_medium","rs_large","rs_pill"].includes(rs.id))A("warn",`Stage 2 圓角規則是「${rr}」，但 4B 圓角比例尺是「${rs.zh}」。`);
    if(/大圓|全圓/.test(rr)&&rs&&["rs_none","rs_small"].includes(rs.id))A("warn",`Stage 2 圓角規則是「${rr}」，但 4B 圓角比例尺是「${rs.zh}」。`);
    const el=picked(s,"elevation");if(/無陰影/.test(r.elevation||"")&&el&&el.id!=="el_none")A("warn",`Stage 2 陰影規則是「${r.elevation}」，但 4B 選了「${el.zh}」。`);if(/硬陰影/.test(r.elevation||"")&&el&&["el_ambient","el_layered"].includes(el.id))A("info",`Stage 2 陰影規則是「${r.elevation}」，但 4B 選了「${el.zh}」。`);
    if(/完全不透明/.test(r.transparency||"")&&(has(s,"ft_alpha")||has(s,"xt_frost")))A("warn",`Stage 2 透明規則是「${r.transparency}」，但 4B 選了半透明或磨砂模糊。`);
    const bd=r.border||"",bwd=picked(s,"borderWidth");if(/無邊框/.test(bd)&&count("borderStyle",s)>0&&!has(s,"bs_none"))A("warn",`Stage 2 邊框規則是「${bd}」，但 4B 選了邊框風格。`);if(/細線/.test(bd)&&bwd&&["bw_bold"].includes(bwd.id))A("warn",`Stage 2 邊框規則是「${bd}」，但 4B 邊框粗細是粗線。`);
    if(/畫廊/.test(r.density||"")&&picked(s,"patDensity")&&picked(s,"patDensity").id==="pd_dense")A("warn","Stage 2 版面密度是『畫廊級留白』，但圖案密度選了『密』。")}
  else A("info","尚未匯入 Stage 2，無法做感官交叉檢查。");
  // 紋理
  if(has(s,"xt_frost")&&picked(s,"fillOpacity")&&picked(s,"fillOpacity").id==="fo_opaque")A("info","選了磨砂模糊，但填色透明度規則是不透明為主，兩者通常搭配使用。");
  if(s.texSpec.some(x=>x!=="xt_none")&&!picked(s,"texBlend"))A("info","選了紋理，但還沒決定混合模式與強度。");
  if(s.texSpec.some(x=>x!=="xt_none")&&!picked(s,"texBudget"))A("info","選了紋理，但還沒決定檔案與效能預算。");
  if(has(s,"co_mono")&&s.texSpec.some(x=>["xt_grain","xt_water","xt_paper","xt_noise"].includes(x)))A("warn","單色／雙色印刷無法重現柔和紋理與色彩暈染，需轉成網點或改用實物材質（如紙張本身）。");
  // 圖案
  const pp=patParams(s);
  if(s.patMotif.length){if(!picked(s,"patDensity")||!picked(s,"patContrast"))A("info","選了母題，但還沒決定圖案密度與對比。");
    ["pt_c1","pt_c2"].forEach(id=>{if(T_(s,id)&&!hex(s.text[id]))A("warn",`圖案欄位 ${id} 不是有效的 HEX 色值。`)});
    const mm=pp.size*pp.motif/100;if(mm+pp.stroke>pp.size*.95)A("info","母題大小接近或超過單元，相鄰母題會互相重疊；預覽用 9 格環繞繪製接縫，但實際製作須確認重疊處理。");
    const pc=picked(s,"patContrast"),rt=ratio(pp.c1,pp.bg);if(pc&&pc.id==="pc_low"&&rt>1.6)A("warn",`圖案對比選了『低對比』，但母題色與底色對比約 ${fr(rt)}:1，偏高；壓在文字後可能干擾閱讀。`);if(pc&&pc.id==="pc_high"&&rt<2)A("info",`圖案對比選了『高對比』，但母題色與底色對比只有約 ${fr(rt)}:1。`);
    const pd=picked(s,"patDensity");if(pd&&pd.id==="pd_dense"&&pc&&pc.id==="pc_high")A("warn","高密度加高對比的圖案會造成視覺疲勞與摩爾紋風險，不可壓文字。");
    if(["pm_diag","pm_grid"].some(i=>has(s,i))&&pc&&pc.id!=="pc_low")A("info","斜線與格網容易造成視覺震動，建議低對比或限制範圍。");
    if(has(s,"pm_plus"))A("info","十字母題容易讓人聯想到醫療標誌，請確認業務是否適合。");
    if(has(s,"pm_custom"))A("info","自訂母題須提供向量檔；若母題是字體或字母，字體授權須涵蓋圖案用途。");
    if(has(s,"pm_arc")||s.patMotif.includes("pm_leaf"))A("info","若母題源自傳統或文化紋樣，請確認來源與含義（4A 已有『隨意挪用』的風險提示）。");
    const strokeMotif=STROKE_KINDS.includes(patKind(s))||(picked(s,"patFill")&&picked(s,"patFill").id==="pf_stroke");
    if(pp.mm>0&&strokeMotif){const smm=pp.stroke/pp.size*pp.mm;P.filter(x=>x.minLine>0&&smm<x.minLine).forEach(x=>A("warn",`圖案線寬換算成印刷約 ${smm.toFixed(2)}mm，低於「${x.zh}」的常見保守最小線寬 ${x.minLine}mm。`));if(smm<.09)A("warn",`圖案線寬換算成印刷約 ${smm.toFixed(2)}mm，低於一般正向線約 0.25pt（約 0.09mm）的常見指引，印刷可能消失。`)}
    if(pp.mm>0&&pp.mm*pp.motif/100<1.5&&P.some(x=>["pr_emboss","pr_foil","pr_spotuv"].includes(x.id)))A("warn","母題換算成印刷後非常小，壓凸／燙箔／局部上光不能重現這種細節。");
    if(!s.repeat.length)A("info","選了母題，但還沒選重複方式。");
    if(pp.mm===0&&P.length)A("info","已選印刷工藝，但沒有填『印刷時單元實際大小（mm）』，無法換算線寬與最小尺寸。")}
  // 配色變體
  const cws=cwRows(s);
  if(s.colorways.length&&s.colorways.length<3)A("info","配色變體建議至少包含：預設彩色、深底反白、單色黑（或單色白）。");
  if(!s.colorways.length&&(has(s,"gu_logo")||P.length))A("info","還沒定義配色變體。有印刷或標誌用途時，至少需要預設與單色版本。");
  cws.forEach(c=>{if(c.textRatio<4.5)A(c.id==="cw_photo"?"info":"warn",`配色變體「${c.name}」：前景／背景對比約 ${fr(c.textRatio)}:1，需要 4.5:1。${c.id==="cw_photo"?"照片上的文字須加遮罩或固定在合格區域（這裡用中灰 #808080 當最差情況）。":""}`);else if(c.accRatio<3)A("warn",`配色變體「${c.name}」：強調色／背景對比約 ${fr(c.accRatio)}:1，低於非文字元件需要的 3:1。`)});
  if(p.c_primary&&p.c_accent){const g1=lum(p.c_primary),g2=lum(p.c_accent);const gr=(Math.max(g1,g2)+.05)/(Math.min(g1,g2)+.05);if(gr<1.3)A("info",`主色與點綴色在灰階下亮度比只有約 ${fr(gr)}:1，黑白列印時難以分辨。`);
    Object.entries(CVD).forEach(([n,M])=>{const d=dE(simCVD(p.c_primary,M),simCVD(p.c_accent,M));if(d<10)A("warn",`模擬${n}：主色與點綴色的色差（ΔE76）只有約 ${d.toFixed(1)}，可能難以分辨；不要只靠這兩色區分資訊。（近似模擬，非醫學結論）`)})}
  // 色彩輸出
  const cp=picked(s,"cmykPolicy"),p3=picked(s,"p3Policy"),tac=picked(s,"tacLimit");
  if(has(s,"co_p3")&&!p3)A("info","選了 Display P3 增強，但還沒決定 P3 策略。");
  if(p3&&p3.id!=="p3_none"&&!has(s,"co_p3"))A("info","P3 策略不是『只用 sRGB』，但色彩輸出沒有選 Display P3。");
  if(p3&&p3.id==="p3_native")A("warn","以 P3 為母版風險最高：必須提供 sRGB 備援，且品牌色在 sRGB 下不可變樣。");
  if((has(s,"co_p3")||(p3&&p3.id!=="p3_none"))&&!has(s,"co_srgb"))A("warn","P3 增強需要 sRGB 作為基準與備援，請同時選 sRGB。");
  if(has(s,"co_cmyk")){if(!cp)A("info","選了 CMYK 印刷，但還沒決定 CMYK 策略（ICC 轉換與打樣）。");if(cp&&cp.id==="cp_naive")A("warn","CMYK 目前只用自動近似值：只能作草稿，不可作官方印刷色，須由印刷廠 ICC 轉換並打樣。");if(!tac)A("info","選了 CMYK 印刷，但還沒確認總油墨量（TAC）上限。");if(!picked(s,"bleed"))A("info","選了 CMYK 印刷，但還沒決定出血。")}
  const rows=colorOutRows(s),lim=tac&&tac.tok["--tac"]&&tac.tok["--tac"]!=="?"?parseFloat(tac.tok["--tac"]):300;
  if(has(s,"co_cmyk")){rows.forEach(r=>{if(r.cmyk.tac>lim&&!r.proof.cmyk)A("warn",`${r.label} ${r.hex} 的自動近似 CMYK 總油墨量約 ${r.cmyk.tac}%，高於約 ${lim}% 的常見上限（近似值，實際由 ICC 決定）。`);const h=r.hslv;if(h.s>85&&h.l>30&&h.l<70&&!r.proof.cmyk)A("warn",`${r.label} ${r.hex} 飽和度很高（約 ${Math.round(h.s)}%），這類亮色（鮮綠、亮藍、橙紅）在 CMYK 常會變暗或變灰，需打樣或改用專色。（經驗判斷，非 ICC 結果）`);
    if(r.proof.st==="已打樣核准"&&!r.proof.cmyk&&!r.proof.pms)A("warn",`${r.label}：狀態是『已打樣核准』，但沒有填 CMYK 或 Pantone 值。`)});
    if(rows.length&&rows.every(r=>!r.proof.cmyk&&!r.proof.pms))A("info","尚未登錄任何印刷廠打樣後的 CMYK 或專色值；目前顯示的 CMYK 都是近似值。")}
  if(has(s,"co_spot")&&rows.every(r=>!r.proof.pms))A("info","選了專色，但還沒登錄 Pantone 或專色編號（請註明色票版本）。");
  // 工藝與承印物
  const ids=new Set(s.processes),sids=new Set(s.substrates);
  if(P.length>4)A("info","同時選了超過 4 種工藝，成本與風險會快速上升，請說明哪些是主要、哪些是可選。");
  const fallback=picked(s,"gradFallback");
  P.filter(x=>x.grad===0).forEach(x=>{if(hasGrad)A(fallback&&fallback.id!=="gf_none"?"info":"warn",`「${x.zh}」不適合漸變（或半透明），所選漸變須另做單色／簡化版本。`)});
  if(P.some(x=>x.vec))A("info",`${P.filter(x=>x.vec).map(x=>x.zh).join("、")} 通常需要向量檔；標誌與圖案須有向量母檔。`);
  if(P.some(x=>x.shift))A("info",`${P.filter(x=>x.shift).map(x=>x.zh).join("、")}：螢幕無法準確呈現，色彩與效果以實物色樣與打樣為準。`);
  const cmykProc=ids.has("pr_offset")||ids.has("pr_digital");
  if(cmykProc&&sids.has("sb_dark"))A("warn","CMYK 墨水是透明的，在黑卡／深色卡紙上顏色會不可用；需要白墨、燙箔或絲印。");
  if(cmykProc&&sids.has("sb_pet"))A("warn","透明 PET 上的 CMYK 需要白墨墊底，否則顏色透明不實。");
  if(ids.has("pr_offset")&&["sb_fabric","sb_metal","sb_glass","sb_plastic"].some(i=>sids.has(i)))A("warn",`平版膠印通常不適用於 ${["sb_fabric","sb_metal","sb_glass","sb_plastic"].filter(i=>sids.has(i)).map(anyName).join("、")}，請考慮絲印、UV 噴印、熱轉印、刺繡或雷雕。`);
  if(ids.has("pr_foil")&&["sb_art","sb_fabric"].some(i=>sids.has(i)))A("info","厚重或大面積燙箔不建議用在有紋理的棉紙或布料；小面積重點較穩。");
  if(ids.has("pr_embroid")&&!sids.has("sb_fabric"))A("info","刺繡通常用在布料，但承印物沒有選布料。");
  if(ids.has("pr_spotuv")&&!ids.has("pr_lam_matte"))A("info","局部上光通常搭配啞膜才明顯，請確認。");
  if(sids.has("sb_uncoated")&&tac&&tac.id==="tac_300")A("info","非塗佈紙的總油墨上限通常低於塗佈紙，請重新確認 TAC 設定。");
  if(sids.has("sb_recycled")||sids.has("sb_kraft"))A("info","再生紙與牛皮紙的色彩偏暗，淺色與高彩度顏色會失真；『再生』也不可當作環保宣稱，除非有證據。");
  if(P.length&&!s.substrates.length)A("info","選了工藝，但還沒選承印物。");
  if((has(s,"co_cmyk")||has(s,"co_spot"))&&!P.length)A("info","色彩輸出包含印刷，但還沒選印刷工藝。");
  if(P.length&&picked(s,"bleed")&&["bl_pending"].includes(picked(s,"bleed").id))A("info","出血尚待印刷廠確認；各廠要求不同（公開指引常見 3–5mm）。");
  const z=s.s0;
  if(z){const mx=Math.max(0,...P.map(x=>x.cost),...SB.map(x=>x.cost));if(/1 萬以下/.test(z.budget)&&mx>=3)A("warn",`Stage 0 品牌預算低於 1 萬港元，但選了成本等級偏高的項目（${[...P,...SB].filter(x=>x.cost>=3).map(x=>x.zh).join("、")}）。`);
    if(/平價/.test(z.priceTier)&&mx>=4)A("warn",`Stage 0 價格定位是『平價』，但選了成本等級最高的工藝（${P.filter(x=>x.cost>=4).map(x=>x.zh).join("、")}）。`);
    if(z.delivery.some(x=>/郵寄|速遞/.test(x))&&!s.substrates.length)A("info","Stage 0 有郵寄或速遞：包裝是品牌的一部分，建議在此定義承印物。")}
  if(P.some(x=>x.cost>=4)&&P.some(x=>x.cost>=3&&x.id!==P.find(y=>y.cost>=4).id))A("info","多項高成本工藝疊加，請先做小量樣品確認成本與可行性。");
  return out}

// ---------- 輸出 ----------
function draft(s){const L=(k,n)=>labels(k,s).slice(0,n).join("、")||"［尚未選擇］";const P=d=>{const o=picked(s,d);return o?o.zh:"［未定］"};
  return `${brandName(s)} 的圖形與表面系統：漸變「${L("gradType",2)}」，填色「${L("fillType",2)}」，邊框「${L("borderStyle",2)}」，圓角「${P("radiusScale")}」，紋理「${L("texSpec",2)}」，圖案母題「${L("patMotif",2)}」（${L("repeat",1)}），輸出「${L("colorOut",3)}」，工藝「${L("processes",3)}」。${count("avoidSurface",s)?"禁區："+labels("avoidSurface",s).slice(0,4).join("、")+"。":""}`}
function negatives(s){const n=[...labels("avoidSurface",s)];if(s.s4a)n.push(...s.s4a.avoid);if(s.s1)n.push(...s.s1.anti);if(s.s2)n.push(...s.s2.anti,...s.s2.avoid);return [...new Set(n)]}
function buildTokens(s){const t={},p=palette(s);[["c_primary","--brand-primary"],["c_secondary","--brand-secondary"],["c_accent","--brand-accent"],["c_ink","--brand-ink"],["c_paper","--brand-paper"]].forEach(([k,v])=>{if(p[k])t[v]=p[k]});
  ["radiusScale","elevation","borderWidth","focusRing","texBlend","tacLimit","bleed"].forEach(d=>{const o=picked(s,d);if(o)Object.assign(t,o.tok)});
  const g=gradCSS(s);if(g)t["--gradient-brand"]=g;if(p.c_primary)ramp(p.c_primary).forEach(r=>t["--brand-"+r.n]=r.hex);Object.keys(t).forEach(k=>{if(t[k]==="?")delete t[k]});return t}
function tokensCSS(s){const t=buildTokens(s);let css=":root{\n"+Object.entries(t).map(([k,v])=>`  ${k}:${v};`).join("\n")+"\n}\n";
  const p3=picked(s,"p3Policy");if(p3&&p3.id!=="p3_none"){const f=cl(parseFloat(T_(s,"pf"))||1.1,1,1.4),pal=palette(s);const body=COLS.filter(([id])=>pal[id]&&/primary|secondary|accent/.test(id)).map(([id])=>`    --brand-${id.slice(2)}:${p3CSS(p3Values(pal[id],p3.id==="p3_native"?1:f))};`).join("\n");css+=`/* Display P3 增強：僅在支援寬色域的螢幕使用；sRGB 值仍是品牌核准基準 */\n@media (color-gamut: p3){\n  :root{\n${body}\n  }\n}\n`}
  if(s.patMotif.length)css+=`/* 無縫圖案單元（SVG data URI；僅為示意，正式版請用向量母檔） */\n:root{--pattern-tile:url("${svgURI(tileSVG(s))}")}\n`;
  s.colorways.forEach(id=>{const c=cwGet(s,id);css+=`.${id.replace("_","-")}{--cw-bg:${c.bg};--cw-fg:${c.fg};--cw-accent:${c.ac}}\n`});
  if(picked(s,"focusRing"))css+=`:focus-visible{outline:var(--focus-width,2px) solid var(--brand-accent,currentColor);outline-offset:var(--focus-offset,2px)}\n`;return css}
function printSpec(s){const P=procs(s),SB=subs(s),tac=picked(s,"tacLimit"),bl=picked(s,"bleed"),cp=picked(s,"cmykPolicy"),pp=patParams(s);
  return {schema:"headx.print-spec/v1",status:"draft-needs-printer-confirmation",warning:"所有數值為公開指引中的常見保守值或定性等級，不是規格；印刷色、最小線寬、出血、TAC 須由印刷廠確認並以打樣為準。",
   brand:brandName(s),bleed:bl?bl.zh:null,tac_limit:tac?tac.zh:null,cmyk_policy:cp?cp.zh:null,
   colors:colorOutRows(s).map(r=>({role:r.label,hex:r.hex,cmyk_naive_approx:r.cmyk,cmyk_proofed:r.proof.cmyk||null,pantone:r.proof.pms||null,status:r.proof.st||"未打樣"})),
   colorways:cwRows(s).map(c=>({id:c.id,name:c.name,background:c.bg,foreground:c.fg,accent:c.ac,text_contrast:Math.floor(c.textRatio*100)/100,accent_contrast:Math.floor(c.accRatio*100)/100})),
   substrates:SB.map(x=>({id:x.id,name:x.zh,cost_level:COST[x.cost]||"—"})),
   processes:P.map(x=>({id:x.id,name:x.zh,cost_level:COST[x.cost]||"—",min_line_mm:x.minLine||null,min_type_pt:x.minType||null,gradient_supported:x.grad,vector_required:x.vec,screen_inaccurate:x.shift,note:x.note||null})),
   pattern:s.patMotif.length?{motif:labels("patMotif",s),repeat:labels("repeat",s),tile_px:pp.size,tile_mm:pp.mm||null,stroke_px:pp.stroke,stroke_mm:pp.mm?Math.round(pp.stroke/pp.size*pp.mm*1000)/1000:null}:null,
   notes:T_(s,"st_note")||null,approval:{state:"draft",approved_by:null}}}
function imagePrompts(s){const nm=brandName(s),neg=negatives(s).join(", ")||"none specified",p=palette(s),pal=COLS.map(([id,l])=>`${l} ${p[id]||"unspecified"}`).join(", ");const L=k=>labels(k,s).join(", ")||"unspecified";
  const base=`Brand "${nm}". Palette: ${pal}. Gradient: ${L("gradType")}${gradCSS(s)?" ("+gradCSS(s)+")":""}. Shapes: ${L("shapeKit")}. Texture: ${L("texSpec")}. Pattern: ${L("patMotif")} (${L("repeat")}). Processes: ${L("processes")}. Substrates: ${L("substrates")}.`;
  const mk=(id,scene)=>({id,prompt:`${scene}\n${base}\nFollow the specification exactly; do not invent extra styles.\nNegative constraints (must NOT appear): ${neg}. No gibberish text, no watermarks.\nNote: this is a concept visual, not an approved or proofed brand asset. Screen rendering cannot show true spot, metallic, fluorescent, foil or emboss effects.`});
  return [mk("無縫圖案","Create a seamless tileable pattern swatch (flat, top-down, no perspective) using the motif and repeat style above."),mk("紋理與表面","Create a close-up material swatch showing the texture and surface finish (e.g. paper, matte lamination, foil, emboss) as a neutral studio photo."),mk("漸變背景","Create a gradient background plate with clear space for text; keep the gradient within the stated colours."),mk("包裝與工藝","Create a packaging mockup (box front and side) showing logo, pattern, colour blocking and the selected print finishes."),mk("配色變體","Create a colourway sheet showing the logo and a headline in default, reversed, black, white and grayscale versions.")]}
function buildGuide(s){const L=k=>labels(k,s),P=d=>{const o=picked(s,d);return o?`${o.zh}（${o.desc}）`:"（未定義）"};const md=[],H=t=>md.push("\n## "+t+"\n");
  md.push(`# ${brandName(s)} · 圖形與表面系統指南（surface-guide）`);md.push(`\n> ${T_(s,"statement")||draft(s)}\n`);md.push("> 草稿，不等於核准。印刷數值為常見保守值，須由印刷廠確認並以打樣為準；螢幕無法準確呈現專色、金屬、螢光、燙箔與壓凸。");
  H("1. 漸變");md.push(`類型：${L("gradType").join("、")||"（未選）"}\n\n用途：${L("gradUse").join("、")||"（未選）"}\n\n色數：${P("gradStops")}\n\n備援：${P("gradFallback")}\n\nCSS：\`${gradCSS(s)||"（尚未填色值）"}\``);
  H("2. 填色與邊框");md.push(`填色：${L("fillType").join("、")||"（未選）"}\n\n透明度：${P("fillOpacity")}\n\n狀態：${P("fillStates")}\n\n邊框：${L("borderStyle").join("、")||"（未選）"}\n\n粗細：${P("borderWidth")}\n\n顏色：${P("borderColor")}\n\n焦點：${P("focusRing")}`);
  H("3. 形狀與陰影");md.push(`形狀組件：${L("shapeKit").join("、")||"（未選）"}\n\n圓角：${P("radiusScale")}\n\n陰影：${P("elevation")}`);
  H("4. 紋理");md.push(`紋理：${L("texSpec").join("、")||"（未選）"}\n\n混合：${P("texBlend")}\n\n預算：${P("texBudget")}`);
  H("5. 無縫圖案");const pp=patParams(s);md.push(`母題：${L("patMotif").join("、")||"（未選）"}\n\n重複：${L("repeat").join("、")||"（未選）"}\n\n密度：${P("patDensity")}\n\n對比：${P("patContrast")}\n\n單元：${pp.size}px；母題 ${pp.motif}%；線寬 ${pp.stroke}px；旋轉 ${pp.rot}°${pp.mm?`；印刷單元 ${pp.mm}mm`:""}`);
  H("6. 配色變體");const cw=cwRows(s);md.push(cw.length?"| 變體 | 背景 | 前景 | 強調 | 文字對比 | 強調對比 |\n|---|---|---|---|---|---|\n"+cw.map(c=>`| ${c.name} | ${c.bg} | ${c.fg} | ${c.ac} | ${fr(c.textRatio)}:1 | ${fr(c.accRatio)}:1 |`).join("\n"):"（未定義）");
  H("7. 色彩空間與輸出");const rows=colorOutRows(s);md.push(`輸出：${L("colorOut").join("、")||"（未選）"}\n\nP3：${P("p3Policy")}\n\nCMYK：${P("cmykPolicy")}\n\nTAC：${P("tacLimit")}\n\n出血：${P("bleed")}`);md.push(rows.length?"\n| 角色 | HEX | OKLCH | Display P3 | CMYK 近似（不可作官方） | 打樣 CMYK | Pantone | 狀態 |\n|---|---|---|---|---|---|---|---|\n"+rows.map(r=>`| ${r.label} | ${r.hex} | ${r.oklch} | ${r.p3} | ${r.cmyk.c}/${r.cmyk.m}/${r.cmyk.y}/${r.cmyk.k} | ${r.proof.cmyk||"—"} | ${r.proof.pms||"—"} | ${r.proof.st||"未打樣"} |`).join("\n"):"");
  H("8. 承印物與工藝");const PR=procs(s),SB=subs(s);md.push(`承印物：${SB.map(x=>x.zh).join("、")||"（未選）"}`);md.push(PR.length?"\n| 工藝 | 成本等級 | 最小線寬（保守值） | 漸變 | 向量 | 螢幕不準 |\n|---|---|---|---|---|---|\n"+PR.map(x=>`| ${x.zh} | ${COST[x.cost]} | ${x.minLine?x.minLine+"mm":"未查證"} | ${x.grad===1?"可":x.grad===0?"不可":"未確定"} | ${x.vec?"是":"否"} | ${x.shift?"是":"否"} |`).join("\n"):"");
  H("9. 禁區");md.push(negatives(s).map(x=>"- "+x).join("\n")||"（未定義）");return md.join("\n")}
function buildSystem(s){const L=k=>labels(k,s).join("、")||"（未定義）",P=d=>{const o=picked(s,d);return o?o.zh:"（未定義）"};
  return `你是「${brandName(s)}」的圖形與表面系統設計 Agent。所有漸變、填色、邊框、形狀、紋理、Pattern、配色變體、印刷規格與生圖提示詞，必須遵守以下規範。\n${s.s4a&&s.s4a.statement?"視覺語言（4A）："+s.s4a.statement+"\n":""}${s.s2&&s.s2.statement?"感官定調：："+s.s2.statement+"\n":""}\n【一句話】${T_(s,"statement")||draft(s)}\n【漸變】${L("gradType")}；用途 ${L("gradUse")}；備援 ${P("gradFallback")}；${gradCSS(s)||"（未填色值）"}\n【填色與邊框】${L("fillType")}；${P("fillOpacity")}；邊框 ${L("borderStyle")}；${P("borderWidth")}；${P("borderColor")}；焦點 ${P("focusRing")}\n【形狀與陰影】${L("shapeKit")}；${P("radiusScale")}；${P("elevation")}\n【紋理】${L("texSpec")}；${P("texBlend")}；${P("texBudget")}\n【無縫圖案】母題 ${L("patMotif")}；${L("repeat")}；${P("patDensity")}；${P("patContrast")}\n【配色變體】${cwRows(s).map(c=>`${c.name}（背景 ${c.bg}／前景 ${c.fg}／強調 ${c.ac}）`).join("；")||"（未定義）"}\n【色彩輸出】${L("colorOut")}；P3：${P("p3Policy")}；CMYK：${P("cmykPolicy")}；TAC：${P("tacLimit")}；出血：${P("bleed")}\n【承印物與工藝】${L("substrates")}；${L("processes")}\n\n【絕對禁止】${negatives(s).join("、")||"（未定義）"}\n\n【工作規則】\n1) 只可使用上列色值、規則與 visual tokens；不可自行發明新數值。\n2) 文字壓在漸變、圖案、照片上時，必須列出最差位置的對比比值；低於 4.5:1（大字 3:1）須調整。\n3) CMYK 近似值不可當作官方印刷色；官方印刷色須由印刷廠 ICC 轉換並打樣後登錄。\n4) 不可用螢幕效果冒充燙金、專色、螢光、壓凸等實物工藝；須註明『螢幕模擬，非實物』。\n5) 工藝的最小線寬、字級、出血與總油墨量是常見保守值，不是規格；一律標示『待印刷廠確認』。\n6) 漸變與半透明不可用於燙箔、壓凸、局部上光、刺繡；須另做單色或簡化版本。\n7) 遇到規範沒有涵蓋或互相衝突的情況，請回報人類，不要自行決定。\n8) 所有輸出標示為『AI 提案，待人類核准』。`}
function hints(s){const H=[],A=(st,f,t,w)=>H.push({stage:st,field:f,text:t,why:w});const L=k=>labels(k,s).join("、");
  A("4C 動態、聲音與影片","動態與漸變","漸變、紋理與形狀的動態（淡入、位移、載入）須有『減少動態』版本；漸變動畫要檢查對比與效能","漸變與紋理規格");
  if(s.processes.some(x=>["pr_foil","pr_emboss","pr_spotuv","pr_embroid"].includes(x)))A("4D 3D 與產品視覺","材質與 CMF","把燙箔、壓凸、局部上光、刺繡轉為產品與包裝的 CMF 規格並做實物色樣","已選工藝："+L("processes"));
  if(s.substrates.some(x=>["sb_plastic","sb_metal","sb_glass","sb_wood","sb_leather"].includes(x)))A("4D 3D 與產品視覺","材質","產品與周邊的材質與表面處理由工程師與供應商驗證，不可由風格自動批准","承印物："+L("substrates"));
  A("4E UI／UX 與空間體驗","元件","把圓角比例尺、陰影、邊框、焦點外框、填色狀態轉為元件規範並做無障礙測試","圖形與表面規格");
  if(s.s0&&s.s0.delivery.some(x=>/店|診所|現場/.test(x)))A("4E UI／UX 與空間體驗","空間","把紋理、圖案與工藝轉為空間物料（牆面、地面、招牌）並核對清潔、防火與無障礙","Stage 0 有實體交付");
  A("4F 行銷內容與廣告","模板","把配色變體、圖案與漸變轉成社群、Carousel 與廣告模板","圖形系統落地");
  A("4G 跨媒體使用與治理","治理","登記色彩打樣核准者與日期、色票版本、印刷廠與版本；配色變體的允許與禁止場景","色彩輸出與工藝");
  A("4H 風格庫與 AI 生成契約","風格庫","把漸變、Pattern、紋理、配色變體存成可重用條目，附 Image Prompt 與負面約束","供 AI 生成使用");
  return H}
function completeness(s){const rows=colorOutRows(s),c=[
  ["gradient","漸變類型（或選不使用）＋備援",count("gradType",s)>=1&&!!picked(s,"gradFallback")],["gradUse","漸變用途（不使用漸變可略過）",s.gradType.includes("gt_none")||count("gradUse",s)>=1],["gradSpec","漸變色值與取樣（不使用漸變可略過）",s.gradType.includes("gt_none")||!!gradStops(s)],
  ["fill","填色類型與透明度、狀態",count("fillType",s)>=1&&!!picked(s,"fillOpacity")&&!!picked(s,"fillStates")],["border","邊框、粗細、顏色與焦點",count("borderStyle",s)>=1&&["borderWidth","borderColor","focusRing"].every(d=>picked(s,d))],
  ["shape","形狀組件、圓角比例尺與陰影",count("shapeKit",s)>=1&&!!picked(s,"radiusScale")&&!!picked(s,"elevation")],["texture","紋理（或不使用）",count("texSpec",s)>=1&&(s.texSpec.every(x=>x==="xt_none")||(!!picked(s,"texBlend")&&!!picked(s,"texBudget")))],
  ["pattern","無縫圖案母題、重複、密度、對比",count("patMotif",s)>=1&&count("repeat",s)>=1&&!!picked(s,"patDensity")&&!!picked(s,"patContrast")],["colorways","配色變體（至少 3 個）",count("colorways",s)>=3],["palette","5 個有效 HEX 色值",rows.length===5],
  ["colorOut","色彩輸出與 P3、CMYK、TAC、出血策略",count("colorOut",s)>=1&&["p3Policy","cmykPolicy","tacLimit","bleed"].every(d=>picked(s,d))],["finish","承印物與工藝（或確認無需特殊工藝）",count("substrates",s)>=1&&count("processes",s)>=1],["avoid","表面禁區（至少 3 個）",count("avoidSurface",s)>=3]];
  const done=c.filter(x=>x[2]).length;return {done,total:c.length,pct:Math.round(done/c.length*100),missing:c.filter(x=>!x[2]).map(x=>({key:x[0],label:x[1]}))}}
function buildBrief(s){const c=completeness(s),pk=k=>items(k,s).map(i=>({id:i.id,name:i.zh,note:i.desc}));const dm={};DIMS.forEach(d=>{const o=picked(s,d.id);if(o)dm[d.id]={id:o.id,name:o.zh,note:o.desc}});const tx={};TEXTS.forEach(t=>{if(T_(s,t.id))tx[t.id]=T_(s,t.id)});
  return {schema:"brand/stage4b-surface-system/v1",status:c.missing.length?"incomplete":"complete",completeness:c.pct,missing:c.missing,approval:{state:"draft",approved_by:null,note:"草稿；AI 提案與表單填寫不等於人類核准；印刷規格須由印刷廠確認並打樣。"},
   stage_context:{stage0:s.s0||null,stage1:s.s1||null,stage2:s.s2||null,stage3:s.s3||null,stage4a:s.s4a||null},brand_name:brandName(s),
   gradient:{types:pk("gradType"),uses:pk("gradUse"),stops:dm.gradStops||null,fallback:dm.gradFallback||null,spec:{a:tx.g_a||null,b:tx.g_b||null,c:tx.g_c||null,mid:tx.g_mid||null,angle:tx.g_angle||null,text_color:tx.g_txt||null,css:gradCSS(s),samples:gradSamples(s)&&gradSamples(s).map(x=>({at:x.t,color:x.color,contrast:x.ratio==null?null:Math.floor(x.ratio*100)/100}))},note:tx.g_note||null},
   fill:{types:pk("fillType"),opacity:dm.fillOpacity||null,states:dm.fillStates||null,ramp:palette(s).c_primary?ramp(palette(s).c_primary):null},
   border:{styles:pk("borderStyle"),width:dm.borderWidth||null,color:dm.borderColor||null,focus:dm.focusRing||null,print_mm:tx.bd_mm||null},
   shape:{kit:pk("shapeKit"),radius_scale:dm.radiusScale||null,elevation:dm.elevation||null},texture:{specs:pk("texSpec"),blend:dm.texBlend||null,budget:dm.texBudget||null},
   pattern:{motifs:pk("patMotif"),repeat:pk("repeat"),density:dm.patDensity||null,contrast:dm.patContrast||null,fill:dm.patFill||null,params:patParams(s),tile_svg:s.patMotif.length?tileSVG(s):null},
   colorways:cwRows(s).map(r=>({id:r.id,name:r.name,background:r.bg,foreground:r.fg,accent:r.ac,text_contrast:Math.floor(r.textRatio*100)/100,accent_contrast:Math.floor(r.accRatio*100)/100,customized:r.custom})),
   color_output:{outputs:pk("colorOut"),p3_policy:dm.p3Policy||null,cmyk_policy:dm.cmykPolicy||null,tac:dm.tacLimit||null,bleed:dm.bleed||null,colors:colorOutRows(s).map(r=>({role:r.label,hex:r.hex,hsl:r.hsl,oklch:r.oklch,display_p3:r.p3,display_p3_enhanced:r.p3e,cmyk_naive_approx:r.cmyk,cmyk_proofed:r.proof.cmyk||null,pantone:r.proof.pms||null,status:r.proof.st||"未打樣"}))},
   finishes:{substrates:pk("substrates"),processes:pk("processes"),print_spec:printSpec(s)},surface_avoid:pk("avoidSurface"),combined_negatives:negatives(s),
   surface_statement:{text:T_(s,"statement")||draft(s),source:T_(s,"statement")?"human":"auto-draft"},surface_tokens:buildTokens(s),surface_css:tokensCSS(s),image_prompts:imagePrompts(s),
   consistency_checks:checks(s),downstream_hints:hints(s),surface_guide_md:buildGuide(s),system_prompt:buildSystem(s),
   agent_rules:["所有圖形與表面輸出必須符合 system_prompt、surface_guide_md 與 surface_tokens。","combined_negatives 中的任何一項都不可出現；不確定時回報人類。","文字壓在漸變、圖案、照片上須列出最差位置對比；不足須調整。","CMYK 近似值不是官方印刷色；官方色須由印刷廠 ICC 轉換並打樣；工藝最小值為常見保守值，須由印刷廠確認。","不可用螢幕效果冒充實物工藝，並標明『螢幕模擬』。","consistency_checks 中 level 為 warn 或 error 的項目須先由人類確認，才可進入 4C–4H。","approval.state 為 draft 時，不得視為已核准；不得自行把狀態改為已核准。","status 為 incomplete 時，缺少的欄位不得自行補寫。","本階段不提供風格相符度分數。"]}}

// ---------- 貼回 ----------
function matchItem(k,name){const n=norm(name);if(!n)return null;const L=flat(k);return L.find(i=>i.id===name||norm(i.zh)===n)||L.find(i=>n.length>=2&&(norm(i.zh).includes(n)||(norm(i.zh).length>=2&&n.includes(norm(i.zh)))))||null}
function matchOpt(d,name){const dm=DIM(d);if(!dm)return null;const n=norm(name);return dm.opts.find(o=>o.id===name||norm(o.zh)===n)||dm.opts.find(o=>n.length>=2&&(norm(o.zh).includes(n)||(norm(o.zh).length>=2&&n.includes(norm(o.zh)))))||null}
function extractJSON(text){const f=text.match(/```(?:json)?\s*([\s\S]*?)```/i);return JSON.parse(f?f[1]:text.slice(text.indexOf("{"),text.lastIndexOf("}")+1))}
function normalizeBrief(j){if(!j||typeof j.schema!=="string"||!j.schema.startsWith("brand/stage4b"))return j;const n=a=>(a||[]).map(x=>x.name);const o={};
  o.gradType=n(j.gradient&&j.gradient.types);o.gradUse=n(j.gradient&&j.gradient.uses);o.fillType=n(j.fill&&j.fill.types);o.borderStyle=n(j.border&&j.border.styles);o.shapeKit=n(j.shape&&j.shape.kit);o.texSpec=n(j.texture&&j.texture.specs);o.patMotif=n(j.pattern&&j.pattern.motifs);o.repeat=n(j.pattern&&j.pattern.repeat);o.colorways=(j.colorways||[]).map(x=>x.name);o.colorOut=n(j.color_output&&j.color_output.outputs);o.substrates=n(j.finishes&&j.finishes.substrates);o.processes=n(j.finishes&&j.finishes.processes);o.avoidSurface=n(j.surface_avoid);
  o.dims={};const d=(k,v)=>{if(v)o.dims[k]=v.name};d("gradStops",(j.gradient||{}).stops);d("gradFallback",(j.gradient||{}).fallback);d("fillOpacity",(j.fill||{}).opacity);d("fillStates",(j.fill||{}).states);d("borderWidth",(j.border||{}).width);d("borderColor",(j.border||{}).color);d("focusRing",(j.border||{}).focus);d("radiusScale",(j.shape||{}).radius_scale);d("elevation",(j.shape||{}).elevation);d("texBlend",(j.texture||{}).blend);d("texBudget",(j.texture||{}).budget);d("patDensity",(j.pattern||{}).density);d("patContrast",(j.pattern||{}).contrast);d("patFill",(j.pattern||{}).fill);const co=j.color_output||{};d("p3Policy",co.p3_policy);d("cmykPolicy",co.cmyk_policy);d("tacLimit",co.tac);d("bleed",co.bleed);
  o.text={};const g=(j.gradient||{}).spec||{};[["g_a","a"],["g_b","b"],["g_c","c"],["g_mid","mid"],["g_angle","angle"],["g_txt","text_color"]].forEach(([k,v])=>{if(g[v])o.text[k]=g[v]});if(j.brand_name)o.text.brandName=j.brand_name;if(j.surface_statement&&j.surface_statement.source==="human")o.text.statement=j.surface_statement.text;return o}
function applyPaste(text,s){const out={applied:[],custom:[],errors:[]};let j;
  try{j=normalizeBrief(extractJSON(text))}catch(e){out.errors.push("找不到可解析的 JSON 區塊（請連同 ```json 區塊一起貼上）");return out}
  CAT_KEYS.forEach(k=>{if(!Array.isArray(j[k]))return;const ids=[],cu=[];j[k].forEach(n=>{const m=matchItem(k,n);if(m){if(!ids.includes(m.id))ids.push(m.id)}else if(String(n).trim()&&!cu.includes(String(n).trim()))cu.push(String(n).trim())});s[k]=ids;s.custom[k]=cu;out.applied.push(`${CAT[k].title.replace(/（.*/,"")}：${ids.length} 項`+(cu.length?`＋自訂 ${cu.length} 項`:""));cu.forEach(c=>out.custom.push(c))});
  const dd=Object.assign({},j.dims||{});DIMS.forEach(d=>{if(typeof j[d.id]==="string"||(j[d.id]&&j[d.id].name))dd[d.id]=typeof j[d.id]==="string"?j[d.id]:j[d.id].name});let c=0;Object.entries(dd).forEach(([d,v])=>{if(!DIM(d))return;const o=matchOpt(d,v);if(o){s.dims[d]=o.id;c++}else out.errors.push(`「${d}」的值「${v}」不在清單內，未套用`)});if(c)out.applied.push(`單選規則：${c} 項`);
  const tx=Object.assign({},j.text||{});TEXTS.forEach(t=>{if(typeof j[t.id]==="string"||typeof j[t.id]==="number")tx[t.id]=j[t.id]});let tc=0;Object.entries(tx).forEach(([k,v])=>{if(TEXT_BY[k]&&(typeof v==="string"||typeof v==="number")){s.text[k]=String(v);tc++}});if(tc)out.applied.push(`文字欄：${tc} 項`);
  if(!out.applied.length)out.errors.push("JSON 內沒有可辨識的欄位");return out}
