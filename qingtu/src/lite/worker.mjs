import {Buffer} from 'buffer';
import {setNativeTransport} from './native-rpc.mjs';
globalThis.Buffer=Buffer;
const nativePending=new Map();let next=0,service,store,stitching,ready;
setNativeTransport((method,...args)=>new Promise((resolve,reject)=>{const id=++next;nativePending.set(id,{resolve,reject});postMessage({type:'native',id,method,args});}));
async function init(root,platform){
 globalThis.process={platform};
 // Import only after the globals exist: the shared engine is unchanged.
 const [{ImageService},{ProjectStore},{StitchService}]=await Promise.all([import('../../engine/service.mjs'),import('../../engine/project-store.mjs'),import('../../engine/stitch-service.mjs')]);
 service=new ImageService();store=new ProjectStore(root);stitching=new StitchService(store,service);return true;
}
async function call(method,args){
 if(method==='init')return ready=init(...args);await ready;
 if(method==='stitchList')return store.list();if(method==='stitchLoad')return store.load(...args);if(method==='stitchSave')return store.save(...args);
 if(method==='stitchDelete'){stitching.release(args[0]);return store.remove(args[0]);}
 if(method==='stitchImport')return store.import(Buffer.from(args[0].base64,'base64'),args[0].name);
 if(method==='stitchPreviews')return Promise.all(args[0].map(id=>store.preview(id)));
 if(method==='stitchMissing'){const missing=[];for(const id of args[0])try{await store.readAsset(id);}catch(e){if(e.code!=='ENOENT')throw e;missing.push(id);}return missing;}
 if(method==='stitchRender')return stitching.render(...args);if(method==='stitchRelease'){stitching.release(args[0]);return true;}
 if(method==='importFiles'){const result={items:[],errors:[]};for(const f of args[0])try{result.items.push(await service.add(Buffer.from(f.base64,'base64'),f.name));}catch(e){result.errors.push(f.name+'：'+e.message);}return result;}
 if(method==='process')return service.process(...args);if(method==='rename')return service.rename(...args);if(method==='remove'){service.remove(...args);return true;}
 if(method==='save')return service.save(...args);
 if(method==='flush'){await store.flush();await stitching.flush().catch(()=>{});await Promise.all([...service.files.values()].map(f=>f.pending?.catch(()=>{})));return true;}
 throw new Error('不支持的操作');
}
onmessage=async({data:m})=>{
 if(m.type==='nativeResult'){const p=nativePending.get(m.id);if(!p)return;nativePending.delete(m.id);m.error?p.reject(Object.assign(new Error(m.error.message),{code:m.error.code})):p.resolve(m.result);return;}
 try{const result=await call(m.method,m.args);postMessage({type:'result',id:m.id,result});}catch(e){postMessage({type:'result',id:m.id,error:{message:e.message,code:e.code}});}
};
