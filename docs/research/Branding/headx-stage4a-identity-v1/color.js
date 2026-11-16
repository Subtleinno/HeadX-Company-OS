
// ===== 色彩工具（WCAG 對比）=====
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
function hexToRgb(h){h=String(h||"").trim().replace("#","");if(h.length===3)h=h.split("").map(x=>x+x).join("");if(!/^[0-9a-fA-F]{6}$/.test(h))return null;return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16))}
const isHex=h=>!!hexToRgb(h);
const rgbToHex=(r,g,b)=>"#"+[r,g,b].map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,"0")).join("").toUpperCase();
const normHex=h=>{const r=hexToRgb(h);return r?rgbToHex(...r):""};
const s2l=c=>{c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
function relLum(hex){const rgb=hexToRgb(hex);if(!rgb)return 0;const [r,g,b]=rgb.map(s2l);return 0.2126*r+0.7152*g+0.0722*b}
const contrast=(a,b)=>{if(!isHex(a)||!isHex(b))return 0;const x=relLum(a),y=relLum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
const l2s=c=>{c=clamp(c,0,1);const v=c<=0.0031308?12.92*c:1.055*Math.pow(c,1/2.4)-0.055;return Math.round(clamp(v,0,1)*255)};
const grayOf=hex=>{const v=l2s(relLum(hex));return rgbToHex(v,v,v)};
function hslOf(hex){const [r,g,b]=hexToRgb(hex).map(v=>v/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;let h=0,s=0;if(mx!==mn){const d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h*=60}return {h,s,l}}
