// Score-derived single-line excerpts; onset intervals include rests.
// Attribution and adaptation details are published in /music-credits.html.
export const MELODIES = {
  odeToJoy: {
    title: "Ode to Joy",
    composer: "Ludwig van Beethoven",
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
    composer: "Ludwig van Beethoven",
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
  gymnopedie: {
    title: "Gymnopédie No. 1",
    composer: "Erik Satie",
    source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=37",
    // Opening melody, accompaniment omitted; final hold includes the next bar's quarter rest.
    notes: [78, 81, 79, 78, 73, 71, 73, 74, 69, 66],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 3, 13],
    phraseEnds: [9],
  },
  entertainer: {
    title: "The Entertainer",
    composer: "Scott Joplin",
    source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=263",
    // First strain opening with pickup; upper notes of chords.
    notes: [62, 63, 64, 72, 64, 72, 64, 72, 84, 86, 87, 88, 84, 86, 88, 83, 86, 84],
    beats: [0.25, 0.25, 0.25, 0.5, 0.25, 0.5, 0.25, 1.5, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.5, 0.25, 0.5, 1.5],
    phraseEnds: [17],
  },
  nachtmusik: {
    title: "Eine kleine Nachtmusik",
    composer: "Wolfgang Amadeus Mozart",
    source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=900",
    // Opening violin fanfares through the following tonic arrival.
    notes: [79, 74, 79, 74, 79, 74, 79, 83, 86, 84, 81, 84, 81, 84, 81, 78, 81, 74, 79],
    beats: [1.5, 0.5, 1.5, 0.5, 0.5, 0.5, 0.5, 0.5, 2.0, 1.5, 0.5, 1.5, 0.5, 0.5, 0.5, 0.5, 0.5, 2.0, 1.0],
    phraseEnds: [18],
  },
  canon: {
    title: "Canon in D",
    composer: "Johann Pachelbel",
    source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1700",
    // Opening violin line through the D arrival before the eighth-note variation.
    notes: [74, 73, 71, 69, 67, 66, 67, 71, 66, 57, 62, 66, 71, 74, 71, 73, 78, 76, 74, 73, 71, 69, 71, 73, 73, 74],
    beats: [2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 1.0, 1.0, 0.5],
    phraseEnds: [25],
  },
  melodie: {
    title: "Melody, Op. 68 No. 1",
    composer: "Robert Schumann",
    source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=647",
    // Second-half return of the theme through its C-major cadence; upper chord tones.
    notes: [76, 74, 72, 71, 69, 72, 71, 74, 72, 67, 81, 79, 77, 76, 74, 77, 71, 74, 72],
    beats: [1.0, 1.0, 1.0, 1.0, 0.5, 0.5, 0.5, 0.5, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.5, 0.5, 0.5, 0.5, 2.0],
    phraseEnds: [18],
  },
  summerGarden: {
    title: "In a Summer Garden",
    composer: "C. J. Brown",
    source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1038",
    // Closing coda; tied final E lasts six quarter-note beats.
    notes: [69, 69, 67, 66, 71, 64, 71, 64, 71, 76],
    beats: [1.0, 0.25, 0.25, 1.0, 0.5, 2.5, 0.5, 2.5, 0.5, 6.0],
    phraseEnds: [9],
  },
  tangoTrifle: {
    title: "A Tango Trifle",
    composer: "C. J. Brown",
    source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1039",
    // Opening eight bars through the marked Fine.
    notes: [60, 70, 60, 69, 60, 70, 60, 69, 65, 60, 62, 64, 65, 67, 69, 72, 67, 72, 65, 60, 62, 64, 65, 67, 65, 60, 70, 60, 65, 60, 70, 64, 67, 65],
    beats: [1.5, 0.5, 1.0, 1.0, 1.5, 0.5, 1.0, 1.0, 1.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1.5, 0.5, 1.0, 1.0, 1.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1.5, 0.5, 1.0, 1.0, 1.5, 0.5, 1.0, 1.0, 2.0, 2.0],
    phraseEnds: [33],
  },
  septemberSong: {
    title: "September Song",
    composer: "C. J. Brown",
    source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1792",
    // Opening flute section through the held G and breath; accompaniment omitted.
    notes: [64, 67, 72, 65, 64, 67, 72, 76, 77, 76, 74, 76, 79, 84, 77, 76, 79, 84, 88, 89, 86, 88, 89, 91, 84, 88, 89, 86, 88, 89, 91, 84, 81, 84, 79],
    beats: [1.0, 2.0, 1.0, 4.0, 1.0, 2.0, 1.0, 1.5, 0.25, 0.25, 2.0, 1.0, 2.0, 1.0, 4.0, 1.0, 2.0, 1.0, 1.5, 0.5, 1.5, 0.25, 0.25, 2.0, 1.0, 1.5, 0.5, 1.5, 0.25, 0.25, 2.0, 1.0, 1.5, 0.5, 6.0],
    phraseEnds: [3, 10, 14, 34],
  },
} as const;

export type MelodyName = keyof typeof MELODIES;
export type ConnectionMelody = MelodyName | "classic";
export type MelodySelection = ConnectionMelody | "library";

// Deterministic selection keeps a puzzle's tune unchanged across reloads.
export const MELODY_ROTATION: readonly MelodyName[] = [
  "odeToJoy", "furElise", "gymnopedie", "entertainer", "nachtmusik",
  "canon", "melodie", "summerGarden", "tangoTrifle", "septemberSong",
];

export function resolveMelody(selection: MelodySelection, seed = 0): ConnectionMelody {
  if (selection !== "library") return selection;
  return MELODY_ROTATION[(Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0) % MELODY_ROTATION.length];
}

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
