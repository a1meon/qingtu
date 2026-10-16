import {calculateLayout} from '../../engine/stitch-layout.mjs';
import {loadPreview} from './load-preview.js';

export async function prepareLayoutPreview(project){
 const layout=calculateLayout(project);
 // These are the same small source layers used by the canvas. Decode only the
 // distinct selected-project assets, then wait for the committed layout paint.
 await Promise.all([...new Set(project.images.map(image=>image.preview))].map(loadPreview));
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 return {width:layout.width,height:layout.height,layout};
}
