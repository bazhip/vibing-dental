import React from 'react';
import { useApiKey, useDeepgramKey, useSelectedModel } from '../hooks/useApiKey';
import { verifyApiKey, listModels, KNOWN_MODELS, ModelOption } from '../utils/aiAutofill';

/**
 * BYOK settings dialog. Two keys:
 *   - Anthropic — required for AI autofill (Claude tool-use extraction).
 *   - Deepgram — optional, swaps the STT transport from browser-native
 *     Web Speech to Deepgram Nova-3 streaming with diarization for
 *     materially better accuracy (and "Speaker N:" labels so the vet's
 *     findings aren't muddled with the tech's chatter).
 *
 * Anthropic save runs a 1-token messages.create() against Haiku to
 * verify the key actually authenticates before we persist it. Deepgram
 * we just persist — the key gets used at the next mic-start, where the
 * WebSocket close code (1008) surfaces a bad-key error in the panel.
 */

interface AiSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const AiSettingsModal: React.FC<AiSettingsModalProps> = ({ open, onClose }) => {
  const { apiKey, setApiKey } = useApiKey();
  const { deepgramKey, setDeepgramKey } = useDeepgramKey();
  const { model, setModel } = useSelectedModel();

  const [anthropicDraft, setAnthropicDraft] = React.useState(apiKey);
  const [deepgramDraft, setDeepgramDraft] = React.useState(deepgramKey);
  const [revealed, setRevealed] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [verifyError, setVerifyError] = React.useState<string | null>(null);
  const [verifyOk, setVerifyOk] = React.useState(false);
  const [models, setModels] = React.useState<ModelOption[]>(KNOWN_MODELS);
  const [modelsLoading, setModelsLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setAnthropicDraft(apiKey);
      setDeepgramDraft(deepgramKey);
      setVerifyError(null);
      setVerifyOk(false);
    }
  }, [open, apiKey, deepgramKey]);

  // When the dialog opens with a saved key, ask the Anthropic Models API
  // which models the key can actually use, so the picker only offers valid
  // IDs. Falls back to the static list on error / no key.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (!apiKey.trim()) {
      setModels(KNOWN_MODELS);
      return;
    }
    setModelsLoading(true);
    listModels(apiKey)
      .then((list) => { if (!cancelled) setModels(list); })
      .finally(() => { if (!cancelled) setModelsLoading(false); });
    return () => { cancelled = true; };
  }, [open, apiKey]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleAnthropicChange = (value: string) => {
    setAnthropicDraft(value);
    if (verifyError) setVerifyError(null);
    if (verifyOk) setVerifyOk(false);
  };

  const handleSave = async () => {
    const anthropicChanged = anthropicDraft.trim() !== apiKey.trim();
    const deepgramChanged  = deepgramDraft.trim()  !== deepgramKey.trim();
    if (!anthropicChanged && !deepgramChanged) {
      onClose();
      return;
    }

    // Only verify the Anthropic key (Deepgram has no cheap auth-check
    // endpoint; bad keys get caught at the WebSocket layer).
    if (anthropicChanged && anthropicDraft.trim()) {
      setVerifying(true);
      setVerifyError(null);
      setVerifyOk(false);
      try {
        const result = await verifyApiKey(anthropicDraft);
        if (!result.ok) {
          setVerifyError(result.message ?? 'Verification failed.');
          return;
        }
      } finally {
        setVerifying(false);
      }
    }

    setApiKey(anthropicDraft);
    setDeepgramKey(deepgramDraft);
    setVerifyOk(true);
    setTimeout(() => onClose(), 500);
  };

  const handleClearAnthropic = () => {
    setApiKey('');
    setAnthropicDraft('');
    setVerifyError(null);
    setVerifyOk(false);
  };

  const handleClearDeepgram = () => {
    setDeepgramKey('');
    setDeepgramDraft('');
  };

  if (!open) return null;

  const dirty =
    anthropicDraft.trim() !== apiKey.trim() ||
    deepgramDraft.trim()  !== deepgramKey.trim();
  const canSave = !verifying && (dirty || (!apiKey && anthropicDraft.trim()));

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
            All keys are stored in your browser only. Each is sent directly
            to its respective service ({' '}
            <code>api.anthropic.com</code>, <code>api.deepgram.com</code>).
          </p>

          {/* Anthropic — required for AI autofill */}
          <section className="ai-settings-section">
            <header className="ai-settings-section-head">
              <strong>Anthropic API key</strong>
              <span className="ai-settings-section-tag">Required</span>
            </header>
            <p className="ai-settings-section-blurb">
              Powers the chart-fill extraction (Claude Sonnet with tool use).
              Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
            </p>
            <div className="ai-settings-input-row">
              <input
                type={revealed ? 'text' : 'password'}
                className="ai-settings-input"
                placeholder="sk-ant-…"
                value={anthropicDraft}
                onChange={(e) => handleAnthropicChange(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={verifying}
              />
              <button
                type="button"
                className="ai-settings-reveal"
                onClick={() => setRevealed((r) => !r)}
                aria-label={revealed ? 'Hide keys' : 'Show keys'}
              >
                {revealed ? '🙈' : '👁'}
              </button>
            </div>
            {apiKey && (
              <div className="ai-settings-section-meta">
                <span className="ai-settings-status--ok">✓ Configured ({mask(apiKey)})</span>
                <button
                  type="button"
                  className="ai-settings-button ai-settings-button--ghost ai-settings-button--small"
                  onClick={handleClearAnthropic}
                  disabled={verifying}
                >
                  Remove
                </button>
              </div>
            )}
          </section>

          {/* Model picker — which Claude model powers extraction */}
          <section className="ai-settings-section">
            <header className="ai-settings-section-head">
              <strong>Extraction model</strong>
              {modelsLoading && <span className="ai-settings-section-tag">Loading…</span>}
            </header>
            <p className="ai-settings-section-blurb">
              Which Claude model fills the chart from your dictation. Opus is the
              most capable; Sonnet and Haiku are faster and cheaper for real-time
              use. {apiKey.trim()
                ? 'This list is fetched live from your account.'
                : 'Save an Anthropic key to load the live model list.'}
            </p>
            <select
              className="ai-settings-input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {(models.some((m) => m.id === model)
                ? models
                : [{ id: model, displayName: model }, ...models]
              ).map((m) => (
                <option key={m.id} value={m.id}>{m.displayName}</option>
              ))}
            </select>
          </section>

          {/* Deepgram — optional STT upgrade */}
          <section className="ai-settings-section">
            <header className="ai-settings-section-head">
              <strong>Deepgram API key</strong>
              <span className="ai-settings-section-tag ai-settings-section-tag--optional">Optional</span>
            </header>
            <p className="ai-settings-section-blurb">
              Switches transcription from the free browser API to Deepgram
              Nova-3 — much better accuracy on dental shorthand and speaker
              labels (vet vs. tech). ~$0.40/hr. Get a key at{' '}
              <a href="https://console.deepgram.com/" target="_blank" rel="noreferrer">console.deepgram.com</a>.
            </p>
            <div className="ai-settings-input-row">
              <input
                type={revealed ? 'text' : 'password'}
                className="ai-settings-input"
                placeholder="Leave blank to use the free browser API"
                value={deepgramDraft}
                onChange={(e) => setDeepgramDraft(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={verifying}
              />
            </div>
            {deepgramKey && (
              <div className="ai-settings-section-meta">
                <span className="ai-settings-status--ok">✓ Configured ({mask(deepgramKey)})</span>
                <button
                  type="button"
                  className="ai-settings-button ai-settings-button--ghost ai-settings-button--small"
                  onClick={handleClearDeepgram}
                  disabled={verifying}
                >
                  Remove
                </button>
              </div>
            )}
          </section>

          {verifyError && (
            <div className="ai-settings-status ai-settings-status--err" role="alert">
              {verifyError}
            </div>
          )}
          {verifyOk && (
            <div className="ai-settings-status ai-settings-status--ok">
              ✓ Saved.
            </div>
          )}
        </div>

        <footer className="ai-settings-footer">
          <span className="ai-settings-spacer" />
          <button
            type="button"
            className="ai-settings-button ai-settings-button--ghost"
            onClick={onClose}
            disabled={verifying}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ai-settings-button ai-settings-button--primary"
            onClick={handleSave}
            disabled={!canSave}
          >
            {verifying ? 'Verifying…' : 'Save'}
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
