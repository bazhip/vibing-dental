import React, { useState, useEffect } from 'react';
import './styles/themes.css';
import './styles/boards.css';
import './App.css';
import EntryGrid from './EntryGrid';
import { Login } from './components';
import { BoardProvider } from './components/BoardSwitcher';
import { readString, writeString, removeKey } from './utils/storage';

const AUTH_KEY = 'auth';
const AUTH_VERSION = 1;

/**
 * Root application component with authentication.
 *
 * Auth state persists via the unified storage util so a page refresh
 * doesn't kick the user back to the login screen. EntryGrid persists its
 * own chart data the same way — together they make a refresh a no-op.
 *
 * Wrapped in <BoardProvider> so any descendant can read the active design
 * board (layout + style + theme) via useBoard().
 */
const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => readString(AUTH_KEY, AUTH_VERSION, '') === '1'
  );

  useEffect(() => {
    if (isAuthenticated) writeString(AUTH_KEY, AUTH_VERSION, '1');
    else removeKey(AUTH_KEY, AUTH_VERSION);
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Login onAuthenticate={() => setIsAuthenticated(true)} />;
  }

  return (
    <BoardProvider>
      <div className="App">
        <EntryGrid />
      </div>
    </BoardProvider>
  );
};

export default App;
