// Recency and byte limits keep a run of large photos from retaining every preview.
export class PreviewCache {
 constructor(){this.entries=new Map();this.bytes=0;}
 get(key){
  const entry=this.entries.get(key);
  if(entry){this.entries.delete(key);this.entries.set(key,entry);}
  return entry?.value;
 }
 delete(key){
  const entry=this.entries.get(key);
  if(entry){this.bytes-=entry.bytes;this.entries.delete(key);}
 }
 set(key,value,bytes){
  this.delete(key);
  if(bytes>64*1024*1024)return;
  this.entries.set(key,{value,bytes});this.bytes+=bytes;
  while(this.entries.size>12||this.bytes>64*1024*1024)this.delete(this.entries.keys().next().value);
 }
}
