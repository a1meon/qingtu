import {useEffect} from 'react';

export function useSuccessTimeout(notice,setNotice){
 useEffect(()=>{
  if(notice?.type!=='success')return;
  const timer=setTimeout(()=>setNotice(current=>current===notice?null:current),15000);
  return ()=>clearTimeout(timer);
 },[notice,setNotice]);
}
