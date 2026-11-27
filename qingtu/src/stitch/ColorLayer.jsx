import {useEffect, useMemo, useRef, useState} from 'react';
import {colorRaster} from './color-raster.js';

export function ColorLayer({preview, color, style, maxEdge = Infinity, crop, interactive = false}) {
  const canvas = useRef();
  const queue = useRef(Promise.resolve());
  const [painted, setPainted] = useState(null);
  const grade = useMemo(() => JSON.stringify(color ?? null),[color]);
  const {left, top, right, bottom} = crop || {};
  const inputs = useMemo(() => ({preview,maxEdge,crop:{left,top,right,bottom}}),[preview,maxEdge,left,top,right,bottom]);
  const current = useRef(inputs);
  current.current = {inputs,interactive};
  useEffect(() => {
    let active = true;
    const frame = requestAnimationFrame(() => {
      // Only the most recent slider value proceeds once the previous raster finishes.
      queue.current = queue.current.then(async () => {
        if (!active) return;
        const pixels = await colorRaster(inputs.preview,grade,inputs.maxEdge,inputs.crop,interactive);
        // During a drag an intermediate frame can remain useful until the next
        // value finishes. It must never replace the full-size result on release.
        if (!canvas.current||current.current.inputs!==inputs||(!active&&!(interactive&&current.current.interactive))) return;
        const target = canvas.current;
        if (target.width !== pixels.width) target.width = pixels.width;
        if (target.height !== pixels.height) target.height = pixels.height;
        const context=target.getContext('2d');
        if(pixels.data)context.putImageData(pixels,0,0);
        else {context.clearRect(0,0,target.width,target.height);context.drawImage(pixels,0,0);}
        setPainted(preview);
      }).catch(() => {});
    });
    return () => {active = false;cancelAnimationFrame(frame);};
  }, [preview,grade,inputs,interactive]);

  return <>
    {!crop&&<img src={preview} alt="" draggable={false} style={style} hidden={painted === preview}/>}
    <canvas ref={canvas} aria-hidden="true" hidden={painted !== preview} style={style}/>
  </>;
}
