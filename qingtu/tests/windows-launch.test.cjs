const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { launchWindows } = require('../desktop/windows-launch.cjs');

test('a second Windows launch exits before initializing the workspace', async () => {
  const app = new EventEmitter();
  app.requestSingleInstanceLock = () => false;
  let quit = false;
  app.quit = () => { quit = true; };
  await launchWindows(app, () => assert.fail('secondary process started the desktop'));
  assert.equal(quit, true);
});

test('Windows shortcuts reuse the first window during startup and after minimization', async () => {
  const app = new EventEmitter();
  app.requestSingleInstanceLock = () => true;
  const ready = Promise.withResolvers();
  const actions = [];
  let minimized = false;
  let destroyed = false;
  const win = {
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    restore() { minimized = false; actions.push('restore'); },
    show() { actions.push('show'); },
    focus() { actions.push('focus'); }
  };
  const launch = launchWindows(app, () => ready.promise);
  app.emit('second-instance');
  app.emit('second-instance');
  assert.deepEqual(actions, []);
  ready.resolve({ win });
  await launch;
  assert.deepEqual(actions.splice(0), ['show', 'focus']);
  minimized = true;
  app.emit('second-instance');
  assert.deepEqual(actions.splice(0), ['restore', 'show', 'focus']);
  app.emit('second-instance');
  assert.deepEqual(actions.splice(0), ['show', 'focus']);
  destroyed = true;
  app.emit('second-instance');
  assert.deepEqual(actions, []);
});
