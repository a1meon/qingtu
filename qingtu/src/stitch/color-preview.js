import {applyImageColor, colorReferenceSampleEdge, colorStatistics, hasImageColor, matchImageColor} from '../../engine/image-color.mjs';
import {sourceWindow} from '../../engine/image-source.mjs';
import {loadPreview} from './load-preview.js';

function drawPreview(canvas, preview, maxEdge, crop) {
  const width = preview.naturalWidth ?? preview.width, height = preview.naturalHeight ?? preview.height;
  const {left = 0, top = 0, right = 1, bottom = 1} = crop || {};
  const sourceWidth = width * (right - left), sourceHeight = height * (bottom - top);
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const nextWidth = Math.max(1, Math.round(sourceWidth * scale));
  const nextHeight = Math.max(1, Math.round(sourceHeight * scale));
  if (canvas.width !== nextWidth) canvas.width = nextWidth;
  if (canvas.height !== nextHeight) canvas.height = nextHeight;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  context.clearRect(0, 0, nextWidth, nextHeight);
  context.imageSmoothingQuality = 'high';
  context.drawImage(preview, width * left, height * top, sourceWidth, sourceHeight, 0, 0, nextWidth, nextHeight);
  return context;
}

export function paintColorPreview(canvas, preview, color, maxEdge, crop) {
  const context = drawPreview(canvas, preview, maxEdge, crop);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  if (hasImageColor(color)) {
    applyImageColor(pixels.data,color,{width:canvas.width,height:canvas.height,crop});
    context.putImageData(pixels, 0, 0);
  }
  return pixels.data;
}

export function colorPreviewWindow(image) {
  const source = sourceWindow(image);
  return {
    left: source.left / source.fullWidth, top: source.top / source.fullHeight,
    right: (source.left + source.width) / source.fullWidth,
    bottom: (source.top + source.height) / source.fullHeight,
  };
}

export function resolveColorReference(project) {
  const reference = project?.colorReference;
  return reference?.imageId ? project.images.find(image => image.id === reference.imageId) : reference;
}

export async function profileColorReference(image) {
  const preview = await loadPreview(image.preview), canvas = document.createElement('canvas');
  const statistics = colorStatistics(paintColorPreview(canvas, preview, undefined, colorReferenceSampleEdge));
  drawPreview(canvas, preview, 144);
  return {name: image.name, thumbnail: canvas.toDataURL('image/png'), statistics};
}

export async function colorsFromReference(reference, targets, {strength, luminance}) {
  const canvas = document.createElement('canvas');
  const decoded = new Map();
  async function measure(image, color) {
    if (!decoded.has(image.preview)) decoded.set(image.preview, loadPreview(image.preview));
    const preview = await decoded.get(image.preview);
    // A split layer represents only its own source window. Manual and
    // layout crops leave the full image available for reference analysis.
    try {
      return colorStatistics(paintColorPreview(canvas, preview, color, colorReferenceSampleEdge, colorPreviewWindow(image)));
    } catch (error) {
      throw new Error(image.name + '：' + error.message);
    }
  }
  const referenceStats = reference.statistics || await measure(reference, reference.color);
  const changes = new Map();
  for (const image of targets) {
    const base={...image.color,match:undefined};
    const stats = await measure(image, base);
    const match = {...matchImageColor(stats, referenceStats), strength, luminance};
    changes.set(image.id, {...base,match});
  }
  return changes;
}
