import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

// Dynamic routing based on URL — supports both hash (Electron) and pathname (Tauri)
const hash = window.location.hash.replace('#', '');
const pathname = window.location.pathname;
// Check hash first (Electron-style: /#/overlay), then pathname (Tauri-style: /overlay)
const route = hash || pathname;

// Lazy load windows based on route (named exports → wrap in default)
const AppLazy = React.lazy(() => import("./App").then(m => ({ default: m.App })));
const OverlayLazy = React.lazy(() => import("./Overlay").then(m => ({ default: m.Overlay })));
const ScoutWindowLazy = React.lazy(() => import("./ScoutWindow").then(m => ({ default: m.ScoutWindow })));
const StatsWindowLazy = React.lazy(() => import("./StatsWindow").then(m => ({ default: m.StatsWindow })));
const ScoreboardWindowLazy = React.lazy(() => import("./ScoreboardWindow").then(m => ({ default: m.ScoreboardWindow })));
const TrackerPanelLazy = React.lazy(() => import("./TrackerPanel").then(m => ({ default: m.TrackerPanel })));

function Router() {
  switch (route) {
    case '/overlay':
      return <React.Suspense fallback={null}><OverlayLazy /></React.Suspense>;
    case '/scout':
      return <React.Suspense fallback={null}><ScoutWindowLazy /></React.Suspense>;
    case '/stats':
      return <React.Suspense fallback={null}><StatsWindowLazy /></React.Suspense>;
    case '/scoreboard':
      return <React.Suspense fallback={null}><ScoreboardWindowLazy /></React.Suspense>;
    case '/tracker':
      return <React.Suspense fallback={null}><TrackerPanelLazy /></React.Suspense>;
    default:
      return <React.Suspense fallback={<div style={{background:'#0f0f1a',height:'100vh'}} />}><AppLazy /></React.Suspense>;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>,
);
