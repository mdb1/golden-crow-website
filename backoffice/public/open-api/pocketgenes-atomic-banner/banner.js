(function(){
'use strict';
let serial=0;
const defaults={accent:'#ff00ff',companyName:'Tu marca',companyDisplayName:'',titlePrefix:'La app de',description:'Subimos tu propia app al store, exclusiva para tus servicios y productos.',featured:'SERVICIO DESTACADO',features:['App propia','Tus servicios','Tus productos'],previousPrice:'99.99',currentPrice:'59.99',priceUnit:'USD / MES',nowLabel:'AHORA',actionLabel:'Crear mi app',heroEyebrow:'PARA TU COMUNIDAD',heroTitle:'Todo tu mundo,\nen una app',statusTime:'9:41',brandIcon:'heart-pulse',brandLogoUrl:'',servicesTitle:'Mis servicios',productsTitle:'Productos',homeRows:[{icon:'stethoscope',title:'Mis servicios'},{icon:'box',title:'Productos'},{icon:'calendar',title:'Turnos online'},{icon:'megaphone',title:'Novedades'}],servicesRows:[{icon:'dna',title:'Análisis genéticos'},{icon:'heart-pulse',title:'Seguimiento'},{icon:'report',title:'Resultados'}],productRows:[{icon:'box',title:'Kits de salud'},{icon:'capsule',title:'Productos'},{icon:'bell',title:'Novedades'}],onAction:null};
const parser=new DOMParser();
const px=v=>`${v}px`;
function validHex(value){if(!/^#[0-9a-f]{6}$/i.test(value))throw new Error('accent must be a six-digit hexadecimal color such as #ff00ff');return value;}
function mix(color,target,amount){const parts=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));return '#'+parts.map((c,i)=>Math.round(c*(1-amount)+target[i]*amount).toString(16).padStart(2,'0')).join('');}
function cleanConfig(config){const c=Object.assign({},defaults,config);validHex(c.accent);for(const k of ['companyName','companyDisplayName','titlePrefix','description','featured','previousPrice','currentPrice','priceUnit','nowLabel','actionLabel','heroEyebrow','heroTitle','statusTime','brandIcon','brandLogoUrl','servicesTitle','productsTitle'])c[k]=String(c[k]??'');if(!Array.isArray(c.features)||c.features.length!==3)throw new Error('features must contain exactly three labels');for(const [key,count] of [['homeRows',4],['servicesRows',3],['productRows',3]]){if(!Array.isArray(c[key])||c[key].length!==count)throw new Error(`${key} must contain ${count} rows`);c[key]=c[key].map(row=>{const icon=String(row.icon),title=String(row.title??'');if(!window.ATOMIC_ASSETS['icon-'+icon])throw new Error(`Unknown icon ${icon}`);return{icon,title};});}if(!window.ATOMIC_ASSETS['icon-'+c.brandIcon])throw new Error('Unknown brandIcon');return c;}
function mountAtomicBanner(host,initial={}){
 if(typeof host==='string')host=document.querySelector(host);
 if(!(host instanceof HTMLElement))throw new Error('A valid banner host is required');
 let config=cleanConfig(initial),layout=[],observer,stage,ink,uiInk,accent,renderedName;
 host.classList.add('atomic-host');
 function svgPart(id,x,y,w,h,z,parent=stage,color='var(--accent)',opacity=1,rotation=0){
  const data=window.ATOMIC_ASSETS[id];if(!data)throw new Error(`Unknown atomic component: ${id}`);
  const node=document.createElement('span');node.className='atomic-part';node.dataset.part=id;
  Object.assign(node.style,{left:px(x),top:px(y),width:px(w),height:px(h),zIndex:String(z),color,opacity:String(opacity)});
  if(rotation)node.style.transform=`rotate(${rotation}deg)`;
  const doc=parser.parseFromString(data.svgSource,'image/svg+xml');
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
 function orb(x,y,s,z){svgPart('orb-halo',x-s*.1,y-s*.1,s*1.2,s*1.2,z,stage,accent,.55);svgPart('orb-diffuse',x,y,s,s,z+1);svgPart('orb-rim',x,y,s,s,z+2);svgPart('orb-specular',x,y,s,s,z+3);}
 function sparkle(x,y,s){svgPart('sparkle-soft-glow',x-s/2,y-s/2,s*2,s*2,44);svgPart('sparkle-rounded-cross',x,y,s,s,45);}
 function tile(x,y,size,rotation,glyph,neutral=false){
  const node=document.createElement('div');node.dataset.group=neutral?'floating-tile-neutral':'floating-tile-accent';
  Object.assign(node.style,{position:'absolute',left:px(x),top:px(y),width:'120px',height:'120px',zIndex:'45',transform:`rotate(${rotation}deg) scale(${size/120})`,transformOrigin:'50% 50%'});stage.append(node);
  svgPart('tile-shadow',-12,-12,144,144,0,node,'black',.65);
  svgPart('tile-extrusion',0,0,120,120,1,node,neutral?'#f0f3ed':accent);
  svgPart(neutral?'tile-face-neutral':'tile-face',0,0,120,120,2,node);
  svgPart('tile-specular',0,0,120,120,3,node);
  if(neutral)icon(glyph,27,27,56,4,node,ink);else brandMark(node,27,27,56,4,'white');
  layout.push({kind:'group',id:node.dataset.group,x,y,width:120,height:120,scale:size/120,rotation,z:45,transformOrigin:'50% 50%'});
 }
 function uiRow(node,y,glyph,label,width=184){
  svgPart('shadow-ui-row',16,y-7,204,72,8,node,'black',.75);
  svgPart('surface-ui-row',26,y,width,48,9,node);
  svgPart('surface-icon-chip',34,y+9,28,28,10,node);
  icon(glyph,40,y+15,16,11,node,uiInk);
  const rowLabel=text(label,70,y+12,111,14,8.7,700,'#121c18',12,node);fitted(rowLabel,8.7,6,false);
  svgPart('surface-status-line',70,y+29,64,3.6,11,node);
  icon('chevron-right',191,y+18,8,12,node,accent);
 }
 function device(id,x,y,scale,rotation,z,type){
  const node=document.createElement('div');node.className='atomic-device';node.dataset.group=id;
  Object.assign(node.style,{left:px(x),top:px(y),zIndex:String(z),transform:`rotate(${rotation}deg) scale(${scale})`});stage.append(node);
  layout.push({kind:'group',id,x,y,width:240,height:450,scale,rotation,z,transformOrigin:'0 0'});
  svgPart('device-occlusion-shadow',-20,-12,280,480,0,node,'black',.6);
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
  svgPart('surface-navigation-bar',26,388,184,30,12,node);
  icon('heart-pulse',46,396,15,13,node,accent);icon('box',108,396,15,13,node,'#9babb2');icon('users',167,396,15,13,node,'#9babb2');
  svgPart('device-home-indicator',80,421,76,3.3,15,node,'#11191a');
  if(type==='home'){
   svgPart('tile-face',26,55,24,24,12,node);
   brandMark(node,31,61,12,13,'white');
   const name=text(renderedName,52,61,130,17,9,800,'#0e1616',13,node);fitted(name,9,5.5,false);
   svgPart('surface-icon-disc',188,56,20,20,12,node,'#82918a',.3);icon('bell',193,61,10,13,node,ink);
   svgPart('shadow-ui-row',17,83,202,93,8,node,'black',.6);
   svgPart('surface-ui-feature',26,88,184,74,10,node);
   svgPart('surface-ui-feature-pattern',26,88,184,74,11,node);
   text(config.heroEyebrow,37,99,140,9,5.6,700,'white',12,node,{letterSpacing:'1px'});
   text(config.heroTitle,37,113,148,36,12.7,800,'white',12,node,{lineHeight:'1.04'});
   icon('crown-outline',180,136,20,13,node,'white');
   config.homeRows.forEach((row,i)=>uiRow(node,173+i*52,row.icon,row.title));
  }else{
   icon('arrow-back',30,63,14,13,node,'#11191a');text(type==='services'?config.servicesTitle:config.productsTitle,52,64,130,18,11.7,800,'#11191a',13,node);
   icon('search',192,64,13,13,node,'#11191a');
   const rows=type==='services'?config.servicesRows:config.productRows;
   rows.forEach((r,i)=>uiRow(node,102+i*62,r.icon,r.title));
  }
  svgPart('device-screen-reflection',0,0,240,450,18,node,'white',.35);
  svgPart('device-rim-highlight',0,0,240,450,19,node);
 }
 function build(){
  layout=[];accent=config.accent;ink=mix(accent,[0,8,5],.91);uiInk=mix(accent,[0,20,10],.70);renderedName=config.companyDisplayName.trim()||config.companyName.trim()||'Tu marca';
  host.replaceChildren();stage=document.createElement('div');stage.className='atomic-artboard';stage.dataset.group='banner';stage.style.setProperty('--accent',accent);stage.style.setProperty('--ink',ink);host.append(stage);
  svgPart('background-base',0,0,1024,500,0);
  svgPart('background-depth',0,0,1024,500,1);
  svgPart('background-corner-shade',0,60,700,440,2,stage,'black',.65);
  svgPart('background-bloom',260,-110,720,480,3,stage,'white',.65);
  svgPart('background-edge-curve',845,-38,270,470,4,stage,accent,.66);
  svgPart('background-bottom-wave',40,400,940,130,4,stage,'white',.6);
  svgPart('background-corner-arc',-180,310,320,320,4,stage,'white',.6);
  svgPart('floor-light-pool',430,368,610,160,6,stage,accent,.85);
  svgPart('floor-platform-fill',437,376,580,145,7,stage,accent,.95);
  svgPart('floor-platform-rim',437,376,580,145,8,stage,'white',.65);
  svgPart('floor-contact-shadow',500,409,470,90,9,stage,'black',.55);
  svgPart('floor-reflection-streak',560,421,72,95,10,stage,'white',.65);
  svgPart('floor-reflection-streak',742,432,60,72,10,stage,'white',.8);
  svgPart('floor-reflection-oval',655,451,246,47,10,stage,accent,.7);
  svgPart('ribbon-fill',880,210,150,260,11,stage,accent,.6);
  svgPart('ribbon-highlight',880,210,150,260,12,stage,'white',.75);
  device('rear-left',468,152,.79,-10,20,'services');
  device('rear-right',813,122,.76,10,21,'products');
  device('front',635,45,.91,5,30,'home');
  tile(500,51,80,-15,'heart-pulse');tile(891,42,77,16,'spark-cluster',true);
  orb(466,106,32,40);orb(462,356,47,41);orb(984,355,23,42);
  sparkle(819,33,15);sparkle(981,237,15);sparkle(480,330,9);
  svgPart('light-edge-glint',618,29,53,53,44,stage,'white',.75);
  svgPart('light-soft-spot',737,434,46,46,44,stage,'white',.5);
  svgPart('surface-badge-pill',48,59,226,36,49);
  svgPart('surface-icon-disc',59,64,26,26,50);
  icon('crown-solid',65,70,14,51);
  text(config.featured,99,71,166,16,12.4,800,ink,52,stage,{letterSpacing:'1.5px',whiteSpace:'nowrap'});
  const title=text(config.titlePrefix,46,113,414,82,70,900,'#ffffff',50);title.classList.add('atomic-title');fitted(title,70,45,false);
  const company=text(renderedName,47,188,421,59,54,900,ink,50);company.classList.add('atomic-title');fitted(company,54,24,true);
  const desc=text(config.description,48,258,420,48,18,500,'#ffffff',50,stage,{lineHeight:'1.35'});fitted(desc,18,14,true);
  const widths=[119,134,142],xs=[48,175,317],ids=['phone','stethoscope','box'];
  config.features.forEach((label,i)=>{svgPart('surface-pill',xs[i],316,widths[i],37,49);icon(ids[i],xs[i]+12,326,16,51);const el=text(label,xs[i]+37,328,widths[i]-44,15,12,700,ink,52);fitted(el,12,9,false);});
  text(config.previousPrice,61,389,99,35,31,700,'#ffffff',50,stage,{opacity:'.74',letterSpacing:'-1px'});
  svgPart('surface-price-strike',57,399,100,16,51,stage,mix(accent,[255,255,255],.55));
  text(config.priceUnit,64,430,94,16,10.3,700,'#ffffff',51,stage,{letterSpacing:'1px',textAlign:'center',opacity:'.85'});
  svgPart('panel-local-glow',133,343,350,144,47,stage,accent,.55);
  svgPart('shadow-panel',148,354,320,124,48,stage,'black',.35);
  svgPart('surface-price-panel',169,369,278,88,49);
  svgPart('surface-panel-rim',169,369,278,88,50);
  svgPart('surface-now-chip',187,397,72,28,51);
  text(config.nowLabel,187,405,72,16,11.7,800,'#ffffff',52,stage,{letterSpacing:'.6px',textAlign:'center'});
  const price=text(config.currentPrice,273,378,163,58,53,900,ink,52,stage,{letterSpacing:'-2.3px'});fitted(price,53,32,false);
  text(config.priceUnit,278,434,140,15,11.4,800,ink,52,stage,{letterSpacing:'.9px'});
  const action=document.createElement('span');action.className='atomic-action';action.dataset.group='action';action.setAttribute('aria-hidden','true');Object.assign(action.style,{left:'832px',top:'405px',width:'164px',height:'48px'});stage.append(action);
  svgPart('surface-cta',0,0,164,48,0,action);icon('spark-cluster',18,15,20,1,action);text(config.actionLabel,46,17,98,20,13.1,800,ink,2,action);icon('chevron-right',142,19,10,2,action);
  scaleStage();
 }
 function scaleStage(){if(stage)stage.style.transform=`scale(${host.getBoundingClientRect().width/1024})`;}
 build();observer=new ResizeObserver(scaleStage);observer.observe(host);
 const instance={update(values){config=cleanConfig(Object.assign({},config,values));build();},destroy(){observer.disconnect();host.replaceChildren();},getLayout(){return JSON.parse(JSON.stringify(layout));},getConfig(){const c={...config};delete c.onAction;return c;}};
 return instance;
}
window.mountAtomicBanner=mountAtomicBanner;
})();
