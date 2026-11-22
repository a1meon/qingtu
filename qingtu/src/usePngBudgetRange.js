import {useEffect,useState} from 'react';
import {pngSizeFloorKB,practicalPngMinimumKB} from '../engine/indexed-png.mjs';

// Only measure marginal budgets. Most edits need no compression or allocation
// on the UI thread. Ignore obsolete measurements after changing dimensions.
export function usePngBudgetRange(sizes,targetBytes){
 const keys=[...new Set(sizes.filter(({width,height})=>Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0&&width*height<=100000000)
  .map(({width,height})=>width+'x'+height))].sort();
 const key=keys.join(','),[measured,setMeasured]=useState(null);
 const tight=keys.some(size=>{
  const [w,h]=size.split('x').map(Number);
  return targetBytes<320+(Math.ceil(w/8)+1)*h/32;
 });
 useEffect(()=>{
  if(!tight||!key)return;
  let live=true;
  const timer=setTimeout(async()=>{
   let minimum=1;
   for(const size of key.split(',')){
    if(!live)return;
    const [w,h]=size.split('x').map(Number);
    try{minimum=Math.max(minimum,await practicalPngMinimumKB(w,h));}
    catch{minimum=Math.max(minimum,pngSizeFloorKB(w,h));}
   }
   if(live)setMeasured({key,minimum});
  },100);
  return()=>{live=false;clearTimeout(timer);};
 },[key,tight]);
 const floor=keys.reduce((kb,size)=>{
  const [w,h]=size.split('x').map(Number);return Math.max(kb,pngSizeFloorKB(w,h));
 },1);
 const minimum=measured?.key===key?measured.minimum:floor;
 return {minimum,message:targetBytes>0&&minimum*1000>targetBytes?`此尺寸的 PNG 大小上限从 ${minimum} KB 起`:'',checking:tight&&measured?.key!==key};
}
