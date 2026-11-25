import {useEffect,useRef} from 'react';

export function Filmstrip({className='',children,...props}){
 const ref=useRef(null);
 useEffect(()=>{
  const strip=ref.current;
  function wheel(event){
   if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey||
      Math.abs(event.deltaY)<=Math.abs(event.deltaX))return;
   const limit=strip.scrollWidth-strip.clientWidth;
   const direction=event.deltaY;
   if(limit<=0||direction<0&&strip.scrollLeft<=0||direction>0&&strip.scrollLeft>=limit)return;
   const unit=event.deltaMode===1?24:event.deltaMode===2?strip.clientWidth:1;
   event.preventDefault();
   strip.scrollLeft+=direction*unit;
  }
  strip.addEventListener('wheel',wheel,{passive:false});
  return ()=>strip.removeEventListener('wheel',wheel);
 },[]);
 return <div ref={ref} className={`filmstrip ${className}`} {...props}>{children}</div>;
}
