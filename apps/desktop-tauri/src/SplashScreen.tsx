import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';

interface SplashScreenProps {
  onReady: () => void;
}

export function SplashScreen({ onReady }: SplashScreenProps) {
  const [status, setStatus] = useState('Initializing...');
  const [progress, setProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Listen for backend-ready event from Tauri
    const unlisten = listen('backend-ready', () => {
      setStatus('Ready!');
      setProgress(100);
      setIsReady(true);
      // Small delay before transitioning to app
      setTimeout(onReady, 500);
    });

    // Simulate progress for visual feedback
    const progressSteps = [
      { pct: 10, msg: 'Starting backend...' },
      { pct: 30, msg: 'Loading DDragon data...' },
      { pct: 50, msg: 'Connecting to LCU...' },
      { pct: 70, msg: 'Initializing AI models...' },
      { pct: 85, msg: 'Preparing overlay...' },
      { pct: 95, msg: 'Almost ready...' },
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < progressSteps.length) {
        setProgress(progressSteps[currentStep].pct);
        setStatus(progressSteps[currentStep].msg);
        currentStep++;
      } else {
        clearInterval(interval);
      }
    }, 800);

    return () => {
      unlisten.then(fn => fn());
      clearInterval(interval);
    };
  }, [onReady]);

  return (
    <div className="splash-screen">
      <div className="splash-content">
        <div className="splash-logo">
          <img src="/logo.png" alt="DraftCoach" />
        </div>
        <h1 className="splash-title">DraftCoach</h1>
        <p className="splash-subtitle">AI-Powered League Companion</p>
        
        <div className="splash-progress-container">
          <div className="splash-progress-bar">
            <div 
              className="splash-progress-fill" 
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="splash-status">{status}</span>
        </div>
      </div>
    </div>
  );
}