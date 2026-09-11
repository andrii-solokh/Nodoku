// Single-line themes from Beethoven's public-domain compositions. Players set
// their own pace; the demo can follow these score-derived onset intervals.
export const MELODIES = {
  odeToJoy: {
    title: "Ode to Joy",
    source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=528",
    // The sixteen-bar soprano theme, transposed to C major.
    notes: [
      64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62,
      64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60,
      62, 62, 64, 60, 62, 64, 65, 64, 60, 62, 64, 65, 64, 62, 60, 62, 55,
      64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60,
    ],
    // Soprano durations from https://www.mutopiaproject.org/ftp/BeethovenLv/ode/ode.ly
    // Quarter-note units; the last half note leads into the repeated opening.
    beats: [
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, .5, 2,
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, .5, 2,
      1, 1, 1, 1, 1, .5, .5, 1, 1, 1, .5, .5, 1, 1, 1, 1, 2,
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, .5, 2,
    ],
    // Tonic endings of the two eight-bar halves, rather than the intervening
    // half cadence (D) or dominant (G) arrival. Indices are zero-based.
    phraseEnds: [29, 61],
  },
  furElise: {
    title: "Für Elise",
    source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=931",
    // Opening right-hand theme through its first A-minor cadence; checked
    // against the LilyPond transcription of Breitkopf & Härtel's 1888 score.
    notes: [
      76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 68, 71,
      72, 64, 76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 72, 71, 69,
    ],
    // Opening upper staff, including its first volta ending:
    // https://www.mutopiaproject.org/ftp/BeethovenLv/WoO59/fur_Elise_WoO59/fur_Elise_WoO59.ly
    // Each .75 includes the following sixteenth rest. The final quarter note
    // lasts one beat before repeating the two-sixteenth pickup.
    beats: [
      .25, .25, .25, .25, .25, .25, .25, .25,
      .75, .25, .25, .25, .75, .25, .25, .25,
      .75, .25, .25, .25, .25, .25, .25, .25, .25, .25,
      .75, .25, .25, .25, .75, .25, .25, .25, 1,
    ],
    // Tonic A arrivals followed by rests, and the first volta's final A.
    // The shorter arrivals are useful stopping points for this game excerpt.
    phraseEnds: [8, 26, 34],
  },
} as const;

export type MelodyName = keyof typeof MELODIES;
export type ConnectionMelody = MelodyName | "classic";

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function melodyNote(melody: MelodyName, index: number): number {
  const notes = MELODIES[melody].notes;
  const step = Number.isSafeInteger(index) && index >= 0 ? index : 0;
  return notes[step % notes.length];
}

/** Onset-to-next-onset duration, including rests; BPM counts quarter notes. */
export function melodyStepMs(melody: MelodyName, index: number, tempoBpm = 96): number {
  const beats = MELODIES[melody].beats;
  const step = Number.isSafeInteger(index) && index >= 0 ? index : 0;
  const tempo = Number.isFinite(tempoBpm) && tempoBpm > 0 ? tempoBpm : 96;
  return beats[step % beats.length] * 60000 / tempo;
}

/** Finish the current musical section without beginning one after a settled ending. */
export function melodyCompletionCount(melody: MelodyName, nextIndex: number): number {
  const { notes, phraseEnds } = MELODIES[melody];
  const ends: readonly number[] = phraseEnds;
  const step = Number.isSafeInteger(nextIndex) && nextIndex >= 0 ? nextIndex : 0;
  if (step > 0 && ends.includes((step - 1) % notes.length)) return 0;
  const position = step % notes.length;
  const end = ends.find(index => index >= position) ?? ends[0] + notes.length;
  return end - position + 1;
}
