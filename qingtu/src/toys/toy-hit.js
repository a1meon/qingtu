// True when (x, y) in client pixels lands on a drawn part of the toy. The
// artwork box is mostly transparent: only painted pixels (with a few pixels of
// slack for easy grabbing) count, so clicks and drags elsewhere fall through
// to whatever is under the desktop toy window.
export function toyHit(art,x,y,slack=5){
 if(!art)return false;
 const box=art.getBoundingClientRect();
 if(x<box.left-slack||x>box.right+slack||y<box.top-slack||y>box.bottom+slack)return false;
 const canvas=art.shadowRoot?.querySelector('canvas');
 let context=null;
 try{context=canvas?.getContext('2d',{willReadFrequently:true});}catch{}
 if(!context||!canvas.width||!canvas.height)return true;
 const sx=canvas.width/box.width,sy=canvas.height/box.height;
 const cx=Math.round((x-box.left)*sx),cy=Math.round((y-box.top)*sy),r=Math.max(1,Math.round(slack*sx));
 const left=Math.max(0,cx-r),top=Math.max(0,cy-r),right=Math.min(canvas.width,cx+r+1),bottom=Math.min(canvas.height,cy+r+1);
 if(left>=right||top>=bottom)return false;
 try{
  const data=context.getImageData(left,top,right-left,bottom-top).data;
  for(let i=3;i<data.length;i+=4)if(data[i]>32)return true;
  return false;
 }catch{return true;}
}
