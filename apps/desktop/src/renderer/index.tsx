import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Overlay } from './Overlay';
import { ScoutWindow } from './ScoutWindow';
import { StatsWindow } from './StatsWindow';
import { ScoreboardWindow } from './ScoreboardWindow';
import { TrackerPanel } from './TrackerPanel';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

if (window.location.hash === '#/overlay') {
    root.render(<Overlay />);
} else if (window.location.hash === '#/scout') {
    root.render(<ScoutWindow />);
} else if (window.location.hash === '#/stats') {
    root.render(<StatsWindow />);
} else if (window.location.hash === '#/scoreboard') {
    root.render(<ScoreboardWindow />);
} else if (window.location.hash === '#/tracker') {
    root.render(<TrackerPanel />);
} else {
    root.render(<App />);
}
