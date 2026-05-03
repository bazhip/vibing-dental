import React from 'react';
import { useApiKey } from '../hooks/useApiKey';

/**
 * BYOK settings dialog. The user pastes their own Anthropic API key
 * (from console.anthropic.com); we persist it in localStorage and use
 * it directly in the browser via the Anthropic SDK. No backend, no
 * proxy — animal records aren't HIPAA so the trade-off is acceptable.
 */

interface AiSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const AiSettingsModal: React.FC<AiSettingsModalProps> = ({ open, onClose }) => {
  const { apiKey, setApiKey } = useApiKey();
  const [draft, setDraft] = React.useState(apiKey);
  const [revealed, setRevealed] = React.useState(false);

  React.useEffect(() => { if (open) setDraft(apiKey); }, [open, apiKey]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSave = () => {
    setApiKey(draft);
    onClose();
  };

  const handleClear = () => {
    setApiKey('');
    setDraft('');
  };

  if (!open) return null;

  return (
    <div
      className="ai-settings-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-settings-title"
    >
      <div className="ai-settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2 id="ai-settings-title">AI settings</h2>
          <button
            type="button"
            className="ai-settings-close"
            onClick={onClose}
            aria-label="Close settings"
          >×</button>
        </header>

        <div className="ai-settings-body">
          <p className="ai-settings-blurb">
            Paste an Anthropic API key to enable voice-driven autofill.
            The key is stored in your browser only — it isn't sent anywhere
            except directly to <code>api.anthropic.com</code>.
            Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
          </p>

          <label className="ai-settings-label">
            Anthropic API key
            <div className="ai-settings-input-row">
              <input
                type={revealed ? 'text' : 'password'}
                className="ai-settings-input"
                placeholder="sk-ant-…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="ai-settings-reveal"
                onClick={() => setRevealed((r) => !r)}
                aria-label={revealed ? 'Hide API key' : 'Show API key'}
              >
                {revealed ? '🙈' : '👁'}
              </button>
            </div>
          </label>

          <div className="ai-settings-status">
            {apiKey
              ? <span className="ai-settings-status--ok">✓ Key configured ({mask(apiKey)})</span>
              : <span className="ai-settings-status--off">No key set — voice autofill is disabled.</span>}
          </div>
        </div>

        <footer className="ai-settings-footer">
          {apiKey && (
            <button
              type="button"
              className="ai-settings-button ai-settings-button--ghost"
              onClick={handleClear}
            >
              Remove key
            </button>
          )}
          <span className="ai-settings-spacer" />
          <button
            type="button"
            className="ai-settings-button ai-settings-button--ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ai-settings-button ai-settings-button--primary"
            onClick={handleSave}
            disabled={draft === apiKey}
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
};

function mask(key: string): string {
  if (key.length <= 12) return '••••';
  return key.slice(0, 7) + '…' + key.slice(-4);
}
