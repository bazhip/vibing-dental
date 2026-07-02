import React, { useState } from 'react';
import './Login.css';

interface LoginProps {
  onAuthenticate: () => void;
}

/**
 * Simple password authentication component
 */
export const Login: React.FC<LoginProps> = ({ onAuthenticate }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (password === 'margles') {
      setError('');
      onAuthenticate();
    } else {
      setError('Incorrect password');
      setPassword('');
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <h1>Veterinary Dental Charting</h1>
          <p>Enter the practice password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="password"
            className="login-input"
            placeholder="Password"
            aria-label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />

          {error && <div className="login-error" role="alert">{error}</div>}

          <button type="submit" className="login-button">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
};
