export function editorPosition(anchor,size,viewport){
 const edge=8;
 return {left:Math.max(edge,Math.min(anchor.x,viewport.width-size.width-edge)),top:Math.max(edge,Math.min(anchor.y,viewport.height-size.height-edge))};
}
