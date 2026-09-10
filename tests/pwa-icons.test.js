// Native HtmlService contract + image integrity. This does not emulate Google's outer iframe or mobile installation.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const png=fs.readFileSync('src/web/assets/icon.png');assert.deepEqual(fs.readFileSync('icon.png'),png);
assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
let offset=8,idat=[],types=[];
while(offset<png.length){const length=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8);types.push(type);assert(['IHDR','IDAT','IEND'].includes(type),'unnecessary PNG metadata');assert.equal(crc32(png.subarray(offset+4,offset+8+length)),png.readUInt32BE(offset+8+length));if(type==='IDAT')idat.push(png.subarray(offset+8,offset+8+length));offset+=length+12;}
assert.equal(offset,png.length);assert.equal(types.at(-1),'IEND');assert.equal(png.readUInt32BE(16),512);assert.equal(png.readUInt32BE(20),512);assert.equal(png[24],8);assert.equal(png[25],2);assert.equal(png[28],0);assert(png.length<32*1024);
const raw=zlib.inflateSync(Buffer.concat(idat)),stride=512*3,pixels=Buffer.alloc(512*stride);
assert.equal(raw.length,(stride+1)*512);
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
for(let y=0;y<512;y++){const filter=raw[y*(stride+1)];assert(filter<=4);for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=3?pixels[i-3]:0,b=y?pixels[i-stride]:0,c=y&&x>=3?pixels[i-stride-3]:0;pixels[i]=(raw[y*(stride+1)+x+1]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}}
let maxRadius=0;for(let y=0;y<512;y++)for(let x=0;x<512;x++){const i=(y*512+x)*3;if(pixels[i]!==17||pixels[i+1]!==42||pixels[i+2]!==67)maxRadius=Math.max(maxRadius,Math.hypot(x-255.5,y-255.5));}
assert(maxRadius<512*.4,'artwork leaves Android safe circle');
const source=fs.readFileSync('dist/Code.gs','utf8'),calls=[];
const output={content:'',title:'',icon:'',meta:[],setTitle(v){this.title=v;return this;},setFaviconUrl(v){assert(/\.png$/.test(v),'favicon must end in .png without query or fragment');this.icon=v;calls.push('favicon');return this;},addMetaTag(k,v){assert(['viewport','mobile-web-app-capable','apple-mobile-web-app-capable'].includes(k));this.meta.push([k,v]);return this;}};
const context={HtmlService:{createHtmlOutput(html){output.content=html;return output;}}};vm.createContext(context);vm.runInContext(source,context);context.getAppState=()=>({active:false,today:'2026.9.10',session:null});context.doGet();
const revision=crypto.createHash('sha256').update(png).digest('hex').slice(0,16);
assert.equal(output.icon,'https://raw.githubusercontent.com/ikifuse/autel-evo-lite-flight-log/main/icon.png');
assert.equal(output.title,'ドローン運航記録');assert.equal(calls.length,1);assert.equal(new Set(output.meta.map(x=>x[0])).size,3);
assert.deepEqual(output.meta,[['mobile-web-app-capable','yes'],['apple-mobile-web-app-capable','yes'],['viewport','width=device-width, initial-scale=1, viewport-fit=cover']]);
assert.equal((output.content.match(/rel="apple-touch-icon"/g)||[]).length,1);assert(output.content.includes('sizes="512x512" href="'+output.icon+'?v='+revision+'"'));
assert(!/rel="(?:icon|manifest)"/.test(output.content));assert(!/<meta name=/.test(output.content));assert(!/__APP_ICON__|__ICON_REVISION__|__INITIAL_STATE__/.test(output.content));
assert(!/navigator\.serviceWorker|serviceWorker\.register/.test(output.content));
// Optional phase snapshot confirms no saving logic or Web JS changed during the icon task.
const rcPath=process.argv.find(a=>a.startsWith('--rc='));if(rcPath){const rc=fs.readFileSync(rcPath.slice(5),'utf8');const server=s=>s.split('const APP_HTML =')[0].replace(/function doGet\(\) \{[\s\S]*?\n\}/,'');assert.equal(server(source),server(rc),'PWA changed server saving logic');const js=s=>s.slice(s.indexOf('<script>')+8,s.lastIndexOf('</script>'));assert.equal(js(source),js(rc),'PWA changed workflow/storage JS');}
console.log('PWA PNG 512 RGB/CRC/decoded safe circle ('+maxRadius.toFixed(2)+'px)/no metadata/public copy/hash PASS');
console.log('PWA actual doGet → HtmlService API/meta/favicon/touch link/build/no misleading manifest PASS');
console.log('NOT_CHECKED: published new bytes, Google outer page, Pixel/iPhone icon selection and standalone behavior');
