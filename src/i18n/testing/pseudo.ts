// Test kit: render a screen in a pseudo-locale where every catalog string reads
// ⟦like this⟧, then list any text that is not wrapped — it bypassed t().
import i18n from '../index';
import { NAMESPACES } from '../config';

const PSEUDO = 'xx';
const OPEN = '⟦';
const CLOSE = '⟧';

type Nested = { [k: string]: unknown };

function wrapAll(node: Nested): Nested {
  const out: Nested = {};
  for (const [k, v] of Object.entries(node)) {
    // Interpolation keeps {{placeholders}} intact inside the brackets.
    out[k] = typeof v === 'string' ? `${OPEN}${v}${CLOSE}` : wrapAll(v as Nested);
  }
  return out;
}

/** Registers language 'xx' (every English string wrapped as ⟦…⟧) and switches to it. */
export async function installPseudoLocale(): Promise<void> {
  for (const ns of NAMESPACES) {
    const en = i18n.getResourceBundle('en', ns) as Nested | undefined;
    if (en) i18n.addResourceBundle(PSEUDO, ns, wrapAll(en), true, true);
  }
  await i18n.changeLanguage(PSEUDO);
}

/** Switches back to English. */
export async function restoreLocale(): Promise<void> {
  await i18n.changeLanguage('en');
}

const TEXT_ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
const HAS_LETTER = /\p{L}/u;
const WRAPPED = /⟦[^⟦⟧]*⟧/g;

/** Every visible string or text attribute under `root` that contains a letter
 *  outside ⟦…⟧ and is not matched by `allow` (pass fixture data such as pet names). */
export function findUntranslated(root: HTMLElement, allow: (string | RegExp)[] = []): string[] {
  const found: string[] = [];
  const consider = (raw: string | null) => {
    const text = raw?.trim();
    if (!text || !HAS_LETTER.test(text.replace(WRAPPED, ''))) return;
    if (allow.some((a) => (typeof a === 'string' ? a === text : a.test(text)))) return;
    found.push(text);
  };
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node: Node | null = walker.currentNode; node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      consider(node.textContent);
      continue;
    }
    const el = node as Element;
    for (const attr of TEXT_ATTRS) consider(el.getAttribute(attr));
    if (el.tagName === 'BUTTON' || (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.getAttribute('type') ?? ''))) {
      consider(el.getAttribute('value'));
    }
  }
  return found;
}
