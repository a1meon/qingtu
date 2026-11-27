function revealWindow(win){
 if(win.isDestroyed())return;
 if(win.isMinimized())win.restore();
 win.show();
 win.focus();
}

module.exports={revealWindow};
