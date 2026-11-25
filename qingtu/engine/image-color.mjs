const redWeight = .2126;
const greenWeight = .7152;
const blueWeight = .0722;
const limit = (value, low, high) => Math.min(high, Math.max(low, value));
const luminance = (red, green, blue) =>
  redWeight * red + greenWeight * green + blueWeight * blue;

export const colorControls = [
  {key: 'temperature', label: '色温', max: 100},
  {key: 'tint', label: '色调', max: 100},
  {key: 'exposure', label: '曝光', max: 3, step: .01},
  {key: 'contrast', label: '对比度', max: 100},
  {key: 'highlights', label: '高光', max: 100},
  {key: 'shadows', label: '阴影', max: 100},
  {key: 'whites', label: '白色色阶', max: 100},
  {key: 'blacks', label: '黑色色阶', max: 100},
  {key: 'vibrance', label: '自然饱和度', max: 100},
  {key: 'saturation', label: '饱和度', max: 100},
];
const controlLimits = new Map(colorControls.map(({key, max}) => [key, max]));

function boundedVector(vector, low, high) {
  return Array.isArray(vector) && vector.length === 3 &&
    [...vector].every(value => Number.isFinite(value) && value >= low && value <= high);
}

export function normalizeImageColor(color) {
  if (color === undefined || color === null) return undefined;
  const {adjustments = {}, match} = color;
  if (typeof color !== 'object' || Array.isArray(color) ||
      !adjustments || typeof adjustments !== 'object' || Array.isArray(adjustments) ||
      Object.entries(adjustments).some(([key, value]) => !Number.isFinite(value) || !(Math.abs(value) <= controlLimits.get(key)))) {
    throw new Error('调色参数无效');
  }
  if (match !== undefined && (!match ||
      !boundedVector(match.gain, .4, 2.5) || !boundedVector(match.offset, -4, 4) ||
      !Number.isFinite(match.strength) || match.strength < 0 || match.strength > 100 ||
      (match.luminance !== undefined && typeof match.luminance !== 'boolean') ||
      (match.whitePoint !== undefined && (!Number.isFinite(match.whitePoint) || match.whitePoint < .77 || match.whitePoint > 1)))) {
    throw new Error('参考色匹配参数无效');
  }
  const active = Object.fromEntries(colorControls.filter(({key}) => adjustments[key]).map(({key}) => [key, adjustments[key]]));
  const normalized = Object.keys(active).length ? {adjustments: active} : {};
  if (match) normalized.match = {
    gain: [...match.gain], offset: [...match.offset], strength: match.strength, luminance: !!match.luminance,
    ...(match.whitePoint !== undefined ? {whitePoint: match.whitePoint} : {}),
  };
  return Object.keys(normalized).length ? normalized : undefined;
}

export function hasImageColor(color) {
  const match = color?.match;
  return !!(color?.adjustments && Object.values(color.adjustments).some(Boolean) ||
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
  }
  if (!weight) throw new Error('图片完全透明，无法克隆色彩');
  const overall = moments(sums, squares, weight);
  if (whites / weight < .03) return overall;
  const white = {light: whiteSums[0] / whites};
  if ((weight - whites) / weight >= .03) {
    white.foreground = moments(sums.map((sum, axis) => sum - whiteSums[axis]),
      squares.map((sum, axis) => sum - whiteSquares[axis]), weight - whites);
  }
  return {...overall, white};
}

export function matchImageColor(target, reference) {
  const whitePoint = target.white && reference.white && Math.abs(target.white.light - reference.white.light) <= .045 ? target.white.light : undefined;
  if (whitePoint !== undefined && target.white.foreground && reference.white.foreground) {
    target = target.white.foreground;
    reference = reference.white.foreground;
  }
  // Bound the spread adjustment to retain contrast and avoid amplifying noise.
  const gain = target.deviation.map((value, axis) => value < .008 ? 1 : limit(reference.deviation[axis] / value, .4, 2.5));
  const offset = target.mean.map((mean, axis) => reference.mean[axis] - gain[axis] * mean);
  return {gain, offset, ...(whitePoint !== undefined ? {whitePoint} : {})};
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
}

function gamutScale(light, red, green, blue) {
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue);
  return Math.min(1, max > 0 ? (1 - light) / max : 1, min < 0 ? -light / min : 1);
}

export function applyImageColor(pixels, color) {
  if (!hasImageColor(color)) return pixels;
  const {
    exposure = 0, contrast = 0, temperature = 0, tint = 0, saturation = 0, vibrance = 0,
    shadows = 0, highlights = 0, whites = 0, blacks = 0,
  } = color.adjustments || {};
  const match = color.match, adjusted = !!color.adjustments;
  const strength = (match?.strength || 0) / 100;
  const protectedWhite = match?.whitePoint === undefined ? null : Math.max(.77, match.whitePoint - .025);
  const gain = [0, 1, 2].map(axis => axis === 0 && !match?.luminance ? 1 : 1 + strength * ((match?.gain[axis] ?? 1) - 1));
  const offset = [0, 1, 2].map(axis => axis === 0 && !match?.luminance ? 0 : strength * (match?.offset[axis] ?? 0));
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
        .0025 * (whites * lightSquared * lightSquared + blacks * darkSquared * darkSquared), 0, 1);
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      const saturationScale = saturationGain * (1 + .009 * vibrance * (1 - chroma));
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
      light = limit(light + amount * ((gain[0] - 1) * light + offset[0]), 0, 1);
      blueDelta += amount * ((gain[1] - 1) * blueDelta + offset[1]);
      redDelta += amount * ((gain[2] - 1) * redDelta + offset[2]);
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
