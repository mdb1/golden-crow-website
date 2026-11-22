(function(){
'use strict';
let nextId=0;
function library(){if(!window.ATOMIC_ASSETS)throw new Error('Load asset-library.js before components.js');return window.ATOMIC_ASSETS;}
function finite(value,name){if(!Number.isFinite(value))throw new TypeError(`${name} must be a finite number`);return value;}
function createAtomicGraphic(id,options={}){
 const asset=library()[id];if(!asset)throw new Error(`Unknown component: ${id}`);
 const color=options.color??'#ff00ff';
 const doc=new DOMParser().parseFromString(asset.svgSource,'image/svg+xml');
 const svg=doc.documentElement;
 const prefix=`atomic${++nextId}_`;
 svg.removeAttribute('style');svg.style.color=color;
 for(const node of svg.querySelectorAll('[id]'))node.id=prefix+node.id;
 for(const node of [svg,...svg.querySelectorAll('*')])for(const attribute of [...node.attributes]){
  const value=attribute.value.replace(/url\(#([^)]*)\)/g,(_,name)=>`url(#${prefix+name})`);
  if(value!==attribute.value)node.setAttribute(attribute.name,value);
 }
 svg.style.display='block';svg.style.width='100%';svg.style.height='100%';svg.style.overflow='visible';
 svg.setAttribute('aria-hidden','true');
 return svg;
}
function mountAtomicPart(parent,id,options={}){
 if(typeof parent==='string')parent=document.querySelector(parent);
 if(!(parent instanceof Element))throw new TypeError('parent must be an Element or matching selector');
 const asset=library()[id];if(!asset)throw new Error(`Unknown component: ${id}`);
 const width=finite(options.width??asset.width,'width'),height=finite(options.height??asset.height,'height');
 if(width<=0||height<=0)throw new RangeError('width and height must be positive');
 const wrapper=document.createElement('span');wrapper.dataset.component=id;
 Object.assign(wrapper.style,{position:options.position??'absolute',left:`${finite(options.x??0,'x')}px`,top:`${finite(options.y??0,'y')}px`,width:`${width}px`,height:`${height}px`,zIndex:String(options.zIndex??0),opacity:String(Math.max(0,Math.min(1,options.opacity??1))),pointerEvents:'none',display:'block'});
 if(options.rotation)wrapper.style.transform=`rotate(${finite(options.rotation,'rotation')}deg)`;
 wrapper.append(createAtomicGraphic(id,options));parent.append(wrapper);return wrapper;
}
window.createAtomicGraphic=createAtomicGraphic;
window.mountAtomicPart=mountAtomicPart;
})();
