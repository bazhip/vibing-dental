import type { PDFFont, PDFPage } from 'pdf-lib';
import { OwnerReportModel } from './ownerReport';

/**
 * Renders the owner report model as a friendly one-to-two page Letter
 * PDF: practice header, plain-English findings, before & after photos,
 * home-care advice, and the recheck date. Deliberately separate from the
 * clinical chart PDF — this document is written for the pet's owner.
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

const TEAL = { r: 0.047, g: 0.42, b: 0.39 }; // matches the app's --primary
const INK = { r: 0.106, g: 0.153, b: 0.2 };
const MUTED = { r: 0.333, g: 0.404, b: 0.478 };

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

export async function buildOwnerReportPdfBytes(
  model: OwnerReportModel,
  branding: OwnerReportBranding,
  photos: OwnerReportPhoto[]
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

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
    for (const line of wrap(text, font, size, CONTENT_W - indent)) {
      ensure(lineHeight);
      page.drawText(line, { x: MARGIN + indent, y: y - size, size, font, color: opts.color ?? ink });
      y -= lineHeight;
    }
    y -= opts.gapAfter ?? 0;
  };

  const heading = (text: string) => {
    ensure(34);
    y -= 10;
    page.drawText(text, { x: MARGIN, y: y - 12, size: 12, font: bold, color: teal });
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
  page.drawText(branding.practiceName || 'Dental Visit Report', {
    x: headerX, y: y - 14, size: 15, font: bold, color: ink,
  });
  if (branding.doctorName) {
    page.drawText(branding.doctorName, { x: headerX, y: y - 28, size: 9.5, font: regular, color: muted });
  }
  const title = 'Dental Visit Report';
  page.drawText(title, {
    x: PAGE_W - MARGIN - bold.widthOfTextAtSize(title, 11),
    y: y - 14, size: 11, font: bold, color: teal,
  });
  if (model.visitDate) {
    page.drawText(model.visitDate, {
      x: PAGE_W - MARGIN - regular.widthOfTextAtSize(model.visitDate, 9.5),
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
    `Patient: ${model.patientName || '—'} (${model.speciesLabel})`,
    model.ownerName ? `Owner: ${model.ownerName}` : '',
  ].filter(Boolean).join('    ');
  drawText(patientLine, { font: bold, size: 11, gapAfter: 6 });

  if (model.intro) drawText(model.intro, { color: muted, gapAfter: 4 });

  // ---- Extractions -------------------------------------------------------
  if (model.extracted.length > 0) {
    heading('Teeth removed during this visit');
    drawText(
      'These teeth could not be saved and were removed so they no longer cause pain or infection:',
      { gapAfter: 2 }
    );
    for (const name of model.extracted) drawText(`•  ${name}`, { indent: 10 });
    y -= 4;
  }

  // ---- Findings ----------------------------------------------------------
  const findingsTeeth = model.teeth.filter((t) => t.notes.length > 0);
  if (findingsTeeth.length > 0) {
    heading('What we found');
    for (const tooth of findingsTeeth) {
      ensure(30);
      drawText(`${tooth.layName}${tooth.extracted ? '  —  removed today' : ''}`, { font: bold, size: 10.5 });
      drawText(tooth.notes.join('; '), { indent: 10, color: muted, gapAfter: 4 });
    }
  }

  if (model.alreadyMissing.length > 0) {
    drawText(
      `Already missing before this visit: ${model.alreadyMissing.join(', ')}.`,
      { color: muted, gapAfter: 4 }
    );
  }

  if (model.examNotes.length > 0) {
    heading('Other exam notes');
    for (const note of model.examNotes) {
      drawText(`•  ${note.area}${note.comment ? `: ${note.comment}` : ' — abnormality noted'}`, { indent: 10 });
    }
  }

  if (model.extracted.length === 0 && findingsTeeth.length === 0 && model.examNotes.length === 0) {
    heading('What we found');
    drawText('No dental problems were recorded on the chart for this visit — great news!');
  }

  // ---- Before & after ----------------------------------------------------
  if (photos.length > 0) {
    heading('Before & after');
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
        const label = `${col === 0 ? 'Before' : 'After'}${photo.caption ? ` — ${photo.caption}` : ''}`;
        const labelLine = wrap(label, regular, 8.5, colW)[0];
        page.drawText(labelLine, { x, y: y - h - 12, size: 8.5, font: regular, color: muted });
      });
      y -= rowH + 26;
    }
  }

  // ---- Team note + home care + recheck ------------------------------------
  if (model.extraNotes) {
    heading('A note from your veterinary team');
    drawText(model.extraNotes);
  }

  if (model.homecareTips.length > 0) {
    heading(`Caring for ${model.patientName || 'your pet'}’s teeth at home`);
    for (const tip of model.homecareTips) {
      drawText(`•  ${tip}`, { indent: 10 });
    }
  }

  if (model.recallDate) {
    y -= 6;
    ensure(20);
    drawText(`Recommended recheck: ${model.recallDate}`, { font: bold, size: 11, color: teal });
  }

  y -= 8;
  drawText(
    `Prepared by ${branding.doctorName || 'your veterinary team'}${branding.practiceName ? `, ${branding.practiceName}` : ''}.`,
    { size: 8.5, color: muted }
  );

  return doc.save();
}
