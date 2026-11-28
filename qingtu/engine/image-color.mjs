import {applyPortraitRetouch,hasPortraitRetouch,normalizePortraitRetouch} from './portrait-retouch.mjs';
import {applyAdvancedColor,applySampledHsl,hasAdvancedColor,hasSampledHsl,normalizeAdvancedColor} from './advanced-color.mjs';
import {applyColorEffects} from './color-effects.mjs';

const redWeight = .2126;
const greenWeight = .7152;
const blueWeight = .0722;
const limit = (value, low, high) => Math.min(high, Math.max(low, value));
const luminance = (red, green, blue) =>
  redWeight * red + greenWeight * green + blueWeight * blue;

export const colorReferenceSampleEdge = 384;

export const colorControls = [
  {key:'temperature', label:'色温', max:100, group:'色彩'},
  {key:'tint', label:'色调', max:100, group:'色彩'},
  {key:'vibrance', label:'自然饱和度', max:100, group:'色彩'},
  {key:'saturation', label:'饱和度', max:100, group:'色彩'},
  {key:'exposure', label:'曝光', max:3, step:.01, group:'明度'},
  {key:'brightness', label:'亮度', max:100, group:'明度'},
  {key:'contrast', label:'对比度', max:100, group:'明度'},
  {key:'highlights', label:'高光', max:100, group:'明度'},
  {key:'shadows', label:'阴影', max:100, group:'明度'},
  {key:'whites', label:'白色色阶', max:100, group:'明度'},
  {key:'blacks', label:'黑色色阶', max:100, group:'明度'},
  {key:'glow', label:'光感', max:100, group:'明度'},
  {key:'sharpen', label:'锐化', min:0, max:100, group:'效果'},
  {key:'clarity', label:'清晰', max:100, group:'效果'},
  {key:'grain', label:'颗粒', min:0, max:100, group:'效果'},
  {key:'fade', label:'褪色', min:0, max:100, group:'效果'},
  {key:'vignette', label:'暗角', max:100, group:'效果'},
];
const controlLimits = new Map(colorControls.map(control=>[control.key,control]));

function boundedVector(vector, low, high) {
  return Array.isArray(vector) && vector.length === 3 &&
    [...vector].every(value => Number.isFinite(value) && value >= low && value <= high);
}

export function normalizeImageColor(color) {
  if (color === undefined || color === null) return undefined;
  const {adjustments = {}, match} = color;
  if (typeof color !== 'object' || Array.isArray(color) ||
      !adjustments || typeof adjustments !== 'object' || Array.isArray(adjustments) ||
      Object.entries(adjustments).some(([key,value])=>{
        const range=controlLimits.get(key);
        return !range||!Number.isFinite(value)||value<(range.min??-range.max)||value>range.max;
      })) {
    throw new Error('调色参数无效');
  }
  if (match !== undefined && (!match ||
      !boundedVector(match.gain, .4, 2.5) || !boundedVector(match.offset, -4, 4) ||
      !Number.isFinite(match.strength) || match.strength < 0 || match.strength > 100 ||
      (match.luminance !== undefined && typeof match.luminance !== 'boolean') ||
      (match.whitePoint !== undefined && (!Number.isFinite(match.whitePoint) || match.whitePoint < .77 || match.whitePoint > 1)) ||
      (match.bands !== undefined && !(Array.isArray(match.bands) && match.bands.length === 3 &&
        match.bands.every(band => Array.isArray(band) && band.length === 2 && band.every(value => Number.isFinite(value) && Math.abs(value) <= .12)))))) {
    throw new Error('参考色匹配参数无效');
  }
  const active = Object.fromEntries(colorControls.filter(({key}) => adjustments[key]).map(({key}) => [key, adjustments[key]]));
  const normalized = {...normalizeAdvancedColor(color),...(Object.keys(active).length&&{adjustments:active})};
  const retouch=normalizePortraitRetouch(color.retouch);
  if(retouch)normalized.retouch=retouch;
  if (match) normalized.match = {
    gain: [...match.gain], offset: [...match.offset], strength: match.strength, luminance: !!match.luminance,
    ...(match.whitePoint !== undefined ? {whitePoint: match.whitePoint} : {}),
    ...(match.bands ? {bands: match.bands.map(band => [...band])} : {}),
  };
  return Object.keys(normalized).length ? normalized : undefined;
}

export function hasImageColor(color) {
  const match = color?.match;
  return !!(hasPortraitRetouch(color?.retouch)||hasAdvancedColor(color)||hasSampledHsl(color) || color?.adjustments && Object.values(color.adjustments).some(Boolean) ||
    match?.strength > 0 && match.gain.some((gain, index) => (index !== 0 || match.luminance) &&
      (gain !== 1 || match.offset[index] !== 0)));
}

export function clearImageColor(image) {
  if (image.color === undefined) return image;
  const {color, ...original} = image;
  return original;
}

export function setImageColors(project, changes) {
  return {...project, images: project.images.map(image => {
    if (!changes.has(image.id)) return image;
    const color = normalizeImageColor(changes.get(image.id));
    return color ? {...image, color} : clearImageColor(image);
  })};
}

function smoothstep(low, high, value) {
  const amount = limit((value - low) / (high - low), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function whiteWeight(light, chroma, fullWeight = .86) {
  const start = fullWeight - .09;
  if (light <= start || chroma >= .11) return 0;
  return smoothstep(start, fullWeight, light) * (1 - smoothstep(.045, .11, chroma));
}

function cloneGain(gain, axis) {
  return axis === 0 ? limit(gain, .78, 1.4) : limit(gain, .65, 1.8);
}

// Roll off the last part of a brightness shift instead of clipping shadow
// and highlight texture. A shift away from the boundary is left alone.
function shiftLuminance(light, shift) {
  const shifted = light + shift;
  if (shift > 0 && shifted > .94) {
    const knee = Math.max(light, .94), room = 1 - knee, excess = shifted - knee;
    return knee + room * excess / (Math.max(.06, room) + excess);
  }
  if (shift < 0 && shifted < .06) {
    const knee = Math.min(light, .06), excess = knee - shifted;
    return knee - knee * excess / (Math.max(.06, knee) + excess);
  }
  return shifted;
}

// Soft shadow / midtone / highlight weights that always sum to one.
export function toneWeights(light) {
  const shadow = 1 - smoothstep(.2, .5, light), highlight = smoothstep(.5, .8, light);
  return [shadow, 1 - shadow - highlight, highlight];
}

function moments(sums, squares, weight) {
  const mean = sums.map(sum => sum / weight);
  const deviation = squares.map((sum, axis) => Math.sqrt(Math.max(0, sum / weight - mean[axis] ** 2)));
  return {mean, deviation};
}

// Weight the visible pixels, keeping a separate profile of neutral highlights
// so differences in the amount of white can be distinguished from color casts.
export function colorStatistics(pixels) {
  const sums = [0, 0, 0], squares = [0, 0, 0];
  const whiteSums = [0, 0, 0], whiteSquares = [0, 0, 0];
  let weight = 0, whites = 0;
  const bandWeight = [0, 0, 0], bandSums = [[0, 0], [0, 0], [0, 0]];
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] / 255;
    if (!alpha) continue;
    const red = pixels[index] / 255, green = pixels[index + 1] / 255, blue = pixels[index + 2] / 255;
    const y = luminance(red, green, blue);
    const axes = [y, blue - y, red - y];
    const neutral = alpha * whiteWeight(y, Math.max(red, green, blue) - Math.min(red, green, blue));
    for (let axis = 0; axis < axes.length; axis++) {
      const value = axes[axis], squared = value * value;
      sums[axis] += alpha * value;
      squares[axis] += alpha * squared;
      whiteSums[axis] += neutral * value;
      whiteSquares[axis] += neutral * squared;
    }
    weight += alpha;
    whites += neutral;
    const tones = toneWeights(y);
    for (let band = 0; band < 3; band++) {
      const w = alpha * tones[band];
      bandWeight[band] += w; bandSums[band][0] += w * axes[1]; bandSums[band][1] += w * axes[2];
    }
  }
  if (!weight) throw new Error('图片完全透明，无法克隆色彩');
  // Mean chroma per tone band, kept only where the band holds enough pixels.
  const tones = bandWeight.map((w, band) => w / weight >= .03 ? [bandSums[band][0] / w, bandSums[band][1] / w] : null);
  const overall = {...moments(sums, squares, weight), tones};
  if (whites / weight < .03) return overall;
  const white = {light: whiteSums[0] / whites};
  if ((weight - whites) / weight >= .03) {
    white.foreground = moments(sums.map((sum, axis) => sum - whiteSums[axis]),
      squares.map((sum, axis) => sum - whiteSquares[axis]), weight - whites);
  }
  return {...overall, white};
}

const targetTonesOf = stats => stats.tones || null, referenceTonesOf = stats => stats.tones || null;

export function matchImageColor(target, reference) {
  const overallTarget = target, overallReference = reference;
  const whitePoint = target.white && reference.white && Math.abs(target.white.light - reference.white.light) <= .045 ? target.white.light : undefined;
  if (whitePoint !== undefined && target.white.foreground && reference.white.foreground) {
    target = target.white.foreground;
    reference = reference.white.foreground;
  }
  // Bound the spread adjustment to retain contrast and avoid amplifying noise.
  const gain = target.deviation.map((value, axis) => value < .008 ? 1 : cloneGain(reference.deviation[axis] / value, axis));
  const offset = target.mean.map((mean, axis) => reference.mean[axis] - gain[axis] * mean);
  // What the global transfer leaves per tone band (e.g. cool shadows and warm
  // highlights in the reference) is added back as a small chroma offset.
  const targetTones = targetTonesOf(overallTarget), referenceTones = referenceTonesOf(overallReference);
  const bands = targetTones && referenceTones ? [0, 1, 2].map(band => {
    const t = targetTones[band], r = referenceTones[band];
    if (!t || !r) return [0, 0];
    return [1, 2].map((axis, k) => limit(r[k] - (gain[axis] * t[k] + offset[axis]), -.08, .08));
  }) : null;
  const useful = bands?.some(band => band.some(value => Math.abs(value) > .004));
  return {gain, offset, ...(whitePoint !== undefined ? {whitePoint} : {}), ...(useful ? {bands} : {})};
}

function validColorMoments(stats) {
  return !!stats && boundedVector(stats.mean, -1, 1) && boundedVector(stats.deviation, 0, 1);
}

export function validateColorReference(reference) {
  if (reference == null) return;
  const {imageId, name, thumbnail, statistics} = reference;
  if (typeof imageId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(imageId)) return;
  if (typeof name !== 'string' || name.length < 1 || name.length > 200 ||
      typeof thumbnail !== 'string' || !thumbnail.startsWith('data:image/png;base64,') || thumbnail.length > 150000 ||
      !validColorMoments(statistics)) throw new Error('色彩参考图数据无效');
  const white = statistics.white;
  if (white !== undefined && (!white || !Number.isFinite(white.light) || white.light < 0 || white.light > 1 ||
      (white.foreground !== undefined && !validColorMoments(white.foreground)))) throw new Error('色彩参考图数据无效');
  const tones = statistics.tones;
  if (tones !== undefined && !(Array.isArray(tones) && tones.length === 3 &&
    tones.every(tone => tone === null || (Array.isArray(tone) && tone.length === 2 && tone.every(value => Number.isFinite(value) && Math.abs(value) <= 1)))))
    throw new Error('色彩参考图数据无效');
}

function gamutScale(light, red, green, blue) {
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue);
  return Math.min(1, max > 0 ? (1 - light) / max : 1, min < 0 ? -light / min : 1);
}

export function colorMatchParameters(match) {
  const strength = (match?.strength || 0) / 100;
  const protectedWhite = match?.whitePoint === undefined ? null : Math.max(.77, match.whitePoint - .025);
  const gain = [0, 1, 2].map(axis => axis === 0 && !match?.luminance ? 1 : 1 + strength * (cloneGain(match?.gain[axis] ?? 1, axis) - 1));
  // Keep legacy matches centred on the midtones when limiting their contrast.
  const offset = [0, 1, 2].map(axis => {
    if (axis === 0) return match?.luminance ? strength * (match.offset[0] + (match.gain[0] - cloneGain(match.gain[0], 0)) * .5) : 0;
    return strength * (match?.offset[axis] ?? 0);
  });
  const bands = [0, 1, 2].map(band => [0, 1].map(k => strength * (match?.bands?.[band]?.[k] ?? 0)));
  return {strength,protectedWhite,gain,offset,bands};
}

function applyBaseColor(pixels, adjustments, match) {
  const {
    exposure = 0, contrast = 0, temperature = 0, tint = 0, saturation = 0, vibrance = 0,
    shadows = 0, highlights = 0, whites = 0, blacks = 0, brightness=0, glow=0, fade=0,
  } = adjustments || {};
  const adjusted = !!adjustments;
  const {strength,protectedWhite,gain,offset,bands}=colorMatchParameters(match);
  const banded = bands.some(band => band[0] || band[1]);
  const blueBalance = -.0016 * temperature + .0009 * tint;
  const redBalance = .0012 * temperature + .0009 * tint;
  const exposureGain = 2 ** exposure;
  const contrastGain = 2 ** (contrast / 100);
  const saturationGain = 1 + saturation / 100;
  for (let index = 0; index < pixels.length; index += 4) {
    if (!pixels[index + 3]) continue;
    const red = pixels[index] / 255, green = pixels[index + 1] / 255, blue = pixels[index + 2] / 255;
    const y = luminance(red, green, blue);
    let light = y, blueDelta = blue - y, redDelta = red - y;
    if (adjusted) {
      const dark = 1 - y, darkSquared = dark * dark, lightSquared = y * y;
      light = limit(.5 + (y * exposureGain - .5) * contrastGain +
        .004 * (shadows * y * darkSquared + highlights * dark * lightSquared) +
        .0025 * (whites * lightSquared * lightSquared + blacks * darkSquared * darkSquared) +
        .008 * brightness * y * dark + .009 * glow * lightSquared * dark + .0021 * fade * darkSquared, 0, 1);
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      const saturationScale = saturationGain * (1 + .009 * vibrance * (1 - chroma)) * (1 - .002 * fade);
      blueDelta = (blueDelta + blueBalance) * saturationScale;
      redDelta = (redDelta + redBalance) * saturationScale;
      if (strength) {
        // Match the same visible base grade used when measuring the target.
        const greenDelta = -(redWeight * redDelta + blueWeight * blueDelta) / greenWeight;
        const baseScale = gamutScale(light, redDelta, greenDelta, blueDelta);
        redDelta *= baseScale;
        blueDelta *= baseScale;
      }
    }
    if (strength) {
      let amount = 1;
      if (protectedWhite !== null && light > protectedWhite - .09) {
        const greenDelta = -(redWeight * redDelta + blueWeight * blueDelta) / greenWeight;
        const chroma = Math.max(redDelta, greenDelta, blueDelta) - Math.min(redDelta, greenDelta, blueDelta);
        amount -= whiteWeight(light, chroma, protectedWhite);
      }
      const toneLight = light;
      light = shiftLuminance(light, amount * ((gain[0] - 1) * light + offset[0]));
      blueDelta += amount * ((gain[1] - 1) * blueDelta + offset[1]);
      redDelta += amount * ((gain[2] - 1) * redDelta + offset[2]);
      if (banded) {
        const [s, m, h] = toneWeights(toneLight);
        blueDelta += amount * (s * bands[0][0] + m * bands[1][0] + h * bands[2][0]);
        redDelta += amount * (s * bands[0][1] + m * bands[1][1] + h * bands[2][1]);
      }
    }
    const greenDelta = -(redWeight * redDelta + blueWeight * blueDelta) / greenWeight;
    // Reduce chroma at the gamut boundary while retaining hue and luminance.
    const scale = gamutScale(light, redDelta, greenDelta, blueDelta);
    pixels[index] = Math.round(255 * (light + scale * redDelta));
    pixels[index + 1] = Math.round(255 * (light + scale * greenDelta));
    pixels[index + 2] = Math.round(255 * (light + scale * blueDelta));
  }
  return pixels;
}

const spatialEffects=new Set(['sharpen','clarity','grain','vignette']);

export function applyImageColor(pixels,color,frame){
  if(!hasImageColor(color))return pixels;
  const {adjustments,match,retouch}=color;
  if(frame&&!frame.retouchApplied)applyPortraitRetouch(pixels,retouch,frame);
  const base=adjustments&&Object.entries(adjustments).some(([key,value])=>value&&!spatialEffects.has(key))?adjustments:undefined;
  if(hasAdvancedColor(color)){
    if(base)applyBaseColor(pixels,base);
    applyAdvancedColor(pixels,color);
    if(match?.strength)applyBaseColor(pixels,undefined,match);
  }else if(base||match?.strength)applyBaseColor(pixels,base,match);
  if(adjustments)applyColorEffects(pixels,adjustments,frame);
  if(hasSampledHsl(color))applySampledHsl(pixels,color.hslSamples);
  return pixels;
}
