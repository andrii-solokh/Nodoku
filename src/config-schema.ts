export interface GameConfig {
  version: 1;
  demo: {
    timingMode: "melody" | "fixed";
    tempoBpm: number;
    initialDelayMs: number;
    stepDelayMs: number;
    revealDelayMs: number;
    completeHoldMs: number;
    restartDelayMs: number;
    interactionPauseMs: number;
    resumeDelayMs: number;
  };
  scene: {
    materialStyle: "classic" | "gum";
    gooStretch: number;
    gooGloss: number;
    shapeTransitionMs: number;
    rotationMs: number;
    connectionMs: number;
    connectionEasing: "linear" | "easeOut" | "easeInOut";
    dragMaxLength: number;
    dragThickness: number;
    dragMinThickness: number;
    dragTipSize: number;
    dragFollowMs: number;
    dragMagnetRange: number;
    dragMagnetStrength: number;
    dragMagnetResponseMs: number;
    dragReturnMs: number;
    dragElasticity: number;
    dotAnimation: "glide" | "spring" | "orbit" | "fade";
    dotAnimationMs: number;
    nodeFloatAmplitude: number;
    nodeFloatPeriodMs: number;
    rodRadius: number;
    nodeScale: number;
    fogStrength: number;
    shadowOpacity: number;
    background: string;
    nodeColor: string;
    connectionColor: string;
    completedColor: string;
  };
  sound: {
    connectionMelody: "odeToJoy" | "furElise" | "classic";
    noteDurationMs: number;
    melodyVolume: number;
    completionSound: boolean;
    completionNoteIntervalMs: number;
    showAmbientMusic: boolean;
    ambientVolume: number;
  };
  sponsors: { slots: number; showOnHome: boolean; showInGame: boolean };
}

type Rule = { label: string; description?: string } & (
  | { kind: "number"; min: number; max: number; step: number; unit?: string; integer?: boolean }
  | { kind: "color" | "boolean" }
  | { kind: "choice"; options: Record<string, string> }
);
const milliseconds = (label: string, min: number, max: number): Rule => ({ label, kind: "number", min, max, step: 10, unit: "ms", integer: true });
const dragDefaults = {
  dragMaxLength: 1.15, dragThickness: 1.15, dragMinThickness: .3, dragTipSize: .05,
  dragFollowMs: 90, dragMagnetRange: .45, dragMagnetStrength: .7,
  dragMagnetResponseMs: 120, dragReturnMs: 520, dragElasticity: .55,
};
export const CONFIG_RULES: Record<"demo" | "scene" | "sound" | "sponsors", Record<string, Rule>> = {
  demo: {
    timingMode: {
      label: "Connection timing", kind: "choice", options: { melody: "Melody rhythm", fixed: "Fixed delay" },
      description: "Melody rhythm follows scored note lengths, starting each connection and sound together. Turns and link animations can overlap. Fixed delay waits for animations, then pauses.",
    },
    tempoBpm: {
      label: "Melody tempo", kind: "number", min: 40, max: 180, step: 1, unit: "BPM", integer: true,
      description: "Quarter-note beats per minute for the home melody, its completion, and double-tap fills. Higher values play faster. Individual moves still set their own rhythm.",
    },
    initialDelayMs: milliseconds("Wait before starting", 0, 5000),
    stepDelayMs: { ...milliseconds("Pause between connections", 50, 5000), description: "Pause after animations in Fixed delay mode. Melody rhythm uses the score and tempo instead." },
    revealDelayMs: milliseconds("Pause after turning", 0, 2000),
    completeHoldMs: milliseconds("Hold the solved puzzle", 500, 15000),
    restartDelayMs: milliseconds("Wait before replay", 0, 5000),
    interactionPauseMs: milliseconds("Pause after dragging", 500, 10000),
    resumeDelayMs: milliseconds("Wait after resuming", 0, 3000),
  },
  scene: {
    materialStyle: {
      label: "Material style", kind: "choice", options: { classic: "Classic", gum: "Gum" },
      description: "Choose soft, glossy gum for nodes and connections, or keep their classic appearance.",
    },
    gooStretch: {
      label: "Gum stretch", kind: "number", min: 0, max: 1, step: .05,
      description: "How much gum stretches as connections form. Set to 0 for no stretch. Connection draw duration controls the timing.",
    },
    gooGloss: {
      label: "Gum gloss", kind: "number", min: 0, max: 1, step: .05,
      description: "How shiny gum nodes and connections appear. Lower values are softer; higher values add stronger highlights.",
    },
    dotAnimation: {
      label: "Dot animation", kind: "choice",
      options: { glide: "Glide · smooth rearranging", spring: "Spring · soft bounce", orbit: "Orbit · curved movement", fade: "Fade · subtle transition" },
      description: "Dots leave, arrive and rearrange as connections change. Preview this on the home puzzle or while playing.",
    },
    dotAnimationMs: { ...milliseconds("Dot animation duration", 0, 2000), description: "Longer is slower. Set to 0 for instant changes." },
    rotationMs: milliseconds("Camera turn duration", 0, 2000),
    shapeTransitionMs: { ...milliseconds("Preview transition duration", 0, 2000), description: "How long the home puzzle takes to change grid size or switch between 3D and Flat. Set to 0 for an instant switch." },
    connectionMs: milliseconds("Connection draw duration", 0, 2000),
    connectionEasing: { label: "Connection easing", kind: "choice", options: { linear: "Steady", easeOut: "Gentle finish", easeInOut: "Gentle start and finish" } },
    dragMaxLength: {
      label: "Maximum reach", kind: "number", min: 1, max: 3, step: .05, unit: "grid steps",
      description: "How far a strand can stretch from its starting node. One grid step is the distance between neighboring node centers.",
    },
    dragThickness: {
      label: "Starting thickness", kind: "number", min: .5, max: 3, step: .05, unit: "×",
      description: "Strand thickness before stretching, relative to Connection thickness in Connections and scene.",
    },
    dragMinThickness: {
      label: "Thickness at full reach", kind: "number", min: .1, max: 1, step: .05, unit: "×",
      description: "How much starting thickness remains at maximum reach. 0.3 keeps 30%; 1 keeps the strand equally thick as it stretches.",
    },
    dragTipSize: {
      label: "Tip size", kind: "number", min: .015, max: .15, step: .005, unit: "grid steps",
      description: "Radius of the small droplet at the strand's tip. It also follows the Node size setting.",
    },
    dragFollowMs: {
      ...milliseconds("Pointer follow lag", 0, 400),
      description: "How softly the strand follows your pointer. Higher values feel thicker and slower; 0 follows instantly.",
    },
    dragMagnetRange: {
      label: "Magnet distance", kind: "number", min: 0, max: 1, step: .05, unit: "grid steps",
      description: "How close the tip must come to a valid neighbor's surface before that node reaches toward it. Set to 0 to turn this effect off.",
    },
    dragMagnetStrength: {
      label: "Magnet pull", kind: "number", min: 0, max: 1.5, step: .05, unit: "× node radius",
      description: "How far the neighboring node can stretch toward the strand. Set to 0 to keep its surface still.",
    },
    dragMagnetResponseMs: {
      ...milliseconds("Magnet response", 0, 500),
      description: "How softly the node's reaching tip grows and recedes. Higher values feel more fluid; 0 responds instantly.",
    },
    dragReturnMs: {
      ...milliseconds("Return duration", 0, 1500),
      description: "How long an unfinished strand takes to spring back after release. Set to 0 for an instant return.",
    },
    dragElasticity: {
      label: "Return bounce", kind: "number", min: 0, max: 1, step: .05,
      description: "How springy the strand feels as it returns. Higher values add more bounce; 0 settles without overshooting.",
    },
    rodRadius: { label: "Connection thickness", kind: "number", min: .015, max: .12, step: .001 },
    nodeScale: { label: "Node size", kind: "number", min: .65, max: 1.35, step: .01, unit: "×" },
    nodeFloatAmplitude: { label: "Node float amount", kind: "number", min: 0, max: .08, step: .005, description: "Gentle drifting around each node's position. Set to 0 to keep nodes still." },
    nodeFloatPeriodMs: { ...milliseconds("Node float cycle", 2000, 15000), description: "Longer cycles make the floating slower." },
    fogStrength: { label: "Depth haze", kind: "number", min: 0, max: 2, step: .05 },
    shadowOpacity: { label: "Shadow strength", kind: "number", min: 0, max: .4, step: .01 },
    background: { label: "Background", kind: "color" },
    nodeColor: { label: "Nodes", kind: "color" },
    connectionColor: { label: "Selection accent", kind: "color", description: "Color of selection rings and available connections. Placed links blend their nodes' unfinished and completed colors." },
    completedColor: { label: "Completed nodes", kind: "color" },
  },
  sound: {
    connectionMelody: {
      label: "Connection melody", kind: "choice",
      options: { odeToJoy: "Ode to Joy", furElise: "Für Elise", classic: "Original connection sound" },
      description: "Each successful connection plays the next note. Your moves set the rhythm; sound must be enabled to hear it.",
    },
    noteDurationMs: { ...milliseconds("Note duration", 100, 1000), description: "Length of each synthesized melody note." },
    melodyVolume: { label: "Melody volume", kind: "number", min: 0, max: 1, step: .05, description: "Relative melody volume. Set to 0 to silence melody notes." },
    completionSound: {
      label: "Play completion ending", kind: "boolean",
      description: "Continue to the next musical phrase ending. If the last move already finishes a phrase, no extra notes play.",
    },
    completionNoteIntervalMs: {
      ...milliseconds("Completion note interval", 80, 1000),
      description: "Time between completion melody notes while playing or using Fixed delay. Home Melody rhythm uses its tempo instead. Original connection sound keeps its usual chime timing.",
    },
    showAmbientMusic: { label: "Show ambient music", kind: "boolean", description: "Show the music button and let players listen to Moonlight. Hidden by default; turning this off also stops ambient playback." },
    ambientVolume: { label: "Ambient music volume", kind: "number", min: 0, max: 1, step: .01, description: "Volume of Moonlight, controlled separately from sound effects. Set to 0 to silence background music." },
  },
  sponsors: {
    slots: { label: "Sponsor slots", kind: "number", min: 1, max: 6, step: 1, integer: true },
    showOnHome: { label: "Show sponsors on home", kind: "boolean" },
    showInGame: { label: "Show sponsors during play", kind: "boolean" },
  },
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a configuration object.");
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error("Configuration fields do not match this version.");
}

function migrateSound(value: unknown, present: boolean): Record<string, unknown> {
  const values = present ? object(value) : { connectionMelody: "odeToJoy", noteDurationMs: 320, melodyVolume: .7 };
  const hasLegacyCount = Object.hasOwn(values, "completionNotes");
  const { completionNotes, ...current } = values;
  // Validate the retired field even when an explicit new toggle takes precedence.
  if (hasLegacyCount && !(typeof completionNotes === "number" && Number.isInteger(completionNotes) && completionNotes >= 0 && completionNotes <= 32)) {
    throw new Error("Invalid value for completion notes.");
  }
  return {
    completionSound: hasLegacyCount ? (completionNotes as number) > 0 : true,
    completionNoteIntervalMs: 240, showAmbientMusic: false, ambientVolume: .18, ...current,
  };
}

/** Shared browser/server validation; returns a fresh, canonical configuration. */
export function validateConfig(value: unknown): GameConfig {
  const source = object(value);
  const hasSound = Object.hasOwn(source, "sound");
  exactKeys(source, ["version", "demo", "scene", "sponsors", ...(hasSound ? ["sound"] : [])]);
  if (source.version !== 1) throw new Error("Unsupported configuration version.");
  const result: Record<string, unknown> = { version: 1 };
  for (const [group, rules] of Object.entries(CONFIG_RULES)) {
    // Only missing legacy fields/sections receive defaults. Supplied values
    // and every pre-existing sound field remain strictly validated.
    const values = group === "demo"
      ? { timingMode: "melody", tempoBpm: 96, ...object(source[group]) }
      : group === "scene"
      ? { materialStyle: "gum", gooStretch: .65, gooGloss: .7, dotAnimation: "glide", dotAnimationMs: 460, shapeTransitionMs: 700, nodeFloatAmplitude: .025, nodeFloatPeriodMs: 6000, ...dragDefaults, ...object(source[group]) }
      : group === "sound"
      ? migrateSound(source[group], hasSound)
      : object(source[group]);
    exactKeys(values, Object.keys(rules));
    const target: Record<string, unknown> = {};
    for (const [key, rule] of Object.entries(rules)) {
      const entry = values[key];
      const valid = rule.kind === "number"
        ? typeof entry === "number" && Number.isFinite(entry) && entry >= rule.min && entry <= rule.max && (!rule.integer || Number.isInteger(entry))
        : rule.kind === "boolean" ? typeof entry === "boolean"
        : rule.kind === "color" ? typeof entry === "string" && /^#[a-f\d]{6}$/i.test(entry)
        : rule.kind === "choice" && typeof entry === "string" && Object.hasOwn(rule.options, entry);
      if (!valid) throw new Error(`Invalid value for ${rule.label.toLowerCase()}.`);
      target[key] = entry;
    }
    result[group] = target;
  }
  return result as unknown as GameConfig;
}
