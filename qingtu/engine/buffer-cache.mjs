export class BufferCache {
  entries=new Map(); bytes=0;
  constructor(maxBytes=64*1024*1024,maxEntries=256){this.maxBytes=maxBytes;this.maxEntries=maxEntries;}
  get(key){
    const buffer=this.entries.get(key);
    if(buffer){this.entries.delete(key);this.entries.set(key,buffer);}
    return buffer;
  }
  set(key,buffer){
    const previous=this.entries.get(key);
    if(previous){this.bytes-=previous.length;this.entries.delete(key);}
    if(buffer.length>this.maxBytes)return buffer;
    this.entries.set(key,buffer);this.bytes+=buffer.length;
    while(this.bytes>this.maxBytes||this.entries.size>this.maxEntries){
      const oldest=this.entries.keys().next().value;
      this.bytes-=this.entries.get(oldest).length;this.entries.delete(oldest);
    }
    return buffer;
  }
}
