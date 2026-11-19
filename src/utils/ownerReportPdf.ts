import { loadPracticeLogoBytes } from './practiceLogoCache';
import i18n from '../i18n';
import type { PDFFont, PDFPage } from 'pdf-lib';
import { wrapToWidth } from './pdf/draw';
import { embedPdfFonts } from './pdf/fonts';
import { OwnerReportModel, OwnerReportRenderSection, teethWithFindings } from './ownerReport';

/** What the Findings section prints, in order: mouth-wide summary lines,
 *  the per-tooth list (numbered when the diagram carries pins), then the
 *  vet's notes with no tooth. `print` is false when all three are empty. */
export interface FindingsLayout {
  summary: string[];
  teeth: { label: string; notes: string; extracted: boolean }[];
  other: { heading: string; lines: string[] } | null;
  print: boolean;
}

export function findingsLayout(model: OwnerReportModel, numbered: boolean): FindingsLayout {
  const teeth = teethWithFindings(model).map((tooth, i) => ({
    label: `${numbered ? `${i + 1}.  ` : ''}${tooth.layName}`,
    notes: tooth.notes.join('; '),
    extracted: tooth.extracted,
  }));
  const other = model.otherFindings.length
    ? { heading: reportStrings(model.locale).otherFindingsHeading, lines: model.otherFindings }
    : null;
  return { summary: model.summaryLines, teeth, other, print: model.summaryLines.length > 0 || teeth.length > 0 || !!other };
}

/** Nothing at all to report: prints the "no findings recorded" note. */
export function nothingFound(model: OwnerReportModel): boolean {
  return !model.extractionsText?.trim() && !model.findingsText?.trim() && !model.examNotesText?.trim()
    && model.extracted.length === 0 && model.examNotes.length === 0 && !findingsLayout(model, false).print;
}
import type { BuiltInSectionId } from './ownerReportConfig';
import { reportStrings } from './ownerReportI18n';

/**
 * Renders the owner report model as a friendly one-to-two page Letter
 * PDF: practice header, plain-English findings, before & after photos,
 * home-care advice, and the recheck date. Deliberately separate from the
 * clinical chart PDF — this document is written for the pet's owner.
 *
 * Section order, headings, custom text sections, the title, closing note
 * and footer all come from the model (i.e. the practice's template); the
 * default template reproduces the original fixed layout.
 */

export interface OwnerReportBranding {
  practiceName: string;
  doctorName: string;
  /** Uploaded practice logo (PNG after upload re-encoding); '' for none. */
  logoUrl: string;
}

export interface OwnerReportPhoto {
  role: 'before' | 'after' | null;
  caption: string;
  /** Pre-downscaled JPEG bytes (the modal re-encodes before handing off). */
  jpegBytes: Uint8Array;
}

const PAGE_W = 612; // Letter portrait
const PAGE_H = 792;
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;
/** Baseline of the (optional) footer — inside the bottom margin, so it
 *  never collides with body text. */
const FOOTER_Y = 26;

const TEAL = { r: 0.047, g: 0.42, b: 0.39 }; // matches the app's --primary
const INK = { r: 0.106, g: 0.153, b: 0.2 };
const MUTED = { r: 0.333, g: 0.404, b: 0.478 };

/** Readable stand-ins shared with the established Latin reports. */
const PDF_REPLACEMENTS: Record<string, string> = {
  '✕': 'X', '✖': 'X', '✓': 'v', '✔': 'v', '→': '->', '←': '<-',
  '≤': '<=', '≥': '>=', '−': '-', '‐': '-', '‑': '-', '\t': ' ',
};

/** Preserve supported Latin alphabets and readable symbol stand-ins.
 * Preserve CJK and Arabic for the locale's lazily embedded Unicode fonts.
 * Standard-font reports still use safeFont for unsupported glyphs. */
export function pdfSafe(text: string): string {
  let out = '';
  for (const ch of text) {
    if (ch === '\n') {
      out += ch;
      continue;
    }
    const mapped = PDF_REPLACEMENTS[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const code = ch.codePointAt(0)!;
    if (code >= 0x20 && !/\p{Extended_Pictographic}/u.test(ch)) {
      out += ch;
    }
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  return text.split('\n').flatMap(paragraph => {
    const lines = wrapToWidth(paragraph, font, size, maxWidth);
    return lines.length ? lines : [''];
  });
}

/** The mouth diagram for the owner: the procedure diagram (missing teeth
 *  filled, teeth removed today crossed out) with a numbered pin on each
 *  tooth that has a finding — numbers match "What we found". */
export interface OwnerReportDiagram {
  png: Uint8Array;
}

type BuiltinSection = Extract<OwnerReportRenderSection, { kind: 'builtin' }>;

export async function buildOwnerReportPdfBytes(
  model: OwnerReportModel,
  branding: OwnerReportBranding,
  photos: OwnerReportPhoto[],
  diagram?: OwnerReportDiagram
): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const t = reportStrings(model.locale);
  const rtl = model.locale === 'ar';
  const doc = await PDFDocument.create();
  const { regular, bold } = await embedPdfFonts(doc, model.locale, 'sans', JSON.stringify([model, branding, photos]));

  const teal = rgb(TEAL.r, TEAL.g, TEAL.b);
  const ink = rgb(INK.r, INK.g, INK.b);
  const muted = rgb(MUTED.r, MUTED.g, MUTED.b);

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const ensure = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const drawText = (
    text: string,
    opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; gapAfter?: number } = {}
  ) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10.5;
    const indent = opts.indent ?? 0;
    const lineHeight = size * 1.45;
    for (const line of wrap(pdfSafe(text), font, size, CONTENT_W - indent)) {
      ensure(lineHeight);
      page.drawText(line, { x: rtl ? PAGE_W - MARGIN - indent - font.widthOfTextAtSize(line, size) : MARGIN + indent, y: y - size, size, font, color: opts.color ?? ink });
      y -= lineHeight;
    }
    y -= opts.gapAfter ?? 0;
  };

  const heading = (text: string) => {
    const lines = wrap(pdfSafe(text), bold, 12, CONTENT_W);
    ensure(34);
    y -= 10;
    lines.forEach((line, i) => {
      if (i > 0) {
        ensure(16);
        y -= 16;
      }
      page.drawText(line, { x: rtl ? PAGE_W - MARGIN - bold.widthOfTextAtSize(line, 12) : MARGIN, y: y - 12, size: 12, font: bold, color: teal });
    });
    y -= 20;
  };

  // ---- Header ------------------------------------------------------------
  let headerX = MARGIN;
  if (branding.logoUrl) {
    try {
      const bytes = await loadPracticeLogoBytes(branding.logoUrl);
      if (bytes) {
        const logoBytes = new Uint8Array(bytes);
        // Uploaded logos are canvas-re-encoded to PNG; tolerate JPEG too.
        const isPng = logoBytes[0] === 0x89 && logoBytes[1] === 0x50;
        const logo = isPng ? await doc.embedPng(logoBytes) : await doc.embedJpg(logoBytes);
        const h = 34;
        const w = (logo.width / logo.height) * h;
        page.drawImage(logo, { x: MARGIN, y: y - h, width: w, height: h });
        headerX = MARGIN + w + 12;
      }
    } catch {
      // Logo fetch/decoding failed — header text alone is fine.
    }
  }
  const title = pdfSafe(model.title);
  const practice = pdfSafe(branding.practiceName) || title || t.defaultTitle;
  const doctor = pdfSafe(branding.doctorName);
  const visitDate = pdfSafe(model.visitDate);
  const availableHeaderWidth = PAGE_W - MARGIN - headerX;
  const stackedHeader = rtl || bold.widthOfTextAtSize(practice, 15) + (title ? bold.widthOfTextAtSize(title, 11) + 16 : 0) > availableHeaderWidth
    || regular.widthOfTextAtSize(doctor, 9.5) + regular.widthOfTextAtSize(visitDate, 9.5) + 16 > availableHeaderWidth;
  if (stackedHeader) {
    // Translated titles and long practice names need separate lines. Measure
    // before drawing so they cannot collide or escape the page margins.
    const headerText = (text: string, font: PDFFont, size: number, color: ReturnType<typeof rgb>) => {
      for (const line of wrap(text, font, size, availableHeaderWidth)) {
        y -= size * 1.4;
        page.drawText(line, { x: rtl ? PAGE_W - MARGIN - font.widthOfTextAtSize(line, size) : headerX, y, size, font, color });
      }
    };
    headerText(practice, bold, 15, ink);
    if (doctor) headerText(doctor, regular, 9.5, muted);
    if (title && title !== practice) {
      y -= 6;
      headerText(title, bold, 11, teal);
    }
    if (visitDate) headerText(visitDate, regular, 9.5, muted);
    y -= 14;
  } else {
    page.drawText(practice, {
      x: headerX, y: y - 14, size: 15, font: bold, color: ink,
    });
    if (branding.doctorName) {
      page.drawText(pdfSafe(branding.doctorName), { x: headerX, y: y - 28, size: 9.5, font: regular, color: muted });
    }
    if (title) {
      page.drawText(title, {
        x: PAGE_W - MARGIN - bold.widthOfTextAtSize(title, 11),
        y: y - 14, size: 11, font: bold, color: teal,
      });
    }
    if (model.visitDate) {
      const visitDate = pdfSafe(model.visitDate);
      page.drawText(visitDate, {
        x: PAGE_W - MARGIN - regular.widthOfTextAtSize(visitDate, 9.5),
        y: y - 28, size: 9.5, font: regular, color: muted,
      });
    }
    y -= 44;
  }
  page.drawLine({
    start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y },
    thickness: 1, color: teal,
  });
  y -= 14;

  // ---- Patient -----------------------------------------------------------
  const patientLine = [
    `${t.patientLabel}: ${model.patientName || '—'} (${model.speciesLabel})`,
    model.ownerName ? `${t.ownerLabel}: ${model.ownerName}` : '',
  ].filter(Boolean).join('    ');
  drawText(patientLine, { font: bold, size: 11, gapAfter: 6 });

  if (model.intro) drawText(model.intro, { color: muted, gapAfter: 4 });

  // ---- Sections, in template order ----------------------------------------
  const findingsTeeth = teethWithFindings(model);
  const builtins = new Map<BuiltInSectionId, BuiltinSection>();
  for (const section of model.sections) if (section.kind === 'builtin') builtins.set(section.id, section);
  const findingsOn = builtins.has('findings');
  const numbered = model.findingsText === undefined && !!diagram && builtins.has('diagram') && findingsOn && findingsTeeth.length > 0;
  // The "nothing found" note prints where the last of the three finding
  // sections would have (by default: after the exam notes).
  const emptyChart = nothingFound(model);
  const findingSlots = model.sections
    .filter((s) => s.kind === 'builtin' && (s.id === 'extractions' || s.id === 'findings' || s.id === 'examNotes'))
    .map((s) => s.id);
  const emptyNoteAfter = findingsOn ? findingSlots[findingSlots.length - 1] : undefined;

  const renderBuiltin = async (section: BuiltinSection) => {
    switch (section.id) {
      case 'extractions': {
        if (model.extractionsText !== undefined) {
          if (model.extractionsText.trim()) {
            heading(section.heading);
            drawText(model.extractionsText, { gapAfter: 4 });
          }
          return;
        }
        if (model.extracted.length === 0) return;
        heading(section.heading);
        drawText(t.extractionsLead, { gapAfter: 2 });
        for (const name of model.extracted) drawText(`•  ${name}`, { indent: 10 });
        y -= 4;
        return;
      }
      case 'diagram': {
        if (!diagram) return;
        try {
          const img = await doc.embedPng(diagram.png);
          const maxW = CONTENT_W * 0.62;
          const maxH = 270;
          const scale = Math.min(maxW / img.width, maxH / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          heading(section.heading);
          ensure(h + 24);
          page.drawImage(img, { x: MARGIN + (CONTENT_W - w) / 2, y: y - h, width: w, height: h });
          y -= h + 6;
          const legend = [
            numbered ? t.legendNumbers : '',
            model.alreadyMissing.length ? t.legendFilled : '',
            model.extracted.length ? t.legendRemoved : '',
          ].filter(Boolean).join('   ·   ');
          if (legend) {
            // Helvetica can't encode ✕ — pdfSafe spells it as X.
            const safe = pdfSafe(legend);
            const lw = regular.widthOfTextAtSize(safe, 8.5);
            page.drawText(safe, { x: MARGIN + (CONTENT_W - lw) / 2, y: y - 9, size: 8.5, font: regular, color: muted });
            y -= 16;
          }
        } catch {
          // A diagram that won't embed shouldn't cost the owner their report.
        }
        return;
      }
      case 'findings': {
        if (model.findingsText !== undefined) {
          if (model.findingsText.trim()) {
            heading(section.heading);
            drawText(model.findingsText, { gapAfter: 4 });
          }
          return;
        }
        const layout = findingsLayout(model, numbered);
        if (!layout.print) return;
        heading(section.heading);
        for (const line of layout.summary) drawText(`•  ${line}`, { indent: 10, gapAfter: 2 });
        if (layout.summary.length) y -= 4;
        for (const tooth of layout.teeth) {
          ensure(30);
          drawText(`${tooth.label}${tooth.extracted ? `  —  ${t.removedToday}` : ''}`, { font: bold, size: 10.5 });
          drawText(tooth.notes, { indent: numbered ? 16 : 10, color: muted, gapAfter: 4 });
        }
        if (layout.other) {
          ensure(30);
          drawText(layout.other.heading, { font: bold, size: 10.5 });
          for (const line of layout.other.lines) drawText(`•  ${line}`, { indent: 10, color: muted });
          y -= 4;
        }
        return;
      }
      case 'alreadyMissing': {
        if (model.alreadyMissing.length === 0) return;
        if (section.customHeading) {
          heading(section.heading);
          drawText(`${model.alreadyMissing.join(', ')}.`, { color: muted, gapAfter: 4 });
        } else {
          drawText(t.alreadyMissingLine(model.alreadyMissing.join(', ')), { color: muted, gapAfter: 4 });
        }
        return;
      }
      case 'examNotes': {
        if (model.examNotesText !== undefined) {
          if (model.examNotesText.trim()) {
            heading(section.heading);
            drawText(model.examNotesText, { gapAfter: 4 });
          }
          return;
        }
        if (model.examNotes.length === 0) return;
        heading(section.heading);
        for (const note of model.examNotes) {
          drawText(`•  ${note.area}${note.comment ? `: ${note.comment}` : ` — ${t.abnormalityNoted}`}`, { indent: 10 });
        }
        return;
      }
      case 'photos': {
        if (photos.length === 0) return;
        const unlabelled = photos.filter(photo => photo.role === null);
        const defaultHeading = t.headings.photos(model.patientName);
        heading(unlabelled.length && section.heading === defaultHeading
          ? i18n.getFixedT(model.locale, 'report')('visitImages') : section.heading);
        const colW = (CONTENT_W - 16) / 2;
        const befores = photos.filter(photo => photo.role === 'before');
        const afters = photos.filter(photo => photo.role === 'after');
        const rows = Array.from({ length: Math.max(befores.length, afters.length) }, (_, i) => [befores[i], afters[i]]);
        for (let i = 0; i < unlabelled.length; i += 2) rows.push([unlabelled[i], unlabelled[i + 1]]);
        for (const pair of rows) {
          // Tallest image in the row decides the row height.
          const embedded = await Promise.all(
            pair.map(async (photo) => (photo ? doc.embedJpg(photo.jpegBytes) : null))
          );
          const heights = embedded.map((img) => (img ? Math.min(180, (img.height / img.width) * colW) : 0));
          const rowH = Math.max(...heights, 0);
          ensure(rowH + 34);
          pair.forEach((photo, col) => {
            const img = embedded[col];
            if (!photo || !img) return;
            const x = MARGIN + col * (colW + 16);
            const h = heights[col];
            const w = Math.min(colW, (img.width / img.height) * h);
            page.drawImage(img, { x, y: y - h, width: w, height: h });
            const roleLabel = photo.role === 'before' ? t.before : photo.role === 'after' ? t.after : '';
            const label = pdfSafe([roleLabel, photo.caption].filter(Boolean).join(' — '));
            if (label) {
              const labelLine = wrap(label, regular, 8.5, colW)[0];
              page.drawText(labelLine, { x, y: y - h - 12, size: 8.5, font: regular, color: muted });
            }
          });
          y -= rowH + 26;
        }
        return;
      }
      case 'teamNote': {
        if (!model.extraNotes) return;
        heading(section.heading);
        drawText(model.extraNotes);
        return;
      }
      case 'homecare': {
        if (model.homecareTips.length === 0) return;
        heading(section.heading);
        for (const tip of model.homecareTips) drawText(`•  ${tip}`, { indent: 10 });
        return;
      }
      case 'recheck': {
        if (!model.recallDate) return;
        y -= 6;
        ensure(20);
        drawText(`${section.heading}: ${model.recallDate}`, { font: bold, size: 11, color: teal });
        return;
      }
    }
  };

  for (const section of model.sections) {
    if (section.kind === 'custom') {
      if (section.heading) heading(section.heading);
      if (section.body) drawText(section.body, { gapAfter: 2 });
      continue;
    }
    await renderBuiltin(section);
    if (emptyChart && section.id === emptyNoteAfter) {
      heading(builtins.get('findings')!.heading);
      drawText(t.noProblems);
    }
  }

  if (model.closingNote) {
    y -= 8;
    drawText(model.closingNote);
  }

  y -= 8;
  drawText(t.preparedBy(branding.doctorName, branding.practiceName), { size: 8.5, color: muted });

  // ---- Footer on every page ----------------------------------------------
  if (model.footer) {
    const size = 8;
    const lines = wrap(pdfSafe(model.footer), regular, size, CONTENT_W).filter(Boolean).slice(0, 2);
    for (const p of doc.getPages()) {
      lines.forEach((line, i) => {
        const lw = regular.widthOfTextAtSize(line, size);
        p.drawText(line, {
          x: MARGIN + (CONTENT_W - lw) / 2,
          y: FOOTER_Y + (lines.length - 1 - i) * (size * 1.35),
          size, font: regular, color: muted,
        });
      });
    }
  }

  return doc.save();
}
