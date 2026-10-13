import test from 'node:test';
import assert from 'node:assert/strict';
import {BufferCache} from '../engine/buffer-cache.mjs';
test('encoded cache retains recently reused data while respecting its byte budget',()=>{
 const cache=new BufferCache(10,4),a=Buffer.alloc(6),b=Buffer.alloc(4),c=Buffer.alloc(4);
 cache.set('a',a);cache.set('b',b);assert.equal(cache.get('a'),a);
 cache.set('c',c);
 assert.equal(cache.get('b'),undefined);assert.equal(cache.get('a'),a);assert.equal(cache.get('c'),c);
 assert.equal(cache.bytes,10);
});
test('oversized encoded buffers are returned without retaining them in the cache',()=>{
 const cache=new BufferCache(10,2),large=Buffer.alloc(11);
 assert.equal(cache.set('large',large),large);assert.equal(cache.get('large'),undefined);assert.equal(cache.bytes,0);
});
test('many tiny entries cannot grow the cache beyond its entry limit',()=>{
 const cache=new BufferCache(100,2);
 for(const key of ['a','b','c'])cache.set(key,Buffer.alloc(1));
 assert.equal(cache.get('a'),undefined);assert.ok(cache.get('b'));assert.ok(cache.get('c'));assert.equal(cache.bytes,2);
});
