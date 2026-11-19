import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import i18n from '../../i18n';
import { effectiveNerveBlockDrugs, formatAnestheticDrug, type PatientInfo, type Logo, type NerveBlocks } from '../../types';
import { fieldLines, filledBlocks } from '../customAnesthesia';
import { answeredCustomExam } from '../customExam';
import { drawSectionCard, finishSectionCard, CARD_BAND_PT } from './draw';
import { PAGE_WIDTH_PT, PAGE_HEIGHT_PT, NERVE_BLOCK_BOX } from './layout';
import { PALETTE } from './styles';

export interface ClinicalContinuation { title: string; paragraphs: string[] }

function nerveBlockParagraphs(nb: NerveBlocks, lng: string, custom?: PatientInfo['customAnesthesia']): string[] {
  const t = i18n.getFixedT(lng, 'pdf');
  const blocks = [
    { label: t('anesthesia.blocks.infraorbital'), right: nb.infraorbitalRight, left: nb.infraorbitalLeft },
    { label: t('anesthesia.blocks.caudalMaxillary'), right: nb.caudalMaxillaryRight, left: nb.caudalMaxillaryLeft },
    { label: t('anesthesia.blocks.inferiorAlveolar'), right: nb.inferiorAlveolarRight, left: nb.inferiorAlveolarLeft },
    { label: t('anesthesia.blocks.mental'), right: nb.mentalRight, left: nb.mentalLeft },
    ...filledBlocks(custom).map(block => ({ ...block, label: block.label || i18n.getFixedT(lng, 'chart')('customAnesthesia.block') })),
  ].filter(block => block.right.trim() || block.left.trim());
  const fields = fieldLines(custom, lng);
  return [
    ...blocks.map(block => `${block.label}: ${[
      block.right.trim() && `${t('anesthesia.right')} ${t('anesthesia.dose', { value: block.right.trim() })}`,
      block.left.trim() && `${t('anesthesia.left')} ${t('anesthesia.dose', { value: block.left.trim() })}`,
    ].filter(Boolean).join('; ')}`),
    ...fields,
    ...(nb.other.trim() ? [`${t('anesthesia.other')}: ${nb.other}`] : []),
  ];
}

export function additionalNerveBlockContinuations(nb: NerveBlocks | undefined, lng: string): ClinicalContinuation[] {
  if (!nb) return [];
  const paragraphs = nerveBlockParagraphs(nb, lng);
  const drugs = nb.drugs.filter(drug => drug.name.trim()).map(formatAnestheticDrug);
  if (drugs.length) paragraphs.unshift(drugs.join(' + '));
  return paragraphs.length ? [{ title: i18n.getFixedT(lng, 'forms')('anesthesia.secondTitle'), paragraphs }] : [];
}

/** Full source values, independent of the compact cards' line limits. */
export function optionalClinicalContinuations(patient: PatientInfo, logo: Logo, lng: string): ClinicalContinuation[] {
  const t = i18n.getFixedT(lng, 'pdf');
  const blockParagraphs = nerveBlockParagraphs(patient.nerveBlocks, lng, patient.customAnesthesia);
  const anesthesia = blockParagraphs.length ? [{
    title: t('anesthesia.title'),
    paragraphs: [
      `${t('anesthesia.anesthetics')}: ${effectiveNerveBlockDrugs(patient.nerveBlocks, logo).map(formatAnestheticDrug).join(' + ')}`,
      ...blockParagraphs,
    ],
  }] : [];
  const areas = answeredCustomExam(patient.customExam);
  return [...anesthesia, ...(areas.length ? [{
    title: t('exam.additional'),
    paragraphs: areas.map(area => `${area.label}${area.status ? ` — ${t(area.status === 'normal' ? 'exam.normal' : 'exam.abnormal')}` : ''}${area.comment.trim() ? `: ${area.comment}` : ''}`),
  }] : [])];
}

/** Wraps even a single long token, retaining every character at a readable size. */
export function continuationLines(text: string, font: PDFFont, size: number, width: number): string[] {
  return text.split('\n').flatMap(paragraph => {
    const lines: string[] = [];
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && font.widthOfTextAtSize(`${line} ${word}`, size) <= width) { line += ` ${word}`; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const character of word) {
        if (line && font.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = ''; }
        line += character;
      }
    }
    return [...lines, line];
  });
}

export function drawContinuationNotice(page: PDFPage, font: PDFFont, bold: PDFFont, lng: string): number {
  const t = i18n.getFixedT(lng, 'pdf');
  const x = NERVE_BLOCK_BOX.xIn * 72;
  const width = (NERVE_BLOCK_BOX.labelColIn + 2 * NERVE_BLOCK_BOX.valueColIn) * 72;
  const lines = continuationLines(t('continuation.notice'), font, 9, width - 16);
  const top = PAGE_HEIGHT_PT - 0.30 * 72;
  const height = CARD_BAND_PT + 12 + lines.length * 13;
  const bodyTop = drawSectionCard(page, x, top, width, height, t('continuation.title'), bold);
  lines.forEach((line, index) => page.drawText(line, { x: x + 8, y: bodyTop - 13 - index * 13, size: 9, font, color: PALETTE.ink }));
  finishSectionCard(page, x, top, width, height);
  return 0.30 + height / 72;
}

/** One section per page, continued as needed; footer space is never consumed. */
export function drawClinicalContinuations(doc: PDFDocument, sections: ClinicalContinuation[], font: PDFFont, bold: PDFFont): void {
  const x = 0.40 * 72;
  const width = PAGE_WIDTH_PT - 2 * x;
  const top = PAGE_HEIGHT_PT - 0.30 * 72;
  const bottom = PAGE_HEIGHT_PT - 8 * 72;
  const fontSize = 9.5;
  const lineHeight = 14;
  const capacity = Math.floor((top - CARD_BAND_PT - 12 - bottom) / lineHeight);
  for (const section of sections) {
    const pages: string[][] = [];
    let current: string[] = [];
    for (const paragraph of section.paragraphs) {
      const lines = continuationLines(paragraph, font, fontSize, width - 16);
      // Keep a field and its value together whenever it fits on one page.
      if (current.length && lines.length <= capacity && current.length + 1 + lines.length > capacity) {
        pages.push(current); current = [];
      }
      if (current.length && current.length < capacity) current.push('');
      for (const line of lines) {
        if (current.length === capacity) { pages.push(current); current = []; }
        current.push(line);
      }
    }
    if (current.length) pages.push(current);
    for (const lines of pages) {
      const page = doc.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
      const bodyTop = drawSectionCard(page, x, top, width, top - bottom, section.title, bold);
      lines.forEach((line, index) => {
        if (line) page.drawText(line, { x: x + 8, y: bodyTop - 13 - index * lineHeight, size: fontSize, font, color: PALETTE.ink });
      });
      finishSectionCard(page, x, top, width, top - bottom);
    }
  }
}
