// Keep the pre-paint resolver in sync with src/theme/appearance.ts.
(() => {
  let preference = 'system';
  try { preference = localStorage.getItem('toothops-appearance') || 'system'; } catch {}
  const dark = preference === 'dark' || (preference !== 'light' && preference !== 'dark' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
