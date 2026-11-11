import type { PDFFont, PDFPage } from 'pdf-lib';
import { safeFont } from './pdf/safeFont';
import { OwnerReportModel, OwnerReportRenderSection, teethWithFindings } from './ownerReport';
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
  role: 'before' | 'after';
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

/** Characters outside Latin-1 that WinAnsi (and so Helvetica) encodes. */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const PDF_REPLACEMENTS: Record<string, string> = {
  '✕': 'X', '✖': 'X', '✓': 'v', '✔': 'v', '→': '->', '←': '<-',
  '≤': '<=', '≥': '>=', '−': '-', '‐': '-', '‑': '-', '\t': ' ',
};

/** Make text drawable with the standard Helvetica font: common symbols
 *  get ASCII stand-ins; anything else WinAnsi can't encode (emoji, CJK…)
 *  is dropped rather than crashing the whole PDF. Newlines are kept. */
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
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch)) {
      out += ch;
    }
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
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
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const t = reportStrings(model.locale);
  const doc = await PDFDocument.create();
  // Belt and braces with pdfSafe: any text that slips past it still
  // can't throw on an unencodable character.
  const regular = safeFont(await doc.embedFont(StandardFonts.Helvetica));
  const bold = safeFont(await doc.embedFont(StandardFonts.HelveticaBold));

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
      page.drawText(line, { x: MARGIN + indent, y: y - size, size, font, color: opts.color ?? ink });
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
      page.drawText(line, { x: MARGIN, y: y - 12, size: 12, font: bold, color: teal });
    });
    y -= 20;
  };

  // ---- Header ------------------------------------------------------------
  let headerX = MARGIN;
  if (branding.logoUrl) {
    try {
      const logoBytes = new Uint8Array(await (await fetch(branding.logoUrl)).arrayBuffer());
      // Uploaded logos are canvas-re-encoded to PNG; tolerate JPEG too.
      const isPng = logoBytes[0] === 0x89 && logoBytes[1] === 0x50;
      const logo = isPng ? await doc.embedPng(logoBytes) : await doc.embedJpg(logoBytes);
      const h = 34;
      const w = (logo.width / logo.height) * h;
      page.drawImage(logo, { x: MARGIN, y: y - h, width: w, height: h });
      headerX = MARGIN + w + 12;
    } catch {
      // Logo fetch/decoding failed — header text alone is fine.
    }
  }
  const title = pdfSafe(model.title);
  page.drawText(pdfSafe(branding.practiceName) || title || t.defaultTitle, {
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
  const numbered = !!diagram && builtins.has('diagram') && findingsOn && findingsTeeth.length > 0;
  // The "nothing found" note prints where the last of the three finding
  // sections would have (by default: after the exam notes).
  const emptyChart =
    model.extracted.length === 0 && findingsTeeth.length === 0 && model.examNotes.length === 0;
  const findingSlots = model.sections
    .filter((s) => s.kind === 'builtin' && (s.id === 'extractions' || s.id === 'findings' || s.id === 'examNotes'))
    .map((s) => s.id);
  const emptyNoteAfter = findingsOn ? findingSlots[findingSlots.length - 1] : undefined;

  const renderBuiltin = async (section: BuiltinSection) => {
    switch (section.id) {
      case 'extractions': {
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
        if (findingsTeeth.length === 0) return;
        heading(section.heading);
        findingsTeeth.forEach((tooth, i) => {
          ensure(30);
          const prefix = numbered ? `${i + 1}.  ` : '';
          drawText(`${prefix}${tooth.layName}${tooth.extracted ? `  —  ${t.removedToday}` : ''}`, { font: bold, size: 10.5 });
          drawText(tooth.notes.join('; '), { indent: numbered ? 16 : 10, color: muted, gapAfter: 4 });
        });
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
        if (model.examNotes.length === 0) return;
        heading(section.heading);
        for (const note of model.examNotes) {
          drawText(`•  ${note.area}${note.comment ? `: ${note.comment}` : ` — ${t.abnormalityNoted}`}`, { indent: 10 });
        }
        return;
      }
      case 'photos': {
        if (photos.length === 0) return;
        heading(section.heading);
        const colW = (CONTENT_W - 16) / 2;
        const befores = photos.filter((p) => p.role === 'before');
        const afters = photos.filter((p) => p.role === 'after');
        const rows = Math.max(befores.length, afters.length);
        for (let i = 0; i < rows; i++) {
          const pair = [befores[i], afters[i]];
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
            const label = pdfSafe(`${col === 0 ? t.before : t.after}${photo.caption ? ` — ${photo.caption}` : ''}`);
            const labelLine = wrap(label, regular, 8.5, colW)[0];
            page.drawText(labelLine, { x, y: y - h - 12, size: 8.5, font: regular, color: muted });
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
