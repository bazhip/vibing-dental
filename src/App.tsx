import React from 'react';
import './App.css';
import EntryGrid from './EntryGrid';

/**
 * Root application component
 */
const App: React.FC = () => {
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
