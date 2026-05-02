import React, { useState, useEffect } from 'react';
import './styles/themes.css';
import './styles/boards.css';
import './App.css';
import EntryGrid from './EntryGrid';
import { Login } from './components';
import { BoardProvider, BoardSwitcher } from './components/BoardSwitcher';

const AUTH_STORAGE_KEY = 'vibing-dental-auth';

/**
 * Root application component with authentication.
 *
 * Auth state persists in localStorage so a page refresh doesn't kick the
 * user back to the login screen. EntryGrid persists its own chart data to
 * localStorage as well — together they make a refresh feel like a no-op.
 *
 * Wrapped in <BoardProvider> so any descendant can read the active design
 * board (layout + style + theme) via useBoard().
 */
const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTH_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (isAuthenticated) localStorage.setItem(AUTH_STORAGE_KEY, '1');
      else localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {}
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Login onAuthenticate={() => setIsAuthenticated(true)} />;
  }

  return (
    <BoardProvider>
      <div className="App">
        <header className="app-header">
          <h1>🦷 Veterinary Dental Charting</h1>
          <p>Professional dental examination and charting system</p>
        </header>
        <EntryGrid />
        <BoardSwitcher />
      </div>
    </BoardProvider>
  );
};

export default App;
