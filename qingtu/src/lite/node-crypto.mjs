import {sha256,sha512} from '@noble/hashes/sha2.js';
import {Buffer} from 'buffer';
export const randomUUID=()=>crypto.randomUUID();
export function createHash(algorithm){const state=({sha256,sha512})[algorithm]?.create();if(!state)throw new Error('Unsupported hash');return {update(bytes){state.update(typeof bytes==='string'?new TextEncoder().encode(bytes):bytes);return this;},digest(format){const b=Buffer.from(state.digest());return format?b.toString(format):b;}};}
