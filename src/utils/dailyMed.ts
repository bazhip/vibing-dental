import { isNativeApp, WEB_ORIGIN } from '../native/platform';

export interface DailyMedProduct {
  id: string;
  title: string;
}
export interface DailyMedSection {
  title: string;
  text: string | null;
}

interface DailyMedLabel {
  sections: DailyMedSection[];
  strengths: string[];
}

const displayedSections = new Set(['34067-9', '34068-7', '34070-3', '34071-1', '42232-9', '34073-7', '34084-4', '43685-7']);
const plainElements = new Set(['paragraph', 'content', 'br']);
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

export function dailyMedSource(id: string) {
  return `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(id)}`;
}

function unusableLabel(): never {
  // eslint-disable-next-line no-restricted-syntax -- dev-only: surfaced through the translated lookup failure state
  throw new Error('Invalid DailyMed label');
}

export function parseDailyMedLabel(xml: string, id: string): DailyMedLabel {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return unusableLabel();
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const root = document.documentElement;
  const children = (el: Element, name: string) => Array.from(el.children).find(child => child.localName === name);
  if (root.localName !== 'document' || root.namespaceURI !== 'urn:hl7-org:v3'
    || children(root, 'setId')?.getAttribute('root')?.toLowerCase() !== id.toLowerCase()
    || !['50578-4', '50577-6'].includes(children(root, 'code')?.getAttribute('code') ?? '')) return unusableLabel();

  const plain = (node: Node): string => {
    if (!(node instanceof Element)) return node.textContent ?? '';
    if (node.localName === 'br') return '\n';
    const contents = Array.from(node.childNodes, plain).join('');
    return node.localName === 'paragraph' ? `\n\n${contents.trim()}\n\n` : contents;
  };
  const sections = Array.from(root.getElementsByTagNameNS('urn:hl7-org:v3', 'section')).flatMap(section => {
    const code = children(section, 'code')?.getAttribute('code');
    const title = children(section, 'title')?.textContent?.trim();
    const content = children(section, 'text');
    if (!code || !displayedSections.has(code) || !title || !content?.textContent?.trim()) return [];
    const complex = Array.from(content.getElementsByTagName('*')).some(element => !plainElements.has(element.localName))
      || !!Array.from(section.children).find(child => child.localName === 'component');
    return [{ title, text: complex ? null : plain(content).split('\n').map(line => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim() }];
  });
  const strengths = Array.from(root.getElementsByTagNameNS('urn:hl7-org:v3', 'ingredient')).flatMap(ingredient => {
    if (!['ACTIB', 'ACTIM', 'ACTIR'].includes(ingredient.getAttribute('classCode') ?? '')) return [];
    const substance = children(ingredient, 'ingredientSubstance');
    const name = substance && children(substance, 'name')?.textContent?.trim();
    const quantity = children(ingredient, 'quantity');
    const numerator = quantity && children(quantity, 'numerator');
    const denominator = quantity && children(quantity, 'denominator');
    const amount = numerator?.getAttribute('value');
    const unit = numerator?.getAttribute('unit');
    const per = denominator?.getAttribute('value');
    const perUnit = denominator?.getAttribute('unit');
    if (!name || !amount || !unit || !per || !perUnit || !/^[\d.]+$/.test(amount) || !/^[\d.]+$/.test(per)) return [];
    return [`${name} ${amount} ${unit}${per === '1' && perUnit === '1' ? '' : ` / ${per} ${perUnit}`}`];
  });
  return { sections, strengths: [...new Set(strengths)] };
}

async function requestDailyMed(params: Record<string, string>, signal: AbortSignal) {
  const endpoint = isNativeApp() && !import.meta.env.DEV ? new URL('/api/drug-reference', WEB_ORIGIN).href : '/api/drug-reference';
  const result = await fetch(`${endpoint}?${new URLSearchParams(params)}`, { credentials: 'omit', referrerPolicy: 'no-referrer', signal });
  if (!result.ok) return unusableLabel();
  return result;
}

export async function findDailyMedProducts(name: string, signal: AbortSignal): Promise<DailyMedProduct[]> {
  const { products } = await (await requestDailyMed({ q: name }, signal)).json();
  if (!Array.isArray(products)) return unusableLabel();
  return products.filter(product => typeof product?.title === 'string' && typeof product.id === 'string' && uuid.test(product.id));
}

export async function loadDailyMedLabel(id: string, signal: AbortSignal) {
  return parseDailyMedLabel(await (await requestDailyMed({ label: id }, signal)).text(), id);
}
