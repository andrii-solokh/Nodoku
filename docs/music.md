# Music and sound

## Rotation

Rotations are silent in gameplay and the home demo. The previously supplied pop is no longer imported, downloaded or included in the production bundle. Its trimmed source remains at `src/assets/rotation-pop.wav` for reference; the original download is unchanged.

## Ambient recording: Moonlight

Ambient music is hidden by default. Enable **Studio → Sound → Show ambient music** (`sound.showAmbientMusic`) to display the header's music button. Disabling it hides the control and stops playback while preserving each player's preference. Save to project stores the option in `config/game-config.json` for subsequent builds.

When available, the music button opens **Ambient music**, with Play music / Pause music controls for **Moonlight** by Scott Buckley and its credits. Music starts off, remembers its own preference, and starts playback only after a user gesture. It pauses while the page is hidden. The speaker button still controls sound effects separately.

> 'Moonlight' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au

[Track and attribution](https://www.scottbuckley.com.au/library/moonlight/) · [Scott Buckley](https://www.scottbuckley.com.au/) · [CC BY 4.0 license](https://creativecommons.org/licenses/by/4.0/)

The original [MP3 full mix](https://www.scottbuckley.com.au/library/wp-content/uploads/2022/07/Moonlight.mp3) is bundled as `src/assets/moonlight-scott-buckley.mp3`. Its audio is unchanged; the application loops playback and adjusts gain at runtime. Keep the credit and license links with redistributed copies. Local Studio → Sound → **Ambient music volume** controls `sound.ambientVolume` from 0–1, default 0.18.

## Connection melodies

Each newly added edge advances the melody by one note. Tapping a node without connecting and removing an edge do not consume melody notes. Double-tapping to fill a node connects immediately and plays its new connection notes at the score's intervals, including rests, using Studio → Home auto-solve → Melody tempo. The first note starts immediately. Another successful edit replaces the remaining fill audio so feedback stays responsive; selecting a node or turning the board leaves it playing. If the fill solves the puzzle, the completion ending waits through the final fill note's scored interval. Undo or redo that restores connections also advances the sequence for the restored edges. Individual moves keep their player-controlled rhythm.

The game saves its melody position alongside the puzzle. Continue and refresh preserve it; Restart, a new puzzle, or choosing a different melody starts the game sequence again. The home demo uses its own connection index and repeats from the beginning when the demo puzzle restarts. Muted or hidden interactions never create delayed playback when sound returns.

Local Studio → Sound controls `sound.connectionMelody`, `sound.noteDurationMs`, and `sound.melodyVolume`. **Play completion ending** (`sound.completionSound`, default true) continues the selected melody through the next musical stopping point described below. It adds no notes if the last connection already reached an ending. Player completion and Fixed delay demos use `sound.completionNoteIntervalMs` (default 240 ms); Melody rhythm demos use the score intervals at the selected tempo. Turn off Play completion ending to disable the finish sound. Classic uses its original completion chime when enabled. Completion notes do not change the saved player melody position. The home demo holds its finished board for the sequence, and its new links play their notes as the camera starts turning. Save to project writes `config/game-config.json`, which can be committed and included in the next build. Legacy completion counts migrate to this toggle, preserving 0 as off. The speaker button controls these synthesized effects; the separate music button controls the licensed Moonlight recording.

## Score rhythm

The melody timing data records the interval from each note's onset to the next in quarter-note beats, including intervening rests. `melodyStepMs(melody, index, tempoBpm)` converts those intervals to milliseconds; its default is 96 quarter notes per minute. Tempo is adjustable, while the score's relative note lengths remain intact. This is a chosen playback tempo, not a claim to reproduce the tempo or expression of a particular recording. A synthesized note's envelope is separate from the interval before the next note.

- **Ode to Joy:** the [LilyPond soprano part](https://www.mutopiaproject.org/ftp/BeethovenLv/ode/ode.ly) supplies 62 note onsets over sixteen 4/4 bars (64 quarter-note beats), transposed to C major. Dotted-quarter/eighth cadences use 1.5 and 0.5 beats; the bridge retains its eighth-note pairs. The final half note lasts two beats before the phrase loops.
- **Für Elise:** the [LilyPond upper staff](https://www.mutopiaproject.org/ftp/BeethovenLv/WoO59/fur_Elise_WoO59/fur_Elise_WoO59.ly) supplies the 35-note opening through its first volta ending, totaling 12 quarter-note beats including the pickup. Most onsets are a sixteenth note (0.25 beats) apart. Each eighth note followed by a sixteenth rest occupies 0.75 beats before the next onset. The final A lasts one beat before the opening pickup repeats.

The score files mark quarter-note tempos of 100 and 72 respectively; Nodoku does not force those markings. Pitch sequences are unchanged. These timing patterns apply to the automatic rendition; a player still chooses when to make each connection.

## Musical stopping points

Completion continues from the next unplayed note to the next chosen musical ending, inclusive. If the player's last connection already reached an ending, no further notes are added. Looping uses the same boundaries; completing the final note of a loop does not launch another verse. These stopping points are intentional choices for Nodoku's short renditions, not a claim that musical phrase boundaries have only one interpretation.

- **Ode to Joy:** zero-based note indices **29 and 61**, the tonic C endings of the two eight-bar halves in the transposed [soprano score](https://www.mutopiaproject.org/ftp/BeethovenLv/ode/ode.ly). The intervening D half cadence and G dominant arrival are left open so the finish can reach a more settled tonic ending.
- **Für Elise:** indices **8, 26 and 34**, all A. The first two are recognizable tonic arrivals followed by rests; the last is the first volta's final cadence in the [upper-staff score](https://www.mutopiaproject.org/ftp/BeethovenLv/WoO59/fur_Elise_WoO59/fur_Elise_WoO59.ly). The shorter A arrivals are practical excerpt endings; the intervening C arrival is not used as a stopping point.

The pitch and rhythm arrays remain unchanged. `melodyCompletionCount(melody, nextIndex)` returns only the remaining notes through one chosen ending, rather than a fixed count or the remainder of the whole tune. Completion playback does not advance the saved connection-note position.

## Composition sources

Checked September 11, 2026. The included note sequences use the original public-domain compositions, rendered with Nodoku's own Web Audio synthesis:

- **Ode to Joy**, Ludwig van Beethoven (1770–1827). [Mutopia's public-domain score](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=528).
- **Für Elise, WoO 59**, Ludwig van Beethoven. [Mutopia's public-domain transcription](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=931), based on Breitkopf & Härtel's 1888 score. The opening right-hand theme is used through its first A-minor cadence.

These sources document the underlying compositions used for the synthesized connection themes; those themes do not reuse recorded performances. Moonlight is a separate licensed recording, credited above. A composition and a particular recording have separate rights. [U.S. Copyright Office explanation](https://www.copyright.gov/engage/musicians/).
