/**
 * Turns the dictation transcript into speaker turns for display.
 *
 * Deepgram's diarized segments carry inline "Speaker N: " prefixes (see
 * formatSpeakerLabeled), possibly several per segment. With two or more
 * speakers, consecutive text from the same speaker becomes one turn. With
 * one speaker or none (browser speech has no diarization) there are no
 * names to show, so each pause gets its own line instead.
 *
 * Display only: the downloaded transcript and the text sent to the AI keep
 * their original form.
 */

export interface TranscriptTurn {
  /** Deepgram's 0-based speaker number, or null when unknown. */
  speaker: number | null;
  /** Final text. */
  text: string;
  /** Live, not-yet-final words at the end of this turn. */
  interim: string;
}

export interface TranscriptView {
  turns: TranscriptTurn[];
  /** More than one speaker was heard — show speaker names. */
  multiSpeaker: boolean;
}

const LABEL = /Speaker (\d+):\s*/g;

interface Piece {
  speaker: number | null; // null = no label (continues the current speaker)
  text: string;
}

function pieces(text: string): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  let speaker: number | null = null;
  for (const m of text.matchAll(LABEL)) {
    const before = text.slice(last, m.index).trim();
    if (before) out.push({ speaker, text: before });
    speaker = Number(m[1]);
    last = (m.index ?? 0) + m[0].length;
  }
  const rest = text.slice(last).trim();
  if (rest || speaker != null) out.push({ speaker, text: rest });
  return out;
}

const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b);

export function transcriptTurns(segments: string[], interim: string): TranscriptView {
  const segPieces = segments.map(pieces);
  const interimPieces = pieces(interim.trim());
  const speakers = new Set<number>();
  for (const p of [...segPieces.flat(), ...interimPieces]) if (p.speaker != null) speakers.add(p.speaker);
  const multiSpeaker = speakers.size > 1;

  const turns: TranscriptTurn[] = [];
  let current: number | null = null;
  const add = (speaker: number | null, text: string, isInterim: boolean, forceNew: boolean) => {
    const prev = turns[turns.length - 1];
    if (prev && !forceNew && prev.speaker === speaker && !(isInterim === false && prev.interim)) {
      if (isInterim) prev.interim = join(prev.interim, text);
      else prev.text = join(prev.text, text);
      return;
    }
    turns.push({ speaker, text: isInterim ? '' : text, interim: isInterim ? text : '' });
  };

  for (const ps of segPieces) {
    let firstInSegment = true;
    for (const p of ps) {
      const speaker = p.speaker ?? current;
      current = speaker;
      if (!p.text) continue;
      // Without speaker names, every pause starts its own line.
      add(speaker, p.text, false, !multiSpeaker && firstInSegment);
      firstInSegment = false;
    }
  }
  for (const p of interimPieces) {
    const speaker = p.speaker ?? current;
    current = speaker;
    if (!p.text) continue;
    add(speaker, p.text, true, false);
  }
  return { turns: turns.filter((t) => t.text || t.interim), multiSpeaker };
}
