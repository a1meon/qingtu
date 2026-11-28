import React, {lazy,Suspense} from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import {applyTheme,storedTheme} from "./theme.js";

// Apply the stored appearance before the first paint to avoid a flash.
applyTheme(storedTheme());

const toy=!!window.qingtuToy;
if(toy){
  document.title='摸鱼玩具';
  document.documentElement.classList.add('toy-document');
}
const Root=toy?lazy(()=>import('./toys/DesktopToy.jsx')):lazy(()=>import('./App.jsx').then(({App})=>({default:App})));

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Suspense fallback={null}><Root/></Suspense>
  </React.StrictMode>,
);
