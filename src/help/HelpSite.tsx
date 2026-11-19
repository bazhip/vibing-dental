import React from 'react';
import { useTranslation } from 'react-i18next';
import { APP_LANGUAGES, isAppLanguage, LANGUAGE_NAMES, languageDirection } from '../i18n/config';
import { CHART_CUSTOMIZATION_CATEGORIES, HELP_GROUPS, HELP_SCREENSHOTS, HELP_SECTIONS, HELP_TOPICS, RELATED_HELP, helpRoute, searchHelp, type HelpTopic } from './topics';
import { CONTACT_EMAIL } from '../constants/plans';
import './help.css';

export function HelpSite() {
  const { t, i18n } = useTranslation(['help', 'settings']);
  const [hash, setHash] = React.useState(() => window.location.hash);
  const [query, setQuery] = React.useState('');
  const search = React.useRef<HTMLInputElement>(null);
  const content = React.useRef<HTMLElement>(null);
  const mobileTopics = React.useRef<HTMLDetailsElement>(null);
  const { topic, section } = helpRoute(hash);
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const currentLanguage = isAppLanguage(language) ? language : 'en';
  const searching = !!query.trim();
  const articles = HELP_TOPICS.map(id => ({
    id,
    title: t(`articles.${id}.title`),
    excerpt: t(`articles.${id}.intro`),
    text: HELP_SECTIONS.map(step => `${t(`articles.${id}.sections.${step}.title`)} ${t(`articles.${id}.sections.${step}.text`)}`).join(' '),
  }));
  const results = searchHelp(articles, query);
  const active = articles.find(article => article.id === topic);
  const screenshots = topic ? HELP_SCREENSHOTS[topic] ?? [] : [];
  const customizationCategories = CHART_CUSTOMIZATION_CATEGORIES.map(id => ({
    id,
    label: id === 'anesthesia' || id === 'charting'
      ? t(`settings:chart.${id}.title`)
      : t(`settings:chart.customization.categories.${id}`),
    description: t(`settings:chart.customization.descriptions.${id}`),
  }));

  React.useEffect(() => {
    const onHash = () => { setHash(window.location.hash); setQuery(''); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.matches('input, textarea, select'))) return;
      event.preventDefault();
      search.current?.focus();
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  React.useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = languageDirection(language);
  }, [language]);

  React.useEffect(() => {
    document.title = active ? `${active.title} – ${t('site.title')}` : t('site.title');
  }, [active?.title, t]);

  React.useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [topic, section]);

  const activate = (event: React.MouseEvent<HTMLAnchorElement>, target: HelpTopic | '') => {
    if (event.button || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    const next = target ? `#${target}` : window.location.pathname + window.location.search;
    if (window.location.hash !== (target ? next : '')) window.history.pushState(null, '', next);
    setHash(target ? next : '');
    setQuery('');
    if (mobileTopics.current) mobileTopics.current.open = false;
    // Focus the destination after the article replaces the search results.
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      content.current?.focus({ preventScroll: true });
    });
  };

  const topicNavigation = (label: string) => (
    <nav aria-label={label}>
      {Object.entries(HELP_GROUPS).map(([group, topics]) => (
        <section key={group} className="help-group">
          <h2>{t(`groups.${group as keyof typeof HELP_GROUPS}`)}</h2>
          {topics.map((id: HelpTopic) => <a key={id} href={`#${id}`} aria-current={topic === id ? 'page' : undefined}
            onClick={event => activate(event, id)}>{t(`articles.${id}.title`)}</a>)}
        </section>
      ))}
    </nav>
  );

  return <div className="help-site" lang={language} dir={languageDirection(language)}>
    <a className="help-skip" href="#help-content" onClick={event => {
      event.preventDefault();
      content.current?.focus();
    }}>{t('site.skip')}</a>
    <header className="help-header">
      <div className="help-header-inner">
        <a href={window.location.pathname + window.location.search} className="help-brand" onClick={event => activate(event, '')}>
          <img src="/favicon.svg" alt="" width={32} height={32} />
          {t('site.title')}
        </a>
        <a className="help-open-app" href="/">{t('site.openApp')} <span aria-hidden="true">→</span></a>
      </div>
    </header>
    <section className="help-masthead" aria-label={t('site.home')}>
      {!topic && !searching && <div className="help-welcome">
        <h1>{t('site.title')}</h1>
        <p>{t('site.intro')}</p>
      </div>}
      <div className="help-search" role="search">
        <label htmlFor="help-search" className="help-visually-hidden">{t('site.search')}</label>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <input id="help-search" ref={search} type="search" value={query} placeholder={t('site.searchHint')}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape' && searching) setQuery('');
            if (event.key === 'Enter' && results[0]) content.current?.querySelector('a')?.focus();
          }} />
        {searching
          ? <button type="button" onClick={() => { setQuery(''); search.current?.focus(); }} aria-label={t('site.clear')}>×</button>
          : <kbd aria-hidden="true">/</kbd>}
      </div>
    </section>
    <div className="help-layout">
      <aside className="help-sidebar">{topicNavigation(t('site.topics'))}</aside>
      <details className="help-mobile-topics" ref={mobileTopics}>
        <summary>{t('site.topics')}</summary>
        {topicNavigation(t('site.topics'))}
      </details>
      <main className="help-content" id="help-content" tabIndex={-1} ref={content}>
        {searching ? <div>
          <h1>{t('site.results')}</h1>
          {results.length ? <ul className="help-results">{results.map(result => (
            <li key={result.id}>
              <a href={`#${result.id}`} onClick={event => activate(event, result.id)}>{result.title}</a>
              <p>{result.excerpt}</p>
            </li>
          ))}</ul> : <p role="status">{t('site.empty')}</p>}
        </div> : active && topic ? <article>
          <header className="help-article-header">
            <h1>{active.title}</h1>
            <p>{active.excerpt}</p>
          </header>
          <details className="help-mobile-outline">
            <summary>{t('site.onPage')}</summary>
            {HELP_SECTIONS.map(step => <a key={step} href={`#${topic}/${step}`} aria-current={section === step ? 'location' : undefined}>
              {t(`articles.${topic}.sections.${step}.title`)}
            </a>)}
          </details>
          {HELP_SECTIONS.map(step => <section className="help-step" key={step} id={step}>
            <h2>{t(`articles.${topic}.sections.${step}.title`)}</h2>
            {t(`articles.${topic}.sections.${step}.text`).split('\n\n').map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            {topic === 'preferences' && step === 'second' && <dl className="help-reference">
              {customizationCategories.map(category => <div key={category.id}>
                <dt>{category.label}</dt><dd>{category.description}</dd>
              </div>)}
            </dl>}
            {screenshots.filter(screenshot => screenshot.section === step).map(screenshot => {
              const caption = t(`images.${screenshot.caption}`);
              return <figure key={screenshot.src}>
                <a href={screenshot.src} target="_blank" rel="noopener noreferrer">
                  <img src={screenshot.src} width={screenshot.width} height={screenshot.height} loading="lazy" alt={caption} />
                </a>
                <figcaption aria-hidden="true">{caption}</figcaption>
              </figure>;
            })}
          </section>)}
          <section className="help-related">
            <h2>{t('site.related')}</h2>
            {RELATED_HELP[topic].map(id => <a key={id} href={`#${id}`} onClick={event => activate(event, id)}>
              {t(`articles.${id}.title`)} <span aria-hidden="true">→</span>
            </a>)}
          </section>
        </article> : <div className="help-landing">
          <a className="help-feature" href="#by-number" onClick={event => activate(event, 'by-number')}>
            <div>
              <h2>{t('articles.by-number.title')}</h2>
              <p>{t('articles.by-number.intro')}</p>
              <span>{t('site.guide')} <span aria-hidden="true">→</span></span>
            </div>
            <img src="/help/screenshots/by-tooth.jpg" alt="" />
          </a>
          <h2>{t('site.topics')}</h2>
          <div className="help-cards">
            {Object.entries(HELP_GROUPS).map(([group, topics]) => <section key={group} className="help-card">
              <h3>{t(`groups.${group as keyof typeof HELP_GROUPS}`)}</h3>
              <ul>{topics.map((id: HelpTopic) => <li key={id}><a href={`#${id}`} onClick={event => activate(event, id)}>{t(`articles.${id}.title`)}</a></li>)}</ul>
            </section>)}
          </div>
        </div>}
      </main>
      {!searching && topic && <aside className="help-outline">
        <nav aria-label={t('site.onPage')}>
          <h2>{t('site.onPage')}</h2>
          {HELP_SECTIONS.map(step => <a key={step} href={`#${topic}/${step}`} aria-current={section === step ? 'location' : undefined}>
            {t(`articles.${topic}.sections.${step}.title`)}
          </a>)}
        </nav>
      </aside>}
    </div>
    <footer className="help-footer">
      <label>{t('site.language')}
        <select value={currentLanguage} onChange={event => {
          const next = event.target.value;
          if (!isAppLanguage(next)) return;
          const url = new URL(window.location.href);
          url.searchParams.set('lang', next);
          window.history.replaceState(null, '', url);
          void i18n.changeLanguage(next);
        }}>
          {APP_LANGUAGES.map(id => <option key={id} value={id}>{LANGUAGE_NAMES[id]}</option>)}
        </select>
      </label>
      <a href={`mailto:${CONTACT_EMAIL}`}>{t('site.contact')}</a>
    </footer>
  </div>;
}
