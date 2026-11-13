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

import { DG_URL, deepgramUrl } from './deepgramVoice';

// Captured from the pre-localization build: English must stay byte-identical.
const OLD_EN_DG_URL =
  'wss://api.deepgram.com/v1/listen?model=nova-3-medical&punctuate=true&smart_format=true&interim_results=true&diarize=true&utterances=true&endpointing=400&channels=1&language=en&encoding=linear16&mip_opt_out=true&sample_rate=16000&keyterm=Triadan&keyterm=maxillary&keyterm=mandibular&keyterm=rostral&keyterm=caudal&keyterm=buccal&keyterm=palatal&keyterm=lingual&keyterm=mesial&keyterm=distal&keyterm=cementoenamel%20junction&keyterm=incisor&keyterm=canine%20tooth&keyterm=premolar&keyterm=molar&keyterm=carnassial&keyterm=periodontal&keyterm=gingival&keyterm=gingivitis&keyterm=gingival%20recession&keyterm=gingival%20hyperplasia&keyterm=gingival%20enlargement&keyterm=enlargement&keyterm=furcation&keyterm=furcation%20exposure&keyterm=periodontal%20pocket&keyterm=attachment%20loss&keyterm=mobility&keyterm=calculus&keyterm=stomatitis&keyterm=halitosis&keyterm=malocclusion&keyterm=distoclusion&keyterm=mesioclusion&keyterm=crossbite&keyterm=buccoversion&keyterm=distoversion&keyterm=labioversion&keyterm=linguoversion&keyterm=mesioversion&keyterm=palatoversion&keyterm=complicated%20crown%20fracture&keyterm=uncomplicated%20crown%20fracture&keyterm=root%20fracture&keyterm=enamel%20hypoplasia&keyterm=enamel%20hypomineralization&keyterm=tooth%20resorption&keyterm=external%20resorption&keyterm=caries&keyterm=abrasion&keyterm=attrition&keyterm=pulp%20exposure&keyterm=pulpitis&keyterm=periapical&keyterm=non-vital&keyterm=discolored%20tooth&keyterm=persistent%20deciduous&keyterm=supernumerary&keyterm=missing%20tooth&keyterm=oronasal%20fistula&keyterm=epulis&keyterm=oral%20mass&keyterm=extraction&keyterm=surgical%20extraction&keyterm=scaling&keyterm=root%20planing&keyterm=subgingival&keyterm=supragingival&keyterm=gingivectomy&keyterm=gingivoplasty&keyterm=odontoplasty&keyterm=alveoloplasty&keyterm=apicoectomy&keyterm=pulpotomy&keyterm=root%20canal&keyterm=vital%20pulp%20therapy&keyterm=bonded%20sealant&keyterm=mucogingival%20flap&keyterm=intraoral%20radiograph&keyterm=biopsy&keyterm=infraorbital%20block&keyterm=mental%20nerve%20block&keyterm=inferior%20alveolar%20nerve%20block&keyterm=caudal%20maxillary%20nerve%20block&keyterm=bupivacaine&keyterm=lidocaine&keyterm=mepivacaine&keyterm=dexmedetomidine&keyterm=methadone&keyterm=hydromorphone&keyterm=buprenorphine&keyterm=butorphanol&keyterm=alfaxalone&keyterm=midazolam&keyterm=maropitant&keyterm=meloxicam&keyterm=carprofen&keyterm=gabapentin&keyterm=isoflurane&keyterm=sevoflurane';

describe('Deepgram connection', () => {
  it('opts out of Deepgram model training (no audio kept after the response)', () => {
    expect(new URL(DG_URL).searchParams.get('mip_opt_out')).toBe('true');
  });

  it('keeps the English URL byte-identical', () => {
    expect(deepgramUrl('en')).toBe(OLD_EN_DG_URL);
    expect(DG_URL).toBe(OLD_EN_DG_URL);
  });

  it('uses nova-3-medical with language=multi for other languages', () => {
    const en = new URL(deepgramUrl('en')).searchParams;
    const fr = new URL(deepgramUrl('fr')).searchParams;
    expect(fr.get('model')).toBe('nova-3-medical');
    expect(fr.get('language')).toBe('multi');
    expect(fr.get('mip_opt_out')).toBe('true');
    for (const [k, v] of en) if (k !== 'language' && k !== 'keyterm') expect(fr.get(k)).toBe(v);
    expect(fr.getAll('keyterm')).toContain('parodontite');
  });
});

import { startDeepgramSession } from './deepgramVoice';
import { VOICE_STT } from './voice/sttConfig';

describe('Deepgram handshake fallback', () => {
  class FakeWs {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    static instances: FakeWs[] = [];
    readyState = FakeWs.CONNECTING;
    binaryType = '';
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: ((e: { code: number }) => void) | null = null;
    constructor(public url: string) { FakeWs.instances.push(this); }
    send() { /* ignore */ }
    close() { this.readyState = FakeWs.CLOSED; }
    /** What a browser does when the upgrade is refused. */
    failHandshake() {
      this.readyState = FakeWs.CLOSED;
      this.onerror?.();
      this.onclose?.({ code: 1006 });
    }
  }

  const fakeCtx = () => {
    const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
    return {
      sampleRate: 48000,
      state: 'running',
      destination: {},
      close: vi.fn(() => Promise.resolve()),
      resume: vi.fn(() => Promise.resolve()),
      createMediaStreamSource: vi.fn(node),
      createScriptProcessor: vi.fn(() => ({ ...node(), onaudioprocess: null })),
      createGain: vi.fn(() => ({ ...node(), gain: { value: 1 } })),
    } as unknown as AudioContext;
  };

  const handlers = () => ({ onInterim: vi.fn(), onFinal: vi.fn(), onError: vi.fn(), onClose: vi.fn() });
  const model = (ws: FakeWs) => new URL(ws.url).searchParams.get('model');
  const auth = { token: 't', kind: 'bearer' as const };

  beforeEach(() => {
    FakeWs.instances = [];
    vi.stubGlobal('WebSocket', FakeWs);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [], getAudioTracks: () => [] })) },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('gives non-English languages nova-3 as the fallback model and English none', () => {
    expect(VOICE_STT.en.fallbackModel).toBeUndefined();
    for (const l of ['fr', 'de', 'it', 'es'] as const) expect(VOICE_STT[l].fallbackModel).toBe('nova-3');
  });

  it('retries a failed fr handshake once with model=nova-3, same params', async () => {
    const h = handlers();
    await startDeepgramSession(auth, h, fakeCtx(), 'fr');
    expect(FakeWs.instances).toHaveLength(1);
    expect(model(FakeWs.instances[0])).toBe('nova-3-medical');
    FakeWs.instances[0].failHandshake();
    expect(FakeWs.instances).toHaveLength(2);
    const first = new URL(FakeWs.instances[0].url).searchParams;
    const second = new URL(FakeWs.instances[1].url).searchParams;
    expect(model(FakeWs.instances[1])).toBe('nova-3');
    expect(second.get('language')).toBe('multi');
    for (const [k, v] of first) if (k !== 'model' && k !== 'keyterm') expect(second.get(k)).toBe(v);
    expect(second.getAll('keyterm')).toEqual(first.getAll('keyterm'));
    expect(h.onError).not.toHaveBeenCalled();
    expect(h.onClose).not.toHaveBeenCalled();
    // The fallback socket works normally.
    const ws = FakeWs.instances[1];
    ws.readyState = FakeWs.OPEN;
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ type: 'Results', is_final: false, channel: { alternatives: [{ transcript: 'bonjour' }] } }) });
    expect(h.onInterim).toHaveBeenCalledWith('bonjour');
  });

  it('reports the existing error when the fallback handshake fails too', async () => {
    const h = handlers();
    await startDeepgramSession(auth, h, fakeCtx(), 'de');
    FakeWs.instances[0].failHandshake();
    FakeWs.instances[1].failHandshake();
    expect(FakeWs.instances).toHaveLength(2);
    expect(h.onError).toHaveBeenCalledTimes(1);
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });

  it('does not retry English (existing behaviour)', async () => {
    const h = handlers();
    await startDeepgramSession(auth, h, fakeCtx(), 'en');
    FakeWs.instances[0].failHandshake();
    expect(FakeWs.instances).toHaveLength(1);
    expect(h.onError).toHaveBeenCalledTimes(1);
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });

  it('does not retry once a transcript has arrived', async () => {
    const h = handlers();
    await startDeepgramSession(auth, h, fakeCtx(), 'it');
    const ws = FakeWs.instances[0];
    ws.readyState = FakeWs.OPEN;
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ type: 'Results', is_final: false, channel: { alternatives: [{ transcript: 'ciao' }] } }) });
    ws.readyState = FakeWs.CLOSED;
    ws.onclose?.({ code: 1011 });
    expect(FakeWs.instances).toHaveLength(1);
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });
});
