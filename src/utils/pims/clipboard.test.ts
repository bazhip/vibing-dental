import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plainTextToHtml, recordNoteHtml, recordNoteText, type RecordNote } from '../recordNote';
import { buildCopyContent, copyChartImage } from './clipboard';

const note: RecordNote = { sections: [
  { key: 'exam', heading: 'Exam & findings', lines: ['Normal <exam>'] },
  { key: 'treatment', heading: 'Treatment', lines: ['Generated "plan"'] },
] };
const png = 'data:image/png;base64,iVBORw0KGgo=';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('buildCopyContent', () => {
  it('builds generated whole-note and section text with escaped HTML and no image', () => {
    expect(buildCopyContent(note, null)).toEqual({
      all: { text: recordNoteText(note), html: recordNoteHtml(note) },
      sections: [
        { key: 'exam', heading: 'Exam & findings', text: 'EXAM & FINDINGS\nNormal <exam>', html: '<p><strong>Exam &amp; findings</strong><br>Normal &lt;exam&gt;</p>' },
        { key: 'treatment', heading: 'Treatment', text: 'TREATMENT\nGenerated "plan"', html: '<p><strong>Treatment</strong><br>Generated &quot;plan&quot;</p>' },
      ],
    });
  });

  it('preserves stored edits exactly and splits section bodies without regenerating', () => {
    const stored = '\nEXAM & FINDINGS\r\nEdited <exam>\r\n\r\nTREATMENT\r\nEdited & plan\r\n';
    const result = buildCopyContent(note, stored);
    expect(result.all).toEqual({ text: stored, html: plainTextToHtml(stored) });
    expect(result.sections.map((section) => section.text)).toEqual(['EXAM & FINDINGS\nEdited <exam>', 'TREATMENT\nEdited & plan\n']);
    expect(result.sections[0].html).toContain('Edited &lt;exam&gt;');
    expect(result.sections[1].html).toContain('Edited &amp; plan');
  });

  it.each(['', 'Manually edited <note>', 'Preamble\n' + recordNoteText(note), 'TREATMENT\nFirst\nEXAM & FINDINGS\nLast'])('preserves unsplittable stored text %j without generated sections', (stored) => {
    expect(buildCopyContent(note, stored)).toEqual({ all: { text: stored, html: plainTextToHtml(stored) }, sections: [] });
  });

  it('handles notes without generated sections without losing stored text', () => {
    expect(buildCopyContent({ sections: [] }, 'Edited')).toEqual({ all: { text: 'Edited', html: '<p>Edited</p>' }, sections: [] });
    expect(buildCopyContent({ sections: [] }, null)).toEqual({ all: { text: '', html: '' }, sections: [] });
  });
});

describe('copyChartImage', () => {
  let payload: Record<string, Promise<Blob>>;
  let write: ReturnType<typeof vi.fn>;
  let supports: ReturnType<typeof vi.fn>;
  let construct: ReturnType<typeof vi.fn<(data: Record<string, Promise<Blob>>) => void>>;

  beforeEach(() => {
    supports = vi.fn(() => true);
    construct = vi.fn<(data: Record<string, Promise<Blob>>) => void>();
    vi.stubGlobal('ClipboardItem', class {
      static supports = supports;
      constructor(data: Record<string, Promise<Blob>>) { construct(data); payload = data; }
    });
    write = vi.fn(async () => { await payload['image/png']; });
    vi.stubGlobal('navigator', { clipboard: { write } });
    vi.stubGlobal('fetch', vi.fn(() => { throw new TypeError(); }));
  });

  it('writes synchronously before invoking delayed rendering and supplies a PNG Blob promise', async () => {
    let finish!: (value: string) => void;
    const render = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
    const result = copyChartImage(render);
    expect(write).toHaveBeenCalledOnce();
    expect(render).not.toHaveBeenCalled();
    expect(payload['image/png']).toBeInstanceOf(Promise);
    await Promise.resolve();
    expect(render).toHaveBeenCalledOnce();
    finish(png);
    expect(await result).toBe('copied');
    const blob = await payload['image/png'];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(8);
    expect(fetch).not.toHaveBeenCalled();
    expect(Object.keys(payload)).toEqual(['image/png']);
  });

  it.each(['clipboard', 'write', 'item', 'png'])('returns unavailable without rendering when %s support is absent', async (missing) => {
    if (missing === 'clipboard') vi.stubGlobal('navigator', {});
    if (missing === 'write') vi.stubGlobal('navigator', { clipboard: {} });
    if (missing === 'item') vi.stubGlobal('ClipboardItem', undefined);
    if (missing === 'png') supports.mockReturnValue(false);
    const render = vi.fn(async () => png);
    expect(await copyChartImage(render)).toBe('unavailable');
    expect(render).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('accepts browsers without ClipboardItem.supports', async () => {
    Reflect.deleteProperty(ClipboardItem, 'supports');
    expect(await copyChartImage(async () => png)).toBe('copied');
  });

  it.each([null, '', 'https://example.test/chart.png', 'data:image/jpeg;base64,iVBORw0KGgo=', 'data:image/png;base64,AAAA', 'data:image/png;base64,AAAAAAAAAAA=', 'data:image/png;base64,!!!!', 'data:image/png;base64,iVBORw0KGgo', 'data:image/png;base64,iVBORw0KGgp=', 'data:image/png;base64,', 'data:image/png,abc', png + '\n'])('fails for null, malformed or non-PNG output %j', async (value) => {
    expect(await copyChartImage(async () => value)).toBe('failed');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('handles delayed rendering rejection', async () => {
    let rejectRender!: (reason: unknown) => void;
    const result = copyChartImage(() => new Promise((resolve, reject) => { void resolve; rejectRender = reject; }));
    expect(write).toHaveBeenCalledOnce();
    await Promise.resolve();
    rejectRender(new TypeError());
    expect(await result).toBe('failed');
  });

  it('handles synchronous rendering failure', async () => {
    expect(await copyChartImage(() => { throw new TypeError(); })).toBe('failed');
  });

  it('handles clipboard rejection even when rendering also rejects later', async () => {
    write.mockRejectedValue(new TypeError());
    let rejectRender!: (reason: unknown) => void;
    const result = copyChartImage(() => new Promise((resolve, reject) => { void resolve; rejectRender = reject; }));
    expect(await result).toBe('failed');
    rejectRender(new TypeError());
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it.each(['construction', 'write'])('handles synchronous %s failure without leaking image rejections', async (failure) => {
    if (failure === 'construction') construct.mockImplementation(() => { throw new TypeError(); });
    else write.mockImplementation(() => { throw new TypeError(); });
    expect(await copyChartImage(async () => { throw new TypeError(); })).toBe('failed');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('does not report success when a clipboard implementation ignores an invalid image promise', async () => {
    write.mockResolvedValue(undefined);
    expect(await copyChartImage(async () => null)).toBe('failed');
  });

  it('waits for clipboard acknowledgment after successful rendering', async () => {
    let finishWrite!: () => void;
    write.mockImplementation(() => new Promise<void>((resolve) => { finishWrite = resolve; }));
    const settled = vi.fn();
    const result = copyChartImage(async () => png);
    void result.then(settled);
    await payload['image/png'];
    expect(settled).not.toHaveBeenCalled();
    finishWrite();
    expect(await result).toBe('copied');
  });
});
