async function launchWindows(app, startPrimary) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  let win;
  let activationPending = false;
  function activate() {
    if (!win) {
      activationPending = true;
      return;
    }
    if (win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  app.on('second-instance', activate);
  const desktop = await startPrimary();
  win = desktop.win;
  if (activationPending) activate();
}

module.exports = { launchWindows };
