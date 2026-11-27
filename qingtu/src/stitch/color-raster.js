import ColorRasterWorker from './color-raster.worker.js?worker&inline';
import {loadPreview} from './load-preview.js';
import {paintColorPreview} from './color-preview.js';

const recent = [], inFlight = [];
let bytes = 0, worker, workerSource, queue = Promise.resolve();

async function makeRaster(preview, color, maxEdge, crop, interactive) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function') {
    try {
      worker ??= new ColorRasterWorker();
      const shape = JSON.stringify([maxEdge,crop]);
      const needsSource = !workerSource || workerSource.preview!==preview || workerSource.shape!==shape;
      const image = needsSource ? await createImageBitmap(await loadPreview(preview)) : undefined;
      const {bitmap,pixels,width,height} = await new Promise((resolve, reject) => {
        worker.onmessage = ({data}) => data.error ? reject(new Error(data.error)) : resolve(data);
        worker.onerror = () => reject(new Error('调色预览处理失败'));
        worker.onmessageerror = worker.onerror;
        try { worker.postMessage({image,color,maxEdge,crop,interactive},image?[image]:[]); }
        catch (error) { image?.close(); reject(error); }
      });
      workerSource={preview,shape};
      return bitmap||new ImageData(pixels,width,height);
    } catch {
      worker?.terminate();
      worker = null;
      workerSource = null;
    }
  }
  const canvas = document.createElement('canvas');
  const pixels = paintColorPreview(canvas, await loadPreview(preview), color, maxEdge, crop);
  return new ImageData(pixels, canvas.width, canvas.height);
}

export function colorRaster(preview, grade, maxEdge, crop, interactive) {
  const key = JSON.stringify([grade, maxEdge, crop, interactive]);
  const matches = entry => entry.preview === preview && entry.key === key;
  const index = recent.findIndex(matches);
  if (index !== -1) {
    const [entry] = recent.splice(index, 1);
    recent.push(entry);
    return Promise.resolve(entry.image);
  }
  const pending = inFlight.find(matches);
  if (pending) return pending.task;

  const entry = {preview, key};
  entry.task = queue.then(() => makeRaster(preview, JSON.parse(grade), maxEdge, crop,interactive)).then(image => {
    if(interactive){if(image.close)setTimeout(()=>image.close(),0);return image;}
    const size = image.data.byteLength + preview.length * 2;
    recent.push({preview, key, image, size});
    bytes += size;
    while (recent.length > 12 || bytes > 64 * 1024 * 1024) bytes -= recent.shift().size;
    return image;
  }).finally(() => inFlight.splice(inFlight.indexOf(entry), 1));
  inFlight.push(entry);
  queue = entry.task.then(()=>{},()=>{});
  return entry.task;
}
