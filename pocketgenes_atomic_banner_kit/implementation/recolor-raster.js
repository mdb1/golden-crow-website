(function(){
'use strict';
function parseHex(hex){if(!/^#[0-9a-f]{6}$/i.test(hex))throw new TypeError('Use a six-digit hexadecimal color.');return[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);}
async function recolorMagentaPng(source,hex){
 const target=parseHex(hex);
 let objectUrl=null;
 let image;
 try{
  image=await new Promise((resolve,reject)=>{
   const img=new Image();
   img.crossOrigin='anonymous';
   img.onload=()=>resolve(img);
   img.onerror=()=>reject(new Error('Image failed to load. Use a local file, a same-origin URL, or a CORS-enabled URL.'));
   if(source instanceof Blob){objectUrl=URL.createObjectURL(source);img.src=objectUrl;}
   else if(typeof source==='string')img.src=source;
   else reject(new TypeError('source must be a Blob or image URL.'));
  });
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas 2D is unavailable.');
  ctx.drawImage(image,0,0);
  let pixels;
  try{pixels=ctx.getImageData(0,0,canvas.width,canvas.height);}catch(error){throw new Error('Pixel access is blocked by CORS. Serve the asset from the same origin or upload a local file.');}
  const d=pixels.data;
  for(let i=0;i<d.length;i+=4){
   if(d[i+3]===0)continue;
   const r=d[i],g=d[i+1],b=d[i+2];
   const amplitude=(r+b)/2-g;
   if(amplitude<2||Math.abs(r-b)>4||g>Math.min(r,b))continue;
   d[i]=Math.round(Math.max(0,Math.min(255,g+amplitude*target[0])));
   d[i+1]=Math.round(Math.max(0,Math.min(255,g+amplitude*target[1])));
   d[i+2]=Math.round(Math.max(0,Math.min(255,g+amplitude*target[2])));
  }
  ctx.putImageData(pixels,0,0);
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG export failed.')),'image/png'));
 }finally{if(objectUrl)URL.revokeObjectURL(objectUrl);}
}
window.recolorMagentaPng=recolorMagentaPng;
})();
