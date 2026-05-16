import assert from 'node:assert/strict';
import {
  normalizeAspectRatio,
  resolveGeminiAspectSpecificModel,
  resolveGeminiCompatibleImageSize,
  resolveImageSize,
} from '../lib/image-sizing';

assert.equal(normalizeAspectRatio('16：9'), '16:9');
assert.equal(normalizeAspectRatio(' １６ ： ９ '), '16:9');

assert.equal(
  resolveGeminiCompatibleImageSize({ aspectRatio: '16：9', imageSize: '2K' }, '16:9'),
  '2048x1152'
);

assert.deepEqual(
  {
    ...resolveImageSize('2048x2048'),
    aspectRatio: normalizeAspectRatio('16：9') || resolveImageSize('2048x2048').aspectRatio,
  },
  { size: '2048x2048', aspectRatio: '16:9' }
);


assert.equal(
  resolveGeminiAspectSpecificModel(
    'gemini_3.0_pro_image_preview',
    { aspectRatio: '16：9', imageSize: '4K' },
    '5504x3072'
  ),
  'gemini-3.0-pro-image-landscape-4k'
);

assert.equal(
  resolveGeminiAspectSpecificModel(
    'gemini_3.1_flash_image_preview',
    { aspectRatio: '16:9', imageSize: '4K' },
    '5504x3072'
  ),
  'gemini-3.1-flash-image-landscape-4k'
);

console.log('image sizing verification passed');
