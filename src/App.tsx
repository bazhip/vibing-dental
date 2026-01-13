import React from 'react';
import './App.css';
import EntryGrid from './EntryGrid';

/**
 * Root application component
 */
const App: React.FC = () => {
  return (
    <div className="App">
      <EntryGrid />
    </div>
  );
};

export default App;
