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
