import { Resampler } from './deepgramVoice';

describe('Resampler', () => {
  it('downsamples 48 kHz to 16 kHz Int16', () => {
    const r = new Resampler(48000, 16000);
    const out = new Int16Array(r.process(new Float32Array(4800).fill(0.5)));
    expect(out.length).toBe(1600);
    expect(Math.abs(out[100] - 0.5 * 0x7fff)).toBeLessThan(2);
  });

  it('keeps fractional position across chunks (44.1 kHz)', () => {
    const r = new Resampler(44100, 16000);
    let total = 0;
    for (let i = 0; i < 10; i++) total += r.process(new Float32Array(441)).byteLength / 2;
    // 4410 input samples → 1600 output samples, give or take one.
    expect(Math.abs(total - 1600)).toBeLessThanOrEqual(1);
  });

  it('clips out-of-range input', () => {
    const r = new Resampler(16000, 16000);
    const out = new Int16Array(r.process(new Float32Array([2, -2])));
    expect(Array.from(out)).toEqual([32767, -32768]);
  });
});

import { DG_URL } from './deepgramVoice';

describe('Deepgram connection', () => {
  it('opts out of Deepgram model training (no audio kept after the response)', () => {
    expect(new URL(DG_URL).searchParams.get('mip_opt_out')).toBe('true');
  });
});
