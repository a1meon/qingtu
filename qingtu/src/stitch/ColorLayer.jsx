import {useEffect, useRef, useState} from 'react';
import {loadPreview} from './load-preview.js';
import {paintColorPreview} from './color-preview.js';

export function ColorLayer({preview, color, style, maxEdge, crop}) {
  const canvas = useRef();
  const [decoded, setDecoded] = useState(null), [painted, setPainted] = useState(null);
  useEffect(() => {
    let active = true;
    loadPreview(preview).then(image => {
      if (active) setDecoded({preview, image});
    }).catch(() => {
      if (active) setDecoded(null);
    });
    return () => { active = false; };
  }, [preview]);

  useEffect(() => {
    if (decoded?.preview !== preview) return;
    const frame = requestAnimationFrame(() => {
      paintColorPreview(canvas.current, decoded.image, color, maxEdge, crop);
      setPainted(preview);
    });
    return () => cancelAnimationFrame(frame);
  }, [decoded, preview, color, maxEdge, crop]);

  return <>
    {!crop&&<img src={preview} alt="" draggable={false} style={style} hidden={painted === preview}/>}
    <canvas ref={canvas} aria-hidden="true" hidden={painted !== preview} style={style}/>
  </>;
}
