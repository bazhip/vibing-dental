import React from 'react';

/**
 * "By <action> you agree to…" — how people accept the Terms (no checkbox).
 * Sits right next to the button it describes; clicking that button records
 * the acceptance (utils/terms.ts).
 */
export const LegalNotice: React.FC<{ action: string; className?: string }> = ({ action, className }) => (
  <p className={`login-legal${className ? ` ${className}` : ''}`}>
    By {action} you agree to the{' '}
    <a href="/terms" target="_blank" rel="noopener">Terms of Service</a>,{' '}
    <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a> and{' '}
    <a href="/dpa" target="_blank" rel="noopener">Data Processing Addendum</a>.
  </p>
);
