// Shared state between the UI and the 3D robot. Plain module state: the robot
// reads it every frame. Ported from aadhil-portfolio's lib/robot-state.ts.

// Eye modes. Numbers must match eye-material.ts.
export const MODE_EYES = 0;
export const MODE_HAPPY = 7;
export const MODE_SLEEP = 8;
export const MODE_SURPRISED = 9;
export const MODE_ANGRY = 10;
export const MODE_WINK = 11;
export const MODE_LOVE = 12;
export const MODE_TEXT = 13; // shows robot.message on the screen
export const MODE_FLY = 14; // focused slits while being dragged
export const MODE_THINK = 15; // Claude is working
export const MODE_NOPE = 16; // something failed: X X and a head shake
export const MODE_TALK = 17; // Claude is answering (the waveform)

// All times are wall-clock seconds (performance.now() / 1000).
export const robot = {
  mode: MODE_EYES,
  // What Xepher is doing right now; wins over plain eyes, loses to flashes and sleep.
  activity: null as number | null,
  flying: false, // being dragged around the screen
  flyDir: 1,
  flashMode: MODE_EYES,
  flashUntil: 0,
  message: "",
  pointer: { x: 0, y: 0 },
  lastActivity: 0,
  pokedAt: -10,
};

export const now = () => performance.now() / 1000;

export function flash(mode: number, seconds: number) {
  robot.flashMode = mode;
  robot.flashUntil = now() + seconds;
  robot.lastActivity = now();
}

export function say(text: string, seconds = Math.max(2.2, text.length * 0.3 + 1)) {
  robot.message = text.toUpperCase();
  flash(MODE_TEXT, seconds);
}

export function poke() {
  robot.pokedAt = robot.lastActivity = now();
}
