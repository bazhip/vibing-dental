import { renderBrandedEmail } from '../../supabase/functions/_shared/email';

describe('branded email', () => {
  const e = {
    preheader: 'Set your password',
    title: 'You’re invited to join <Harbor> & Co',
    paragraphs: ['Harbor invited you.', 'Link works 24h.'],
    button: { label: 'Set your password & join', url: 'https://toothops.app/?a=1&b=2' },
    footnote: 'Ignore if unexpected.',
  };
  it('escapes user-supplied text in the HTML and includes the button link', () => {
    const { html } = renderBrandedEmail(e);
    expect(html).toContain('&lt;Harbor&gt; &amp; Co');
    expect(html).not.toContain('<Harbor>');
    expect(html).toContain('href="https://toothops.app/?a=1&amp;b=2"');
    expect(html).toContain('ToothOps');
  });
  it('provides a plain-text alternative with the raw link', () => {
    const { text } = renderBrandedEmail(e);
    expect(text).toContain('Set your password & join: https://toothops.app/?a=1&b=2');
    expect(text).toContain('Ignore if unexpected.');
  });
});
