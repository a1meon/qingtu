const {revealWindow}=require('./reveal-window.cjs');

async function launchWindows(app, startPrimary) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  let desktop;
  let activationPending = false;
  function activate() {
    if (!desktop) {
      activationPending = true;
      return;
    }
    revealWindow(desktop.ensureMainWindow?desktop.ensureMainWindow():desktop.win);
  }

  app.on('second-instance', activate);
  desktop = await startPrimary();
  if (activationPending) activate();
}

module.exports = { launchWindows };
