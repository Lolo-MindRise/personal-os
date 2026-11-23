import { useEffect, useState } from 'react';
import { fetchHealth, HEALTH_MESSAGES, type HealthState } from './health.js';

export function App() {
  const [health, setHealth] = useState<HealthState>('loading');

  useEffect(() => {
    let active = true;
    void fetchHealth().then((state) => {
      if (active) {
        setHealth(state);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main>
      <h1>Personal OS</h1>
      <p role="status">{HEALTH_MESSAGES[health]}</p>
    </main>
  );
}
