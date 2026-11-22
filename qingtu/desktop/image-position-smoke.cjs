const {app}=require('electron'),assert=require('node:assert/strict'),path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-image-position-','image-position'),sharp=(await import('sharp')).default;
 assert.ok(s.win.webContents.isOffscreen()&&!s.win.isVisible());assert.equal(s.win.isFocused(),false);
 await s.edit('#stitch-width',600);await s.edit('#stitch-height',240);
 const files=[];for(const [n,background] of ['#ff0000','#00ff00','#0000ff'].entries()){const file=path.join(s.root,`image-${n+1}.png`);await sharp({create:{width:180,height:240,channels:4,background}}).png().toFile(file);files.push(file);}
 await s.importFiles(files);let p=await s.load();const ids=p.images.map(i=>i.id),middle=ids[1],selector=`.stitch-layer[data-image-id="${middle}"]`;
 const scale=()=>s.js("document.querySelector('.stitch-canvas').getBoundingClientRect().width/Number(document.querySelector('#stitch-width').value)");
 await s.click(selector);const before=p.positions[middle],factor=await scale();
 await s.drag('[data-handle=nw]',before.width*.5*factor,before.height*.5*factor);p=await s.load();
 const shrunk=structuredClone(p),small=p.positions[middle];assert.ok(Math.abs(small.height-120)<1);assert.ok(Math.abs(small.y+small.height-p.canvas.height)<1,'shrinking from the top leaves the image at the bottom');
 await s.capture('shrunk-at-bottom.png');
 for(const mode of ['horizontal','grid','vertical']){
  await s.click(`[data-layout="${mode}"]`);await s.ready();
  const snapshot=await s.load(),calls=s.calls();
  await s.click(selector);
  const points=await s.js(`(()=>{
   const area=document.querySelector('.stitch-canvas-area').getBoundingClientRect();
   const canvas=document.querySelector('.stitch-canvas').getBoundingClientRect();
   const layers=[...document.querySelectorAll('.stitch-layer')].map(el=>el.getBoundingClientRect());
   const centers=layers.map(r=>({x:(Math.max(r.left,area.left)+Math.min(r.right,area.right))/2,y:(Math.max(r.top,area.top)+Math.min(r.bottom,area.bottom))/2}));
   for(let y=Math.ceil(Math.max(canvas.top,area.top))+4;y<Math.min(canvas.bottom,area.bottom);y+=6){
    for(let x=Math.ceil(Math.max(canvas.left,area.left))+4;x<Math.min(canvas.right,area.right);x+=6){
     if(layers.every(r=>x<r.left||x>r.right||y<r.top||y>r.bottom))return {centers,empty:{x,y}};
    }
   }
   throw Error('Fixture requires an empty part of the canvas');
  })()`);
  const source=points.centers[snapshot.images.findIndex(image=>image.id===middle)];
  await s.drag(selector,12,8);
  assert.deepEqual((await s.load()).positions,snapshot.positions,mode+' same-slot drag keeps all positions');
  await s.drag(selector,points.empty.x-source.x,points.empty.y-source.y);
  const after=await s.load();
  assert.deepEqual(after.positions,snapshot.positions,mode+' empty drop keeps all positions');
  assert.equal(after.revision,snapshot.revision,mode+' empty and same-slot drops do not save');
  assert.equal(s.calls(),calls,mode+' empty and same-slot drops do not render');
  const [first,,third]=snapshot.images,[a,,c]=points.centers;
  await s.drag(`.stitch-layer[data-image-id="${first.id}"]`,c.x-a.x,c.y-a.y);
  const swapped=await s.load();
  assert.deepEqual(swapped.images.map(image=>image.id),[third.id,middle,first.id],mode+' swaps just the two slots');
  assert.deepEqual(swapped.initialOrder,shrunk.initialOrder);
 }
 await s.click('[data-layout="horizontal"]');await s.ready();
 await s.click('[data-layout="free"]');await s.ready();
 const free=await s.load(),start=free.positions[middle];
 const dy=start.y>20?-20:20;
 await s.drag(selector,0,dy*await scale());
 const moved=await s.load();
 assert.ok(Math.abs(moved.positions[middle].y-start.y-dy)<1,'free drag commits the new position');
 assert.deepEqual(moved.images,free.images);
 const output=await s.save('free-move'),raw=await sharp(output.file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const pose=moved.positions[middle],x=Math.floor(pose.x+pose.width/2),y=Math.floor(pose.y+pose.height/2);
 assert.deepEqual([...raw.data.subarray((y*raw.info.width+x)*4,(y*raw.info.width+x)*4+4)],[0,255,0,255]);
 await s.win.webContents.reload();await s.wait("!!document.querySelector('.stitch-layer')");await s.ready();
 assert.deepEqual((await s.load()).positions,moved.positions);
 await s.finish({passed:true,structuredDragOnlySwaps:true,freeDragPersists:true,exportVerified:true,output});
})().catch(error=>{console.error(error);app.exit(1)});
