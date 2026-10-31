(function(){
'use strict';
let serial=0;
const defaults={accent:'#ff00ff',companyName:'Tu marca',companyDisplayName:'',titlePrefix:'La app de',description:'Subimos tu propia app al store, exclusiva para tus servicios y productos.',featured:'SERVICIO DESTACADO',features:['App propia','Tus servicios','Tus productos'],previousPrice:'99.99',currentPrice:'59.99',priceUnit:'USD / MES',nowLabel:'AHORA',actionLabel:'Crear mi app',heroEyebrow:'PARA TU COMUNIDAD',heroTitle:'Todo tu mundo,\nen una app',statusTime:'9:41',brandIcon:'heart-pulse',brandLogoUrl:'',servicesTitle:'Mis servicios',productsTitle:'Productos',backgroundDepthOpacity:1,cornerShadeOpacity:.65,backgroundBloomOpacity:.65,backgroundDeep:'#30001f',backgroundMid:'#9c0065',materialLight:'#ff79d2',surface:'#fff7fc',highlight:'#ffffff',shadow:'#190010',homeRows:[{icon:'stethoscope',title:'Mis servicios'},{icon:'box',title:'Productos'},{icon:'calendar',title:'Turnos online'},{icon:'megaphone',title:'Novedades'}],servicesRows:[{icon:'dna',title:'Análisis genéticos'},{icon:'heart-pulse',title:'Seguimiento'},{icon:'report',title:'Resultados'}],productRows:[{icon:'box',title:'Kits de salud'},{icon:'capsule',title:'Productos'},{icon:'bell',title:'Novedades'}],onAction:null};
const ORB_ASSET='/open-api/pocketgenes-atomic-banner/glossy-magenta-glass-orb.png';
const RIBBON_ASSET='/open-api/pocketgenes-atomic-banner/glossy-magenta-ribbon-swirl.png';
const recoloredRasterCache=new Map();
const parser=new DOMParser();
const px=v=>`${v}px`;
function validHex(value){if(!/^#[0-9a-f]{6}$/i.test(value))throw new Error('accent must be a six-digit hexadecimal color such as #ff00ff');return value;}
function mix(color,target,amount){const parts=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));return '#'+parts.map((c,i)=>Math.round(c*(1-amount)+target[i]*amount).toString(16).padStart(2,'0')).join('');}
function cleanConfig(config){const c=Object.assign({},defaults,config);for(const k of ['accent','backgroundDeep','backgroundMid','materialLight','surface','highlight','shadow'])validHex(c[k]);for(const k of ['companyName','companyDisplayName','titlePrefix','description','featured','previousPrice','currentPrice','priceUnit','nowLabel','actionLabel','heroEyebrow','heroTitle','statusTime','brandIcon','brandLogoUrl','servicesTitle','productsTitle'])c[k]=String(c[k]??'');for(const k of ['backgroundDepthOpacity','cornerShadeOpacity','backgroundBloomOpacity']){c[k]=Number(c[k]);if(!Number.isFinite(c[k])||c[k]<0||c[k]>1)throw new Error(`${k} must be between 0 and 1`);}if(!Array.isArray(c.features)||c.features.length!==3)throw new Error('features must contain exactly three labels');for(const [key,count] of [['homeRows',4],['servicesRows',3],['productRows',3]]){if(!Array.isArray(c[key])||c[key].length!==count)throw new Error(`${key} must contain ${count} rows`);c[key]=c[key].map(row=>{const icon=String(row.icon),title=String(row.title??'');if(!window.ATOMIC_ASSETS['icon-'+icon])throw new Error(`Unknown icon ${icon}`);return{icon,title};});}if(!window.ATOMIC_ASSETS['icon-'+c.brandIcon])throw new Error('Unknown brandIcon');return c;}
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
 function tile(x,y,size,rotation,glyph,neutral=false){
  const node=document.createElement('div');node.dataset.group=neutral?'floating-tile-neutral':'floating-tile-accent';
  Object.assign(node.style,{position:'absolute',left:px(x),top:px(y),width:'120px',height:'120px',zIndex:'45',transform:`rotate(${rotation}deg) scale(${size/120})`,transformOrigin:'50% 50%'});stage.append(node);
  svgPart('tile-shadow',-12,-12,144,144,0,node,'black',.48);
  svgPart('tile-extrusion',0,0,120,120,1,node,neutral?'#e8ece7':config.backgroundMid);
  svgPart(neutral?'tile-face-neutral':'tile-face',0,0,120,120,2,node);
  svgPart('tile-specular',0,0,120,120,3,node,config.highlight,.88);
  if(neutral)icon(glyph,27,27,56,4,node,ink);else brandMark(node,27,27,56,4,'white');
  layout.push({kind:'group',id:node.dataset.group,x,y,width:120,height:120,scale:size/120,rotation,z:45,transformOrigin:'50% 50%'});
 }
 function uiRow(node,y,glyph,label,x=28,width=178,height=44){
  svgPart('shadow-ui-row',x-8,y-5,width+16,height+14,8,node,'black',.45);
  svgPart('surface-ui-row',x,y,width,height,9,node,config.surface);
  svgPart('surface-icon-chip',x+7,y+10,24,24,10,node,config.materialLight);
  icon(glyph,x+12,y+15,14,11,node,uiInk);
  const rowLabel=text(label,x+40,y+9,width-61,15,10.4,700,'#121c18',12,node);fitted(rowLabel,10.4,7,false);
  svgPart('surface-status-line',x+40,y+27,55,3.2,11,node,config.materialLight,.8);
  icon('chevron-right',x+width-13,y+16,7,12,node,accent);
 }
 function device(id,matrix,z,type){
  const node=document.createElement('div');node.className='atomic-device';node.dataset.group=id;
  Object.assign(node.style,{left:'0',top:'0',zIndex:String(z),transform:`matrix(${matrix.join(',')})`});stage.append(node);
  layout.push({kind:'group',id,width:240,height:450,matrix:[...matrix],z,transformOrigin:'0 0'});
  svgPart('device-occlusion-shadow',-20,-12,280,480,0,node,'black',id==='front'?.66:.3);
  for(const [i,a] of ['device-casing-depth','device-frame-metal','device-bezel','device-screen-base'].entries())svgPart(a,0,0,240,450,1+i,node);
  svgPart('device-volume-keys',0,0,240,450,6,node);
  svgPart('device-power-key',0,0,240,450,6,node);
  svgPart('device-camera-island',82,23,64,18,14,node);
  svgPart('device-earpiece',95,30,25,4,15,node);
  svgPart('device-camera-lens',130,28,8,8,15,node);
  text(config.statusTime,29,27,27,12,7.3,700,'#0d1514',15,node);
  svgPart('status-cellular',176,29,11,7,15,node,'#11191a');
  svgPart('status-wifi',189,29,10,7,15,node,'#11191a');
  svgPart('status-battery',201,29,11,6,15,node,'#11191a');
  svgPart('surface-navigation-bar',26,397,182,25,12,node,config.surface);
  icon('heart-pulse',47,402,14,13,node,accent);icon('box',108,402,14,13,node,'#9babb2');icon('users',168,402,14,13,node,'#9babb2');
  svgPart('device-home-indicator',82,424,72,3,15,node,'#11191a');
  if(type==='home'){
   svgPart('tile-face',26,55,24,24,12,node);
   brandMark(node,31,61,12,13,'white');
   const name=text(renderedName,52,61,130,17,9,800,'#0e1616',13,node);fitted(name,9,5.5,false);
   svgPart('surface-icon-disc',188,56,20,20,12,node,'#82918a',.3);icon('bell',193,61,10,13,node,ink);
   svgPart('shadow-ui-row',20,84,196,96,8,node,'black',.46);
   svgPart('surface-ui-feature',28,91,178,81,10,node);
   svgPart('surface-ui-feature-pattern',28,91,178,81,11,node);
   text(config.heroEyebrow,39,102,137,9,5.8,700,'white',12,node,{letterSpacing:'1px'});
   text(config.heroTitle,39,118,142,39,13.4,800,'white',12,node,{lineHeight:'1.02'});
   icon('crown-outline',176,142,21,13,node,'white');
   config.homeRows.forEach((row,i)=>uiRow(node,183+i*54,row.icon,row.title));
  }else{
   icon('arrow-back',30,63,14,13,node,'#11191a');text(type==='services'?config.servicesTitle:config.productsTitle,52,64,130,18,11.7,800,'#11191a',13,node);
   icon('search',192,64,13,13,node,'#11191a');
   const rows=type==='services'?config.servicesRows:config.productRows;
   rows.forEach((r,i)=>uiRow(node,104+i*62,r.icon,r.title,28,178,44));
  }
  svgPart('device-screen-reflection',0,0,240,450,18,node,'white',.08);
  svgPart('device-rim-highlight',0,0,240,450,19,node,'white',id==='front'?.92:.58);
 }
 function build(){
  layout=[];accent=config.accent;ink=config.shadow;uiInk=mix(accent,[0,20,10],.7);renderedName=config.companyDisplayName.trim()||config.companyName.trim()||'Tu marca';
  host.replaceChildren();stage=document.createElement('div');stage.className='atomic-artboard';stage.dataset.group='banner';stage.style.setProperty('--accent',accent);stage.style.setProperty('--ink',ink);stage.style.setProperty('--surface',config.surface);host.append(stage);
  const backgroundBase=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><defs><linearGradient id="base" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${config.backgroundDeep}"/><stop offset=".45" stop-color="${config.backgroundMid}"/><stop offset="1" stop-color="${mix(accent,[0,0,0],.12)}"/></linearGradient></defs><rect width="1024" height="500" fill="url(#base)"/></svg>`;
  const upperLight=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><defs><radialGradient id="light" gradientUnits="userSpaceOnUse" cx="570" cy="115" r="455"><stop offset="0" stop-color="${config.highlight}" stop-opacity=".58"/><stop offset=".34" stop-color="${config.materialLight}" stop-opacity=".28"/><stop offset="1" stop-color="${config.materialLight}" stop-opacity="0"/></radialGradient></defs><rect width="1024" height="500" fill="url(#light)"/></svg>`;
  const phoneLight=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><defs><radialGradient id="light" gradientUnits="userSpaceOnUse" cx="760" cy="265" r="315"><stop offset="0" stop-color="${config.materialLight}" stop-opacity=".46"/><stop offset=".48" stop-color="${accent}" stop-opacity=".16"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs><rect width="1024" height="500" fill="url(#light)"/></svg>`;
  const lowerDepth=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><defs><radialGradient id="depth" gradientUnits="userSpaceOnUse" cx="20" cy="500" r="455"><stop offset="0" stop-color="black" stop-opacity=".74"/><stop offset=".58" stop-color="black" stop-opacity=".18"/><stop offset="1" stop-color="black" stop-opacity="0"/></radialGradient></defs><rect width="1024" height="500" fill="url(#depth)"/></svg>`;
  inlineSvgPart('background-base-v2',backgroundBase,0,0,1024,500,0);
  inlineSvgPart('background-upper-light-v2',upperLight,0,0,1024,500,1,stage,'white',config.backgroundBloomOpacity);
  inlineSvgPart('background-phone-light-v2',phoneLight,0,0,1024,500,2,stage,accent,.72);
  inlineSvgPart('background-lower-depth-v2',lowerDepth,0,0,1024,500,3,stage,'black',config.backgroundDepthOpacity);
  svgPart('background-edge-curve',845,-38,270,470,4,stage,accent,.38);
  svgPart('background-corner-arc',-180,310,320,320,4,stage,'white',.28);
  svgPart('floor-light-pool',445,382,560,115,6,stage,accent,.68);
  const floorPath='M8 45 L185 4 Q194 2 205 4 L550 49 Q560 53 549 58 L370 87 Q357 90 346 87 L8 54 Q0 50 8 45 Z';
  const floorFill=`<svg xmlns="http://www.w3.org/2000/svg" width="560" height="90" viewBox="0 0 560 90"><defs><linearGradient id="fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${config.highlight}" stop-opacity=".08"/><stop offset=".5" stop-color="${config.materialLight}" stop-opacity=".32"/><stop offset="1" stop-color="${accent}" stop-opacity=".08"/></linearGradient></defs><path d="${floorPath}" fill="${accent}" fill-opacity=".16"/><path d="${floorPath}" fill="url(#fill)"/></svg>`;
  const floorRim=`<svg xmlns="http://www.w3.org/2000/svg" width="560" height="90" viewBox="0 0 560 90"><defs><linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="white" stop-opacity=".06"/><stop offset=".42" stop-color="white" stop-opacity=".7"/><stop offset=".82" stop-color="white" stop-opacity=".16"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs><path d="${floorPath}" fill="none" stroke="url(#rim)" stroke-width="1.25"/></svg>`;
  inlineSvgPart('floor-plane-fill-v2',floorFill,440,407,560,90,7);
  inlineSvgPart('floor-plane-rim-v2',floorRim,440,407,560,90,8,stage,'white',.82);
  svgPart('floor-contact-shadow',505,422,155,25,9,stage,'black',.44);
  svgPart('floor-contact-shadow',779,435,164,26,9,stage,'black',.4);
  svgPart('floor-contact-shadow',606,447,236,31,9,stage,'black',.56);
  svgPart('floor-reflection-streak',568,420,45,58,10,stage,'white',.42);
  svgPart('floor-reflection-streak',742,437,42,47,10,stage,'white',.5);
  rasterPart('rear-ribbon',RIBBON_ASSET,915,238,170,203,12,.3);
  device('rear-left',[.608609,-.118302,.118302,.608609,475,158],20,'services');
  device('rear-right',[.649973,.114608,-.114608,.649973,828,126],21,'products');
  device('front',[.875949,.084344,-.084344,.875949,640,46],30,'home');
  tile(513,64,90,-13,'heart-pulse');tile(889,64,82,18,'spark-cluster',true);
  rasterPart('upper-glass-orb',ORB_ASSET,472,104,26,26,41,1);
  rasterPart('lower-glass-orb',ORB_ASSET,473,360,34,34,41,1);
  sparkle(816,34,16);sparkle(985,234,18);sparkle(486,330,9);
  svgPart('light-edge-glint',616,30,46,46,44,stage,'white',.55);
  svgPart('surface-badge-pill',48,59,224,36,49,stage,config.surface);
  svgPart('surface-icon-disc',59,64,26,26,50,stage,config.materialLight,.85);
  icon('crown-solid',65,70,14,51);
  text(config.featured,99,71,166,16,12.4,800,ink,52,stage,{letterSpacing:'1.5px',whiteSpace:'nowrap'});
  const title=text(config.titlePrefix,48,111,420,76,68,900,'#ffffff',50);title.classList.add('atomic-title');fitted(title,68,44,false);
  const company=text(renderedName,48,184,420,60,54,900,ink,50);company.classList.add('atomic-title');fitted(company,54,22,true);
  const desc=text(config.description,48,254,430,50,18,500,'#ffffff',50,stage,{lineHeight:'1.34'});fitted(desc,18,14,true);
  const widths=[116,129,141],xs=[48,173,311],ids=['phone','stethoscope','box'];
  config.features.forEach((label,i)=>{svgPart('surface-pill',xs[i],315,widths[i],36,49,stage,config.surface);icon(ids[i],xs[i]+11,325,16,51);const el=text(label,xs[i]+36,327,widths[i]-42,15,11.5,700,ink,52);fitted(el,11.5,8.5,false);});
  text(config.previousPrice,56,391,90,32,29,700,'#ffffff',50,stage,{opacity:'.72',letterSpacing:'-1px',textAlign:'center'});
  svgPart('surface-price-strike',54,400,94,14,51,stage,config.materialLight,.9);
  text(config.priceUnit,56,428,90,15,10,700,'#ffffff',51,stage,{letterSpacing:'1px',textAlign:'center',opacity:'.86'});
  svgPart('panel-local-glow',150,354,312,116,47,stage,accent,.25);
  svgPart('shadow-panel',154,360,304,108,48,stage,'black',.24);
  svgPart('surface-price-panel',169,369,275,86,49,stage,config.surface);
  svgPart('surface-panel-rim',169,369,275,86,50,stage,'white',.62);
  svgPart('surface-now-chip',184,396,72,28,51);
  text(config.nowLabel,184,404,72,16,11.5,800,'#ffffff',52,stage,{letterSpacing:'.6px',textAlign:'center'});
  const price=text(config.currentPrice,270,378,163,56,52,900,ink,52,stage,{letterSpacing:'-2.2px'});fitted(price,52,32,false);
  text(config.priceUnit,276,431,142,15,11.2,800,ink,52,stage,{letterSpacing:'.9px'});
  const action=document.createElement('span');action.className='atomic-action';action.dataset.group='action';action.setAttribute('aria-hidden','true');Object.assign(action.style,{left:'833px',top:'405px',width:'162px',height:'50px'});stage.append(action);
  svgPart('surface-cta',0,0,162,50,0,action,config.surface);icon('spark-cluster',18,15,20,1,action);text(config.actionLabel,46,18,96,20,13,800,ink,2,action);icon('chevron-right',140,20,10,2,action);
  scaleStage();
 }
 function scaleStage(){if(stage)stage.style.transform=`scale(${host.getBoundingClientRect().width/1024})`;}
 build();observer=new ResizeObserver(scaleStage);observer.observe(host);
 const instance={update(values){config=cleanConfig(Object.assign({},config,values));build();},destroy(){observer.disconnect();host.replaceChildren();},getLayout(){return JSON.parse(JSON.stringify(layout));},getConfig(){const c={...config};delete c.onAction;return c;}};
 return instance;
}
window.mountAtomicBanner=mountAtomicBanner;
})();
