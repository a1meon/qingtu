import test from 'node:test';
import assert from 'node:assert/strict';
import {applyImageColor, colorStatistics, matchImageColor, setImageColors} from '../engine/image-color.mjs';

const target = [45, 82, 114, 255, 108, 132, 164, 255, 168, 177, 190, 180];
const reference = [94, 69, 48, 255, 152, 123, 94, 255, 206, 174, 128, 180];
const luma = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
const pixelDistance = (a, b) => a.reduce((sum, value, index) =>
  sum + (index % 4 === 3 ? 0 : Math.abs(value - b[index])), 0);

test('matching the full reference moves the target palette closer and preserves its alpha', () => {
  const match = matchImageColor(colorStatistics(target), colorStatistics(reference));
  const pixels = Uint8ClampedArray.from(target);
  applyImageColor(pixels, {match: {...match, strength: 100, luminance: true}});
  assert.ok(pixelDistance([...pixels], reference) < pixelDistance(target, reference) / 3);
  assert.deepEqual([pixels[3], pixels[7], pixels[11]], [255, 255, 180]);
  assert.ok(pixels[0] < pixels[4] && pixels[4] < pixels[8], 'target detail remains visible');
});

test('color-only matching preserves brightness and strength interpolates from the original', () => {
  const match = matchImageColor(colorStatistics(target), colorStatistics(reference));
  const at = strength => {
    const pixels = Uint8ClampedArray.from(target);
    applyImageColor(pixels, {match: {...match, strength}});
    return [...pixels];
  };
  const full = at(100), half = at(50);
  assert.deepEqual(at(0), target);
  assert.ok(pixelDistance(full, target) > pixelDistance(half, target));
  assert.ok(pixelDistance(half, target) > 0);
  for (let index = 0; index < target.length; index += 4) {
    assert.ok(Math.abs(luma(...target.slice(index, index + 3)) - luma(...full.slice(index, index + 3))) <= 1);
  }
});

test('transparent pixels carry no weight in analysis, while a solid reference can match a flat target', () => {
  const stats = colorStatistics([10, 20, 30, 255]);
  assert.deepEqual(colorStatistics([250, 7, 67, 0, 10, 20, 30, 255]), stats);
  assert.throws(() => colorStatistics([255, 255, 255, 0]), /透明/);
  const match = matchImageColor(stats, colorStatistics([70, 60, 50, 255]));
  const result = Uint8Array.of(10, 20, 30, 255, 20, 40, 80, 0);
  applyImageColor(result, {match: {...match, luminance: true, strength: 100}});
  assert.deepEqual([...result], [70, 60, 50, 255, 20, 40, 80, 0]);
});

test('manual exposure lifts midtones and a neutral edit removes the saved adjustment', () => {
  const pixels = Uint8Array.of(128, 128, 128, 123);
  applyImageColor(pixels, {adjustments: {exposure: 1}});
  assert.ok(pixels[0] > 150 && pixels[0] === pixels[1] && pixels[1] === pixels[2]);
  assert.equal(pixels[3], 123);
  const project = {images: [{id: 'one'}, {id: 'two'}]};
  const updated = setImageColors(project, new Map([['one', {adjustments: {exposure: 1}}]]));
  assert.deepEqual(updated.images[0].color.adjustments, {exposure: 1});
  assert.equal(updated.images[1], project.images[1]);
  assert.deepEqual(setImageColors(updated, new Map([['one', {adjustments: {exposure: 0}}]])), project);
});

test('matching agrees with the visible base adjustment after it clips highlights', () => {
  const pixels = [192, 192, 192, 255];
  const adjusted = Uint8Array.from(pixels), adjustments = {exposure: 1};
  applyImageColor(adjusted, {adjustments});
  assert.deepEqual([...adjusted], [255, 255, 255, 255]);
  const match = matchImageColor(colorStatistics(adjusted), colorStatistics([64, 64, 64, 255]));
  const result = Uint8Array.from(pixels);
  applyImageColor(result, {adjustments, match: {...match, luminance: true, strength: 100}});
  assert.deepEqual([...result], [64, 64, 64, 255]);
});

test('luminance matching holds a shared white background even when it covers different areas', () => {
  const referenceWhite = [247, 246, 245, 255];
  const targetWhite = [246, 245, 244, 255];
  const reference = [74, 69, 65, 255, 95, 91, 84, 255, 130, 115, 108, 255, ...referenceWhite];
  const target = [101, 99, 96, 255, 126, 121, 112, 255, 145, 138, 130, 255,
    ...targetWhite, ...targetWhite, ...targetWhite, ...targetWhite, ...targetWhite];
  const match = matchImageColor(colorStatistics(target), colorStatistics(reference));
  const result = Uint8Array.from(target);
  applyImageColor(result, {match: {...match, luminance: true, strength: 100}});
  for (let index = 12; index < result.length; index += 4) {
    assert.deepEqual([...result.slice(index, index + 4)], targetWhite);
  }
  assert.ok(pixelDistance([...result.slice(0, 12)], reference.slice(0, 12)) <
    pixelDistance(target.slice(0, 12), reference.slice(0, 12)) / 2);
});

test('luminance matching still adjusts whites when the reference genuinely has a darker background', () => {
  const target = [90, 85, 80, 255, 246, 246, 246, 255];
  const reference = [80, 75, 70, 255, 205, 205, 205, 255];
  const match = matchImageColor(colorStatistics(target), colorStatistics(reference));
  const result = Uint8Array.from(target);
  applyImageColor(result, {match: {...match, luminance: true, strength: 100}});
  assert.ok(result[4] < 225);
});

test('matching holds a shared off-white background under softer lighting', () => {
  const shade = [220, 220, 220, 255];
  const target = [120, 120, 120, 255, 140, 140, 140, 255, 155, 155, 155, 255,
    ...shade, ...shade, ...shade, ...shade, ...shade];
  const reference = [65, 65, 65, 255, 85, 85, 85, 255, 100, 100, 100, 255, ...shade];
  const match = matchImageColor(colorStatistics(target), colorStatistics(reference));
  const result = Uint8Array.from(target);
  applyImageColor(result, {match: {...match, luminance: true, strength: 100}});
  assert.deepEqual([...result.slice(12, 16)], shade);
  assert.ok(result[4] <= 90);
});
