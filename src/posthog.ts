import posthog from 'posthog-js';

const posthogKey = import.meta.env.VITE_POSTHOG_KEY?.trim();
const posthogHost = import.meta.env.VITE_POSTHOG_HOST?.trim();

type PostHogLogAttributes = Record<string, string | number | boolean>;

/** Guards identity and custom-event calls when browser analytics is not configured. */
export const posthogEnabled = Boolean(posthogKey && posthogHost);

/** Dedicated structured logger; only explicit calls are exported to PostHog Logs. */
export const posthogLogger = {
  info(message: string, attributes: PostHogLogAttributes = {}) {
    if (posthogEnabled) posthog.logger.info(message, attributes);
  },
};

if (posthogEnabled && posthogKey && posthogHost) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: '2026-08-30',
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    logs: {
      serviceName: 'toothops-charting-web',
      environment: import.meta.env.MODE,
    },
  });
} else if (import.meta.env.DEV) {
  const missingVariable = posthogKey ? 'VITE_POSTHOG_HOST' : 'VITE_POSTHOG_KEY';
  console.error(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  );
}

export default posthog;
