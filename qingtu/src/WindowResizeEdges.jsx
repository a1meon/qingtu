export function WindowResizeEdges(){
 if(window.qingtu?.windowChrome!=='custom-win')return null;
 return <div className="window-resize-edges" aria-hidden="true">{['n','s','e','w','nw','ne','sw','se'].map(edge=><div key={edge} className={`window-resize-edge edge-${edge}`} data-window-edge={edge} onPointerDown={event=>{
  if(event.button!==0||!event.isPrimary)return;
  event.preventDefault();event.stopPropagation();
  window.qingtu.beginWindowResize(edge).catch(console.error);
 }}/>)}</div>;
}
