import {Buffer} from 'buffer';
import {native} from './native-rpc.mjs';
const encoded=data=>Buffer.from(data).toString('base64');
export default {
 async readFile(path,encoding){const b=Buffer.from(await native('readFile',path),'base64');return encoding?b.toString(encoding):b;},
 writeFile:(p,b,o={})=>native('writeFile',p,encoded(b),o.flag||'w'),
 mkdir:p=>native('mkdir',p),access:p=>native('access',p),stat:p=>native('stat',p),
 readdir:p=>native('readdir',p),rm:(p,o={})=>native('rm',p,!!o.force),rename:(a,b)=>native('rename',a,b),
 async open(p,flags){const id=await native('open',p,flags);return {writeFile:b=>native('handleWrite',id,encoded(b)),sync:()=>native('handleSync',id),close:()=>native('handleClose',id)};}
};
