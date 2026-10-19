// Fixtures always use native Sharp. Spies follow the backend under test.
import sharp from 'sharp';
import lite from '../src/lite/sharp.mjs';
export default process.env.QINGTU_TEST_LITE==='1'?lite:sharp;
