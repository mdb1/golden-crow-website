(function(){
'use strict';
let serial=0;
const defaults={accent:'#ff00ff',accentDeep:'#8f0068',accentLight:'#ff79d2',companyName:'Tu marca',companyDisplayName:'',titlePrefix:'La app de',description:'Subimos tu propia app al store, exclusiva para tus servicios y productos.',featured:'SERVICIO DESTACADO',features:['App propia','Tus servicios','Tus productos'],previousPrice:'99.99',currentPrice:'59.99',priceUnit:'USD / MES',nowLabel:'AHORA',actionLabel:'Crear mi app',heroEyebrow:'PARA TU COMUNIDAD',heroTitle:'Todo tu mundo,\nen una app',statusTime:'9:41',brandIcon:'heart-pulse',brandLogoUrl:'',servicesTitle:'Mis servicios',productsTitle:'Productos',backgroundDepthOpacity:1,cornerShadeOpacity:.65,backgroundBloomOpacity:.65,backgroundDeep:'#30001f',backgroundMid:'#9c0065',materialLight:'#ff79d2',surface:'#fff7fc',surfaceTop:'#fffafd',surfaceBottom:'#f5dcea',halo:'#ff66ce',highlight:'#ffffff',ink:'#26001a',shadow:'#190010',homeRows:[{icon:'stethoscope',title:'Mis servicios'},{icon:'box',title:'Productos'},{icon:'calendar',title:'Turnos online'},{icon:'megaphone',title:'Novedades'}],servicesRows:[{icon:'dna',title:'Análisis genéticos'},{icon:'heart-pulse',title:'Seguimiento'},{icon:'report',title:'Resultados'}],productRows:[{icon:'box',title:'Kits de salud'},{icon:'capsule',title:'Productos'},{icon:'bell',title:'Novedades'}],onAction:null};
const ORB_ASSET='/open-api/pocketgenes-atomic-banner/glossy-magenta-glass-orb.png';
const RIBBON_ASSET='/open-api/pocketgenes-atomic-banner/glossy-magenta-ribbon-swirl.png';
const recoloredRasterCache=new Map();
const parser=new DOMParser();
const px=v=>`${v}px`;
function validHex(value){if(!/^#[0-9a-f]{6}$/i.test(value))throw new Error('accent must be a six-digit hexadecimal color such as #ff00ff');return value;}
function mix(color,target,amount){const parts=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));return '#'+parts.map((c,i)=>Math.round(c*(1-amount)+target[i]*amount).toString(16).padStart(2,'0')).join('');}
function cleanConfig(config){const c=Object.assign({},defaults,config);for(const k of ['accent','accentDeep','accentLight','backgroundDeep','backgroundMid','materialLight','surface','surfaceTop','surfaceBottom','halo','highlight','ink','shadow'])validHex(c[k]);for(const k of ['companyName','companyDisplayName','titlePrefix','description','featured','previousPrice','currentPrice','priceUnit','nowLabel','actionLabel','heroEyebrow','heroTitle','statusTime','brandIcon','brandLogoUrl','servicesTitle','productsTitle'])c[k]=String(c[k]??'');for(const k of ['backgroundDepthOpacity','cornerShadeOpacity','backgroundBloomOpacity']){c[k]=Number(c[k]);if(!Number.isFinite(c[k])||c[k]<0||c[k]>1)throw new Error(`${k} must be between 0 and 1`);}if(!Array.isArray(c.features)||c.features.length!==3)throw new Error('features must contain exactly three labels');for(const [key,count] of [['homeRows',4],['servicesRows',3],['productRows',3]]){if(!Array.isArray(c[key])||c[key].length!==count)throw new Error(`${key} must contain ${count} rows`);c[key]=c[key].map(row=>{const icon=String(row.icon),title=String(row.title??'');if(!window.ATOMIC_ASSETS['icon-'+icon])throw new Error(`Unknown icon ${icon}`);return{icon,title};});}if(!window.ATOMIC_ASSETS['icon-'+c.brandIcon])throw new Error('Unknown brandIcon');return c;}
function recolorMonochromeRGBA(data,target){
 const channels=[1,3,5].map(i=>parseInt(target.slice(i,i+2),16)/255);
 for(let i=0;i<data.length;i+=4){
  const red=data[i],green=data[i+1],blue=data[i+2];
  const neutral=Math.min(red,green,blue),chroma=Math.max(red,green,blue)-neutral;
  data[i]=Math.min(255,Math.round(neutral+chroma*channels[0]));
  data[i+1]=Math.min(255,Math.round(neutral+chroma*channels[1]));
  data[i+2]=Math.min(255,Math.round(neutral+chroma*channels[2]));
 }
 return data;
}
function recolorAsset(source,target){
 const key=`${source}|${target.toLowerCase()}`;
 if(recoloredRasterCache.has(key))return recoloredRasterCache.get(key);
 const result=new Promise((resolve,reject)=>{
  const image=new Image();image.decoding='async';
  image.addEventListener('load',()=>{
   try{
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Canvas 2D is unavailable');
    context.drawImage(image,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height);
    recolorMonochromeRGBA(pixels.data,target);context.putImageData(pixels,0,0);resolve(canvas.toDataURL('image/png'));
   }catch(error){reject(error);}
  },{once:true});
  image.addEventListener('error',()=>reject(new Error(`Unable to load decorative asset: ${source}`)),{once:true});
  image.src=source;
 });
 recoloredRasterCache.set(key,result);return result;
}
function mountAtomicBanner(host,initial={}){
 if(typeof host==='string')host=document.querySelector(host);
 if(!(host instanceof HTMLElement))throw new Error('A valid banner host is required');
 let config=cleanConfig(initial),layout=[],observer,stage,ink,uiInk,accent,renderedName;
 host.classList.add('atomic-host');
 function trustedSvgPart(id,svgSource,x,y,w,h,z,parent=stage,color='var(--accent)',opacity=1,rotation=0){
  const node=document.createElement('span');node.className='atomic-part';node.dataset.part=id;
  Object.assign(node.style,{left:px(x),top:px(y),width:px(w),height:px(h),zIndex:String(z),color,opacity:String(opacity)});
  if(rotation)node.style.transform=`rotate(${rotation}deg)`;
  const doc=parser.parseFromString(svgSource,'image/svg+xml');
  const svg=doc.documentElement;svg.removeAttribute('style');svg.style.color='inherit';
  const prefix=`a${++serial}_`;
  for(const el of svg.querySelectorAll('[id]'))el.id=prefix+el.id;
  for(const el of [svg,...svg.querySelectorAll('*')]){
   for(const attr of [...el.attributes]){
    let val=attr.value.replace(/url\(#([^)]*)\)/g,(_,name)=>`url(#${prefix}${name})`);
    if(attr.name==='href'&&val.startsWith('#'))val='#'+prefix+val.slice(1);
    if(val!==attr.value)el.setAttribute(attr.name,val);
   }
  }
  svg.setAttribute('aria-hidden','true');node.append(svg);parent.append(node);
  layout.push({kind:'asset',id,parent:parent.dataset.group||'banner',x,y,width:w,height:h,z,color,opacity,rotation});
  return node;
 }
 function svgPart(id,x,y,w,h,z,parent=stage,color='var(--accent)',opacity=1,rotation=0){
  const data=window.ATOMIC_ASSETS[id];if(!data)throw new Error(`Unknown atomic component: ${id}`);
  return trustedSvgPart(id,data.svgSource,x,y,w,h,z,parent,color,opacity,rotation);
 }
 function inlineSvgPart(id,svgSource,x,y,w,h,z,parent=stage,color='var(--accent)',opacity=1,rotation=0){
  return trustedSvgPart(id,svgSource,x,y,w,h,z,parent,color,opacity,rotation);
 }
 function rasterPart(id,source,x,y,w,h,z,opacity=1){
  const node=document.createElement('img');node.className='atomic-raster';node.dataset.part=id;node.alt='';node.decoding='async';
  Object.assign(node.style,{left:px(x),top:px(y),width:px(w),height:px(h),zIndex:String(z),opacity:String(opacity),objectFit:'contain'});stage.append(node);
  layout.push({kind:'raster',id,parent:'banner',x,y,width:w,height:h,z,opacity});
  void recolorAsset(source,accent).then(url=>{if(node.isConnected)node.src=url;}).catch(()=>{node.remove();});
  return node;
 }
 function text(value,x,y,w,h,size,weight,color,z=50,parent=stage,extra={}){
  const el=document.createElement('span');el.className='atomic-text';el.textContent=value;el.dataset.layoutIndex=String(layout.length);
  Object.assign(el.style,{left:px(x),top:px(y),width:px(w),height:px(h),fontSize:px(size),fontWeight:String(weight),color,zIndex:String(z)},extra);parent.append(el);
  layout.push({kind:'text',value,parent:parent.dataset.group||'banner',x,y,width:w,height:h,z,fontSize:size,fontWeight:weight});return el;
 }
 function icon(id,x,y,s,z=52,parent=stage,color=ink){return svgPart('icon-'+id,x,y,s,s,z,parent,color);}
 function fitted(el,max,min,allowWrap=true){
  el.style.overflow='visible';el.style.whiteSpace=allowWrap?'normal':'nowrap';
  let size=max;el.style.fontSize=px(size);
  while(size>min&&(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1)){size-=.5;el.style.fontSize=px(size);}
  layout[Number(el.dataset.layoutIndex)].fontSize=size;return el.scrollWidth<=el.clientWidth+1&&el.scrollHeight<=el.clientHeight+1;
 }
 function brandMark(parent,x,y,size,z,color){if(!config.brandLogoUrl)return icon(config.brandIcon,x,y,size,z,parent,color);const img=document.createElement('img');img.src=config.brandLogoUrl;img.alt='';img.dataset.part='configured-brand-mark';Object.assign(img.style,{position:'absolute',left:px(x),top:px(y),width:px(size),height:px(size),objectFit:'contain',zIndex:String(z)});parent.append(img);return img;}
 function sparkle(x,y,s){svgPart('sparkle-soft-glow',x-s/2,y-s/2,s*2,s*2,44);svgPart('sparkle-rounded-cross',x,y,s,s,45);}
 function vectorDocument(title,width,height,body,defs=''){return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none"><title>${title}</title>${defs?`<defs>${defs}</defs>`:''}${body}</svg>`;}
 function satinSurfaceSvg(width,height,radius){
  const defs=`<linearGradient id="face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${config.surfaceTop}"/><stop offset=".58" stop-color="${config.surface}"/><stop offset="1" stop-color="${config.surfaceBottom}"/></linearGradient><linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="white" stop-opacity=".94"/><stop offset=".62" stop-color="white" stop-opacity=".34"/><stop offset="1" stop-color="${config.accentDeep}" stop-opacity=".12"/></linearGradient>`;
  const body=`<rect x=".7" y=".7" width="${width-1.4}" height="${height-1.4}" rx="${radius-.7}" fill="url(#face)"/><rect x=".7" y=".7" width="${width-1.4}" height="${height-1.4}" rx="${radius-.7}" stroke="url(#rim)" stroke-width="1.1"/><path d="M${radius} 1.4H${width-radius}" stroke="white" stroke-opacity=".72" stroke-width=".8" stroke-linecap="round"/>`;
  return vectorDocument('Pale satin surface',width,height,body,defs);
 }
 function iconDiscSvg(size){
  const defs=`<radialGradient id="face" cx=".32" cy=".2" r=".82"><stop offset="0" stop-color="white" stop-opacity=".96"/><stop offset=".38" stop-color="${config.accentLight}" stop-opacity=".58"/><stop offset="1" stop-color="${config.surfaceBottom}"/></radialGradient><linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop stop-color="white" stop-opacity=".92"/><stop offset="1" stop-color="${config.accentDeep}" stop-opacity=".13"/></linearGradient>`;
  return vectorDocument('Satin icon holder',size,size,`<circle cx="${size/2}" cy="${size/2}" r="${size/2-.7}" fill="url(#face)"/><circle cx="${size/2}" cy="${size/2}" r="${size/2-.7}" stroke="url(#rim)" stroke-width="1"/>`,defs);
 }
 function priceContactSvg(){
  const defs=`<filter id="blur" x="-20%" y="-120%" width="140%" height="340%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="6"/></filter><radialGradient id="shadow"><stop stop-color="${config.shadow}" stop-opacity=".42"/><stop offset="1" stop-color="${config.shadow}" stop-opacity="0"/></radialGradient>`;
  return vectorDocument('Price contact support',301,25,'<ellipse cx="150.5" cy="12" rx="137.5" ry="6.5" fill="url(#shadow)" filter="url(#blur)"/>',defs);
 }
 function priceGlowSvg(){
  const defs=`<filter id="blur" x="-15%" y="-35%" width="130%" height="170%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="9"/></filter>`;
  return vectorDocument('Price perimeter bloom',299,109,`<rect x="12" y="12" width="275" height="85" rx="25" fill="${config.halo}" fill-opacity=".5" filter="url(#blur)"/>`,defs);
 }
 function priceFaceSvg(){
  const defs=`<linearGradient id="face" x1="0" y1="0" x2=".18" y2="1"><stop offset="0" stop-color="${config.surfaceTop}"/><stop offset=".52" stop-color="${config.surface}"/><stop offset="1" stop-color="${config.surfaceBottom}"/></linearGradient><radialGradient id="sheen" gradientUnits="userSpaceOnUse" cx="58" cy="7" r="177"><stop stop-color="white" stop-opacity=".34"/><stop offset=".56" stop-color="white" stop-opacity=".11"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient>`;
  const body='<rect width="275" height="85" rx="25" fill="url(#face)"/><rect x="1" y="1" width="273" height="83" rx="24" fill="url(#sheen)"/><path d="M24.5 84H250.5" stroke="'+config.accentDeep+'" stroke-opacity=".09" stroke-width="1" stroke-linecap="round"/>';
  return vectorDocument('Price enamel face',275,85,body,defs);
 }
 function priceRimSvg(){
  const defs=`<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="white"/><stop offset=".47" stop-color="white" stop-opacity=".62"/><stop offset=".82" stop-color="${config.accentLight}" stop-opacity=".38"/><stop offset="1" stop-color="${config.accentDeep}" stop-opacity=".18"/></linearGradient>`;
  return vectorDocument('Price fine perimeter',275,85,'<rect x=".7" y=".7" width="273.6" height="83.6" rx="24.3" stroke="url(#rim)" stroke-width="1.35"/>',defs);
 }
 function nowChipSvg(){
  const defs=`<linearGradient id="face" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${config.accentLight}"/><stop offset=".4" stop-color="${config.accent}"/><stop offset="1" stop-color="${config.accentDeep}"/></linearGradient><linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop stop-color="white" stop-opacity=".62"/><stop offset=".4" stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="${config.shadow}" stop-opacity=".32"/></linearGradient>`;
  return vectorDocument('Now enamel capsule',72,29,'<rect width="72" height="29" rx="14.5" fill="url(#face)"/><rect x=".7" y=".7" width="70.6" height="27.6" rx="13.8" stroke="url(#rim)" stroke-width="1"/>',defs);
 }
 function ctaContactSvg(){
  const defs=`<filter id="near" x="-20%" y="-80%" width="140%" height="260%"><feGaussianBlur stdDeviation="2.2"/></filter><filter id="soft" x="-25%" y="-60%" width="150%" height="240%"><feGaussianBlur stdDeviation="7"/></filter>`;
  const body=`<rect x="13" y="15" width="162" height="50" rx="21" fill="${config.shadow}" fill-opacity=".16" filter="url(#soft)"/><rect x="14" y="8" width="162" height="50" rx="21" fill="${config.shadow}" fill-opacity=".16" filter="url(#near)"/>`;
  return vectorDocument('CTA directional support',190,76,body,defs);
 }
 function ctaFaceSvg(){
  const defs=`<linearGradient id="face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${config.surfaceTop}"/><stop offset=".64" stop-color="${config.surface}"/><stop offset="1" stop-color="${config.surfaceBottom}"/></linearGradient><radialGradient id="reflection" gradientUnits="userSpaceOnUse" cx="40" cy="0" r="126"><stop stop-color="white" stop-opacity=".42"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient>`;
  const body='<rect width="162" height="50" rx="21" fill="url(#face)"/><rect x="1" y="1" width="160" height="48" rx="20" fill="url(#reflection)"/><path d="M21 49H141" stroke="'+config.accentDeep+'" stroke-opacity=".13" stroke-width="1.2" stroke-linecap="round"/>';
  return vectorDocument('CTA porcelain face',162,50,body,defs);
 }
 function ctaHighlightSvg(){
  const defs=`<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop stop-color="white"/><stop offset=".58" stop-color="white" stop-opacity=".38"/><stop offset="1" stop-color="${config.accentDeep}" stop-opacity=".12"/></linearGradient>`;
  return vectorDocument('CTA fine highlight',162,50,'<rect x=".7" y=".7" width="160.6" height="48.6" rx="20.3" stroke="url(#rim)" stroke-width="1.1"/>',defs);
 }
 function filledSparkSvg(){
  return vectorDocument('Filled app sparkle',20,20,'<path d="M8.1 1.4h3.8c.7 0 1.3.6 1.3 1.3v4.1h4.1c.7 0 1.3.6 1.3 1.3v3.8c0 .7-.6 1.3-1.3 1.3h-4.1v4.1c0 .7-.6 1.3-1.3 1.3H8.1c-.7 0-1.3-.6-1.3-1.3v-4.1H2.7c-.7 0-1.3-.6-1.3-1.3V8.1c0-.7.6-1.3 1.3-1.3h4.1V2.7c0-.7.6-1.3 1.3-1.3Z" fill="currentColor"/><path d="m16.4 1 .6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6Z" fill="currentColor" opacity=".82"/>');
 }
 function rowShadowSvg(width,height){
  const defs='<filter id="blur" x="-25%" y="-70%" width="150%" height="240%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="3"/></filter>';
  return vectorDocument('Shallow row support',width+12,height+14,`<rect x="6" y="5" width="${width}" height="${height}" rx="13" fill="${config.shadow}" fill-opacity=".16" filter="url(#blur)"/>`,defs);
 }
 function rowFaceSvg(width,height){
  const defs=`<linearGradient id="face" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${config.surfaceTop}"/><stop offset=".7" stop-color="${config.surface}"/><stop offset="1" stop-color="${config.surfaceBottom}" stop-opacity=".74"/></linearGradient><linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop stop-color="white" stop-opacity=".96"/><stop offset=".55" stop-color="white" stop-opacity=".4"/><stop offset="1" stop-color="${config.accentDeep}" stop-opacity=".09"/></linearGradient>`;
  return vectorDocument('Matte elevated row',width,height,`<rect x=".7" y=".7" width="${width-1.4}" height="${height-1.4}" rx="12.3" fill="url(#face)"/><rect x=".7" y=".7" width="${width-1.4}" height="${height-1.4}" rx="12.3" stroke="url(#rim)" stroke-width="1"/>`,defs);
 }
 function iconChipSvg(size){
  const defs=`<linearGradient id="face" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${config.surfaceTop}"/><stop offset=".42" stop-color="${config.accentLight}" stop-opacity=".34"/><stop offset="1" stop-color="${config.surfaceBottom}"/></linearGradient>`;
  return vectorDocument('Soft icon chip',size,size,`<rect x=".5" y=".5" width="${size-1}" height="${size-1}" rx="9" fill="url(#face)"/><path d="M9 1h${size-18}" stroke="white" stroke-opacity=".8" stroke-linecap="round"/>`,defs);
 }
 function featureShadowSvg(){
  const defs='<filter id="blur" x="-25%" y="-45%" width="150%" height="200%"><feGaussianBlur stdDeviation="4.2"/></filter>';
  return vectorDocument('Feature card support',194,93,`<rect x="8" y="9" width="178" height="81" rx="18" fill="${config.shadow}" fill-opacity=".24" filter="url(#blur)"/>`,defs);
 }
 function featureFaceSvg(){
  const defs=`<linearGradient id="face" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${config.accentDeep}"/><stop offset=".46" stop-color="${config.accent}"/><stop offset="1" stop-color="${config.accentLight}"/></linearGradient><linearGradient id="depth" x1="0" y1="0" x2="0" y2="1"><stop offset=".64" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="${config.shadow}" stop-opacity=".24"/></linearGradient>`;
  return vectorDocument('Feature enamel face',178,81,'<rect width="178" height="81" rx="18" fill="url(#face)"/><rect width="178" height="81" rx="18" fill="url(#depth)"/>',defs);
 }
 function featureSheenSvg(){
  const defs='<clipPath id="clip"><rect width="178" height="81" rx="18"/></clipPath><radialGradient id="shine" gradientUnits="userSpaceOnUse" cx="40" cy="-2" r="128"><stop stop-color="white" stop-opacity=".4"/><stop offset=".62" stop-color="white" stop-opacity=".08"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient>';
  const body='<g clip-path="url(#clip)"><ellipse cx="48" cy="4" rx="125" ry="48" fill="url(#shine)"/><circle cx="163" cy="10" r="27" stroke="white" stroke-opacity=".12" stroke-width="10"/><circle cx="181" cy="78" r="42" fill="white" fill-opacity=".055"/></g><path d="M18 1H160" stroke="white" stroke-opacity=".36" stroke-linecap="round"/>';
  return vectorDocument('Feature clipped sheen',178,81,body,defs);
 }
 function deviceHaloSvg(){
  const defs='<filter id="blur" x="-40%" y="-15%" width="180%" height="130%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="4"/></filter>';
  return vectorDocument('Selective frame halo',240,450,`<path d="M12 92V41Q12 9 44 8H185" stroke="${config.halo}" stroke-opacity=".42" stroke-width="3" stroke-linecap="round" filter="url(#blur)"/><path d="M34 439H177Q213 439 226 405" stroke="${config.halo}" stroke-opacity=".26" stroke-width="3" stroke-linecap="round" filter="url(#blur)"/>`,defs);
 }
 function deviceFrameSvg(){
  const defs=`<linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${config.accentLight}"/><stop offset=".1" stop-color="${config.accent}"/><stop offset=".28" stop-color="${config.accentDeep}"/><stop offset=".55" stop-color="${config.shadow}"/><stop offset=".78" stop-color="${config.accent}"/><stop offset="1" stop-color="${config.accentDeep}"/></linearGradient><linearGradient id="lit" x1="0" y1="0" x2="1" y2="1"><stop stop-color="white" stop-opacity=".9"/><stop offset=".48" stop-color="white" stop-opacity=".2"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>`;
  const body='<rect x="5.5" y="2.5" width="223" height="440" rx="35" fill="url(#metal)"/><path d="M11 89V39Q11 8 43 7H190Q207 7 217 20" stroke="url(#lit)" stroke-width="1.25" stroke-linecap="round"/><path d="M9.5 93V355" stroke="'+config.shadow+'" stroke-opacity=".55" stroke-width=".8"/><path d="M24 430Q34 441 56 441H185" stroke="white" stroke-opacity=".26" stroke-width=".9" stroke-linecap="round"/>';
  return vectorDocument('Coated directional frame',240,450,body,defs);
 }
 function screenReflectionSvg(){
  const defs='<linearGradient id="reflection" x1="0" y1="0" x2="1" y2="1"><stop stop-color="white" stop-opacity=".075"/><stop offset=".38" stop-color="white" stop-opacity=".025"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient><clipPath id="screen"><rect x="17" y="14" width="200" height="415" rx="26"/></clipPath>';
  return vectorDocument('Matte screen reflection',240,450,'<path d="M39 14H191Q217 14 217 40V264L17 102V40Q17 14 39 14Z" fill="url(#reflection)" clip-path="url(#screen)"/>',defs);
 }
 function tileSpecularSvg(neutral){
  const defs=`<clipPath id="clip"><rect x="5" y="4" width="100" height="100" rx="24"/></clipPath><radialGradient id="broad" gradientUnits="userSpaceOnUse" cx="18" cy="6" r="92"><stop stop-color="white" stop-opacity="${neutral?'.42':'.66'}"/><stop offset=".42" stop-color="white" stop-opacity="${neutral?'.14':'.24'}"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient><linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop stop-color="white" stop-opacity=".95"/><stop offset=".52" stop-color="white" stop-opacity=".16"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>`;
  const body='<g clip-path="url(#clip)"><ellipse cx="25" cy="7" rx="82" ry="47" transform="rotate(-18 25 7)" fill="url(#broad)"/></g><path d="M11 61V31Q11 11 33 10H77" stroke="url(#rim)" stroke-width="1.8" stroke-linecap="round"/>';
  return vectorDocument('Curved tile reflection',120,120,body,defs);
 }
 function floorContactCoreSvg(width,height,opacity){
  const defs='<filter id="blur" x="-20%" y="-120%" width="140%" height="340%"><feGaussianBlur stdDeviation="2.8"/></filter><radialGradient id="core"><stop stop-color="black" stop-opacity="'+opacity+'"/><stop offset="1" stop-color="black" stop-opacity="0"/></radialGradient>';
  return vectorDocument('Device contact core',width,height,`<ellipse cx="${width/2}" cy="${height/2}" rx="${width/2-3}" ry="${Math.max(2,height/2-2)}" fill="url(#core)" filter="url(#blur)"/>`,defs);
 }
 function floorReflectionPatchSvg(width,height){
  const defs=`<radialGradient id="light" cx=".5" cy=".5" r=".5"><stop stop-color="${config.highlight}" stop-opacity=".72"/><stop offset=".22" stop-color="${config.accentLight}" stop-opacity=".46"/><stop offset="1" stop-color="${config.accent}" stop-opacity="0"/></radialGradient>`;
  return vectorDocument('Localized floor reflection',width,height,`<ellipse cx="${width/2}" cy="${height/2}" rx="${width/2}" ry="${height/2}" fill="url(#light)"/>`,defs);
 }
 function tile(x,y,size,rotation,glyph,neutral=false){
  const node=document.createElement('div');node.dataset.group=neutral?'floating-tile-neutral':'floating-tile-accent';
  Object.assign(node.style,{position:'absolute',left:px(x),top:px(y),width:'120px',height:'120px',zIndex:'45',transform:`rotate(${rotation}deg) scale(${size/120})`,transformOrigin:'50% 50%'});stage.append(node);
  svgPart('tile-shadow',-12,-12,144,144,0,node,'black',.48);
  svgPart('tile-extrusion',0,0,120,120,1,node,neutral?'#e8ece7':config.backgroundMid);
  svgPart(neutral?'tile-face-neutral':'tile-face',0,0,120,120,2,node);
  inlineSvgPart('tile-specular',tileSpecularSvg(neutral),0,0,120,120,3,node,config.highlight,.96);
  if(neutral)inlineSvgPart('tile-neutral-glyph',filledSparkSvg(),35,35,42,42,4,node,ink);else brandMark(node,27,27,56,4,'white');
  layout.push({kind:'group',id:node.dataset.group,x,y,width:120,height:120,scale:size/120,rotation,z:45,transformOrigin:'50% 50%'});
 }
 function uiRow(node,y,glyph,label,x=26,width=184,height=48){
  inlineSvgPart('shadow-ui-row',rowShadowSvg(width,height),x-6,y-3,width+12,height+14,8,node,'black',1);
  inlineSvgPart('surface-ui-row',rowFaceSvg(width,height),x,y,width,height,9,node,config.surface,1);
  inlineSvgPart('surface-icon-chip',iconChipSvg(28),x+8,y+10,28,28,10,node,config.accentLight,1);
  icon(glyph,x+14,y+16,16,11,node,uiInk);
  const rowLabel=text(label,x+43,y+10,width-65,16,10.6,700,'#101a17',12,node);fitted(rowLabel,10.6,7.4,false);
  svgPart('surface-status-line',x+43,y+30,57,3.2,11,node,mix(config.surfaceBottom,[128,145,139],.58),.72);
  icon('chevron-right',x+width-15,y+19,7.5,12,node,accent);
 }
 function device(id,matrix,z,type){
  const node=document.createElement('div');node.className='atomic-device';node.dataset.group=id;
  Object.assign(node.style,{left:'0',top:'0',zIndex:String(z),transform:`matrix(${matrix.join(',')})`});stage.append(node);
  layout.push({kind:'group',id,width:240,height:450,matrix:[...matrix],z,transformOrigin:'0 0'});
  svgPart('device-occlusion-shadow',-20,-12,280,480,0,node,'black',id==='front'?.66:.3);
  inlineSvgPart('device-edge-halo',deviceHaloSvg(),0,0,240,450,1,node,config.halo,id==='front'?1:.62);
  svgPart('device-casing-depth',0,0,240,450,2,node);
  inlineSvgPart('device-frame-metal',deviceFrameSvg(),0,0,240,450,3,node,accent,1);
  svgPart('device-bezel',0,0,240,450,4,node);
  svgPart('device-screen-base',0,0,240,450,5,node);
  svgPart('device-volume-keys',0,0,240,450,6,node);
  svgPart('device-power-key',0,0,240,450,6,node);
  svgPart('device-camera-island',82,23,64,18,14,node);
  svgPart('device-earpiece',95,30,25,4,15,node);
  svgPart('device-camera-lens',130,28,8,8,15,node);
  text(config.statusTime,29,27,27,12,7.3,700,'#0d1514',15,node);
  svgPart('status-cellular',176,29,11,7,15,node,'#11191a');
  svgPart('status-wifi',189,29,10,7,15,node,'#11191a');
  svgPart('status-battery',201,29,11,6,15,node,'#11191a');
  inlineSvgPart('surface-navigation-bar',rowFaceSvg(184,28),26,395,184,28,12,node,config.surface,1);
  icon('heart-pulse',47,402,15,13,node,accent);icon('box',108,402,15,13,node,'#91a4ad');icon('users',168,402,15,13,node,'#91a4ad');
  svgPart('device-home-indicator',80,424,76,3,15,node,'#11191a');
  if(type==='home'){
   svgPart('tile-face',26,55,24,24,12,node);
   brandMark(node,31,61,12,13,'white');
   const name=text(renderedName,52,61,130,17,9,800,'#0e1616',13,node);fitted(name,9,5.5,false);
   svgPart('surface-icon-disc',188,56,20,20,12,node,'#82918a',.3);icon('bell',193,61,10,13,node,ink);
   inlineSvgPart('shadow-ui-feature',featureShadowSvg(),20,84,194,93,8,node,'black',1);
   inlineSvgPart('surface-ui-feature',featureFaceSvg(),28,91,178,81,10,node,accent,1);
   inlineSvgPart('surface-ui-feature-sheen',featureSheenSvg(),28,91,178,81,11,node,'white',1);
   text(config.heroEyebrow,39,102,137,9,5.8,700,'white',12,node,{letterSpacing:'1px'});
   text(config.heroTitle,39,118,142,39,13.4,800,'white',12,node,{lineHeight:'1.02'});
   icon('crown-outline',176,142,21,13,node,'white');
   config.homeRows.forEach((row,i)=>uiRow(node,181+i*53,row.icon,row.title));
  }else{
   icon('arrow-back',30,63,14,13,node,'#11191a');text(type==='services'?config.servicesTitle:config.productsTitle,52,64,130,18,11.7,800,'#11191a',13,node);
   icon('search',192,64,13,13,node,'#11191a');
   const rows=type==='services'?config.servicesRows:config.productRows;
   rows.forEach((r,i)=>uiRow(node,104+i*62,r.icon,r.title));
  }
  inlineSvgPart('device-screen-reflection',screenReflectionSvg(),0,0,240,450,18,node,'white',1);
  svgPart('device-rim-highlight',0,0,240,450,19,node,'white',id==='front'?.72:.42);
 }
 function build(){
  layout=[];accent=config.accent;ink=config.ink;uiInk=config.accentDeep;renderedName=config.companyDisplayName.trim()||config.companyName.trim()||'Tu marca';
  host.replaceChildren();stage=document.createElement('div');stage.className='atomic-artboard';stage.dataset.group='banner';stage.style.setProperty('--accent',accent);stage.style.setProperty('--accent-deep',config.accentDeep);stage.style.setProperty('--accent-light',config.accentLight);stage.style.setProperty('--ink',ink);stage.style.setProperty('--surface',config.surface);stage.style.setProperty('--surface-top',config.surfaceTop);stage.style.setProperty('--surface-bottom',config.surfaceBottom);stage.style.setProperty('--halo',config.halo);host.append(stage);
  const backgroundBase=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><defs><linearGradient id="base" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${config.backgroundDeep}"/><stop offset=".3" stop-color="${mix(config.backgroundDeep,[0,0,0],.08)}"/><stop offset=".62" stop-color="${config.backgroundMid}"/><stop offset="1" stop-color="${mix(accent,[255,255,255],.05)}"/></linearGradient></defs><rect width="1024" height="500" fill="url(#base)"/></svg>`;
  const upperLight=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><defs><radialGradient id="light" gradientUnits="userSpaceOnUse" cx="565" cy="82" r="465"><stop offset="0" stop-color="${config.highlight}" stop-opacity=".48"/><stop offset=".24" stop-color="${config.accentLight}" stop-opacity=".34"/><stop offset=".64" stop-color="${config.materialLight}" stop-opacity=".12"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs><rect width="1024" height="500" fill="url(#light)"/></svg>`;
  const phoneLight=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><defs><radialGradient id="light" gradientUnits="userSpaceOnUse" cx="765" cy="285" r="330"><stop offset="0" stop-color="${config.accentLight}" stop-opacity=".5"/><stop offset=".45" stop-color="${accent}" stop-opacity=".18"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs><rect width="1024" height="500" fill="url(#light)"/></svg>`;
  const lowerDepth=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><defs><radialGradient id="depth" gradientUnits="userSpaceOnUse" cx="10" cy="505" r="470"><stop offset="0" stop-color="black" stop-opacity=".12"/><stop offset=".57" stop-color="black" stop-opacity=".06"/><stop offset="1" stop-color="black" stop-opacity="0"/></radialGradient></defs><rect width="1024" height="500" fill="url(#depth)"/></svg>`;
  const leftCurve=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><path d="M-92 526A294 294 0 0 1 174 256" fill="none" stroke="white" stroke-opacity=".07" stroke-width="58"/><path d="M-76 524A258 258 0 0 1 156 286" fill="none" stroke="${config.accentLight}" stroke-opacity=".055" stroke-width="18"/></svg>`;
  inlineSvgPart('background-base-v2',backgroundBase,0,0,1024,500,0);
  inlineSvgPart('background-upper-light-v2',upperLight,0,0,1024,500,1,stage,'white',config.backgroundBloomOpacity);
  inlineSvgPart('background-phone-light-v2',phoneLight,0,0,1024,500,2,stage,accent,.72);
  inlineSvgPart('background-lower-depth-v2',lowerDepth,0,0,1024,500,3,stage,'black',config.backgroundDepthOpacity);
  inlineSvgPart('background-left-curve-v3',leftCurve,0,0,1024,500,4,stage,'white',1);
  svgPart('background-edge-curve',845,-38,270,470,4,stage,accent,.25);
  svgPart('floor-light-pool',445,382,560,115,6,stage,accent,.58);
  const floorPath='M8 45 L185 4 Q194 2 205 4 L550 49 Q560 53 549 58 L370 87 Q357 90 346 87 L8 54 Q0 50 8 45 Z';
  const floorFill=`<svg xmlns="http://www.w3.org/2000/svg" width="560" height="90" viewBox="0 0 560 90"><defs><linearGradient id="fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${config.highlight}" stop-opacity=".08"/><stop offset=".5" stop-color="${config.materialLight}" stop-opacity=".32"/><stop offset="1" stop-color="${accent}" stop-opacity=".08"/></linearGradient></defs><path d="${floorPath}" fill="${accent}" fill-opacity=".16"/><path d="${floorPath}" fill="url(#fill)"/></svg>`;
  const floorRim=`<svg xmlns="http://www.w3.org/2000/svg" width="560" height="90" viewBox="0 0 560 90"><defs><linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="white" stop-opacity=".06"/><stop offset=".42" stop-color="white" stop-opacity=".7"/><stop offset=".82" stop-color="white" stop-opacity=".16"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs><path d="${floorPath}" fill="none" stroke="url(#rim)" stroke-width="1.25"/></svg>`;
  inlineSvgPart('floor-plane-fill-v2',floorFill,440,407,560,90,7);
  inlineSvgPart('floor-plane-rim-v2',floorRim,440,407,560,90,8,stage,'white',.64);
  svgPart('floor-contact-shadow',505,422,155,25,9,stage,'black',.44);
  svgPart('floor-contact-shadow',779,435,164,26,9,stage,'black',.4);
  svgPart('floor-contact-shadow',606,447,236,31,9,stage,'black',.56);
  inlineSvgPart('floor-contact-core-rear-left',floorContactCoreSvg(145,14,.64),510,428,145,14,10,stage,'black',.8);
  inlineSvgPart('floor-contact-core-rear-right',floorContactCoreSvg(142,14,.58),790,438,142,14,10,stage,'black',.72);
  inlineSvgPart('floor-contact-core-front',floorContactCoreSvg(214,16,.72),618,454,214,16,10,stage,'black',.9);
  svgPart('floor-reflection-oval',612,439,260,52,10,stage,config.accentLight,.46);
  inlineSvgPart('floor-reflection-patch-left',floorReflectionPatchSvg(72,38),555,427,72,38,10,stage,'white',.48);
  inlineSvgPart('floor-reflection-patch-center',floorReflectionPatchSvg(94,44),690,443,94,44,10,stage,'white',.62);
  inlineSvgPart('floor-reflection-patch-right',floorReflectionPatchSvg(66,31),839,448,66,31,10,stage,'white',.38);
  rasterPart('rear-ribbon',RIBBON_ASSET,915,238,170,203,12,.3);
  device('rear-left',[.608609,-.118302,.118302,.608609,475,158],20,'services');
  device('rear-right',[.6007,.1059,-.1059,.6007,837,134],21,'products');
  device('front',[.875949,.084344,-.084344,.875949,640,46],30,'home');
  tile(513,64,90,-13,'heart-pulse');tile(889,64,82,18,'spark-cluster',true);
  rasterPart('upper-glass-orb',ORB_ASSET,472,104,26,26,41,1);
  rasterPart('lower-glass-orb',ORB_ASSET,473,360,34,34,41,1);
  sparkle(816,34,16);sparkle(985,234,18);sparkle(486,330,9);
  svgPart('light-edge-glint',616,30,46,46,44,stage,'white',.55);
  inlineSvgPart('surface-badge-pill',satinSurfaceSvg(224,36,18),48,59,224,36,49,stage,config.surface,1);
  inlineSvgPart('surface-icon-disc',iconDiscSvg(26),59,64,26,26,50,stage,config.accentLight,1);
  icon('crown-solid',65,70,14,51);
  text(config.featured,98,72,167,15,10.8,800,ink,52,stage,{letterSpacing:'1.25px',whiteSpace:'nowrap'});
  const title=text(config.titlePrefix,48,111,420,76,72,700,'#ffffff',50);title.classList.add('atomic-title','atomic-title-prefix');fitted(title,72,44,false);
  const company=text(renderedName,48,184,448,70,68,800,ink,50);company.classList.add('atomic-title','atomic-company-title');fitted(company,68,22,true);
  const desc=text(config.description,48,254,430,50,18,500,'#ffffff',50,stage,{lineHeight:'1.34'});fitted(desc,18,14,true);
  const widths=[116,129,141],xs=[48,173,311],ids=['phone','stethoscope','box'];
  config.features.forEach((label,i)=>{inlineSvgPart('surface-pill',satinSurfaceSvg(widths[i],36,18),xs[i],315,widths[i],36,49,stage,config.surface,1);icon(ids[i],xs[i]+11,324.5,17,51);const el=text(label,xs[i]+36,326.5,widths[i]-42,16,11.7,650,ink,52);fitted(el,11.7,8.5,false);});
  text(config.previousPrice,56,391,90,32,29,700,config.accentLight,50,stage,{opacity:'.76',letterSpacing:'-1px',textAlign:'center'});
  svgPart('surface-price-strike',54,400,94,14,51,stage,config.materialLight,.9);
  text(config.priceUnit,56,428,90,15,10,700,config.surfaceTop,51,stage,{letterSpacing:'1px',textAlign:'center',opacity:'.9'});
  inlineSvgPart('price-contact-support',priceContactSvg(),156,438,301,25,47,stage,config.shadow,1);
  inlineSvgPart('panel-local-glow',priceGlowSvg(),157,357,299,109,48,stage,config.halo,1);
  inlineSvgPart('surface-price-panel',priceFaceSvg(),169,369,275,85,49,stage,config.surface,1);
  inlineSvgPart('surface-panel-rim',priceRimSvg(),169,369,275,85,50,stage,'white',1);
  inlineSvgPart('surface-now-chip',nowChipSvg(),188,397,72,29,51,stage,accent,1);
  text(config.nowLabel,188,405,72,16,11,800,'#ffffff',52,stage,{letterSpacing:'.7px',textAlign:'center'});
  const price=text(config.currentPrice,276,378,158,53,48,900,ink,52,stage,{letterSpacing:'-2.7px'});fitted(price,48,32,false);
  text(config.priceUnit,276,431,142,15,11.2,800,ink,52,stage,{letterSpacing:'.9px'});
  const action=document.createElement('span');action.className='atomic-action';action.dataset.group='action';action.setAttribute('aria-hidden','true');Object.assign(action.style,{left:'833px',top:'405px',width:'162px',height:'50px'});stage.append(action);
  inlineSvgPart('cta-directional-support',ctaContactSvg(),-14,-8,190,76,0,action,config.shadow,1);
  inlineSvgPart('surface-cta',ctaFaceSvg(),0,0,162,50,1,action,config.surface,1);
  inlineSvgPart('cta-face-highlight',ctaHighlightSvg(),0,0,162,50,2,action,'white',1);
  inlineSvgPart('cta-filled-spark',filledSparkSvg(),18,15,20,20,3,action,ink,1);
  text(config.actionLabel,47,17,91,20,13,800,ink,4,action);icon('chevron-right',141,21,8,4,action);
  scaleStage();
 }
 function scaleStage(){if(stage)stage.style.transform=`scale(${host.getBoundingClientRect().width/1024})`;}
 build();observer=new ResizeObserver(scaleStage);observer.observe(host);
 const instance={update(values){config=cleanConfig(Object.assign({},config,values));build();},destroy(){observer.disconnect();host.replaceChildren();},getLayout(){return JSON.parse(JSON.stringify(layout));},getConfig(){const c={...config};delete c.onAction;return c;}};
 return instance;
}
window.mountAtomicBanner=mountAtomicBanner;
})();
