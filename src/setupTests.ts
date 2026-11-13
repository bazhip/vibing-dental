import { loadLanguage } from './i18n';
import { APP_LANGUAGES } from './i18n/config';
// jest-dom matchers (toBeInTheDocument, toHaveAttribute, …) registered
// against Vitest's expect.
import '@testing-library/jest-dom/vitest';

// Production fetches non-English catalogs on demand; tests have them all up front
// so getFixedT('fr', …) and changeLanguage work synchronously.
await Promise.all(APP_LANGUAGES.map(loadLanguage));
