import React, { useState } from 'react';
import './App.css';
import EntryGrid from './EntryGrid';
import { Login } from './components';

/**
 * Root application component with authentication
 */
const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  if (!isAuthenticated) {
    return <Login onAuthenticate={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="App">
      <header className="app-header">
        <h1>🦷 Veterinary Dental Charting</h1>
        <p>Professional dental examination and charting system</p>
      </header>
      <EntryGrid />
    </div>
  );
};

export default App;
