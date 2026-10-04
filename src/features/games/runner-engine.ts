/**
 * A small endless-runner, in the spirit of the offline dinosaur game. Pure logic with no
 * DOM access, so the rules can be tested and the canvas component only has to draw.
 * Units are logical pixels on a WIDTH x HEIGHT field; time is in seconds.
 */

export const WIDTH = 600;
export const HEIGHT = 160;
export const GROUND_Y = 136;

export const PLAYER_X = 48;
export const PLAYER_W = 22;
export const PLAYER_H = 28;

const GRAVITY = 2600;
const JUMP_VELOCITY = 680;
const START_SPEED = 320;
const MAX_SPEED = 760;
const ACCELERATION = 7;
/** Birds start appearing once the run is past this score. */
const BIRD_SCORE = 250;
/** Collision boxes are shrunk a little so near misses feel fair. */
const HITBOX_INSET = 4;

export type ObstacleKind = "cactus" | "bird";

export interface Obstacle {
  kind: ObstacleKind;
  x: number;
  width: number;
  height: number;
  /** Height of the obstacle's bottom edge above the ground. */
  lift: number;
}

export type RunnerStatus = "ready" | "running" | "over";

export interface RunnerState {
  status: RunnerStatus;
  /** Height of the player's feet above the ground. */
  playerLift: number;
  velocity: number;
  speed: number;
  distance: number;
  obstacles: Obstacle[];
  /** Distance left to travel before the next obstacle appears. */
  untilSpawn: number;
  score: number;
  best: number;
}

export function createRunner(best = 0): RunnerState {
  return {
    status: "ready",
    playerLift: 0,
    velocity: 0,
    speed: START_SPEED,
    distance: 0,
    obstacles: [],
    untilSpawn: WIDTH * 0.6,
    score: 0,
    best
  };
}

/** Jump from the ground; also starts a fresh run from the ready or game-over screen. */
export function jump(state: RunnerState): RunnerState {
  if (state.status !== "running") return { ...createRunner(state.best), status: "running", velocity: JUMP_VELOCITY };
  if (state.playerLift > 0) return state;
  return { ...state, velocity: JUMP_VELOCITY };
}

function makeObstacle(score: number, random: () => number): Obstacle {
  if (score >= BIRD_SCORE && random() < 0.3) {
    // A low bird has to be jumped; a high bird passes overhead and punishes a jump.
    const high = random() < 0.5;
    return { kind: "bird", x: WIDTH, width: 30, height: 18, lift: high ? PLAYER_H + 10 : 14 };
  }
  const tall = random() < 0.4;
  const group = random() < 0.25 ? 2 : 1;
  return { kind: "cactus", x: WIDTH, width: 14 * group + (group - 1) * 4, height: tall ? 36 : 26, lift: 0 };
}

function overlaps(state: RunnerState, obstacle: Obstacle): boolean {
  const playerTop = GROUND_Y - state.playerLift - PLAYER_H + HITBOX_INSET;
  const playerBottom = GROUND_Y - state.playerLift - HITBOX_INSET;
  const playerLeft = PLAYER_X + HITBOX_INSET;
  const playerRight = PLAYER_X + PLAYER_W - HITBOX_INSET;
  const top = GROUND_Y - obstacle.lift - obstacle.height + HITBOX_INSET;
  const bottom = GROUND_Y - obstacle.lift - HITBOX_INSET;
  const left = obstacle.x + HITBOX_INSET;
  const right = obstacle.x + obstacle.width - HITBOX_INSET;
  return playerLeft < right && playerRight > left && playerTop < bottom && playerBottom > top;
}

/** Advances the run by `dt` seconds. Large gaps (a background tab) are clamped. */
export function step(state: RunnerState, dt: number, random: () => number = Math.random): RunnerState {
  if (state.status !== "running") return state;
  const seconds = Math.min(Math.max(dt, 0), 0.05);

  let velocity = state.velocity - GRAVITY * seconds;
  let playerLift = state.playerLift + velocity * seconds;
  if (playerLift <= 0) {
    playerLift = 0;
    velocity = 0;
  }

  const speed = Math.min(MAX_SPEED, state.speed + ACCELERATION * seconds);
  const moved = speed * seconds;
  const distance = state.distance + moved;
  const score = Math.floor(distance / 10);

  const obstacles = state.obstacles
    .map((obstacle) => ({ ...obstacle, x: obstacle.x - moved }))
    .filter((obstacle) => obstacle.x + obstacle.width > 0);

  let untilSpawn = state.untilSpawn - moved;
  if (untilSpawn <= 0) {
    obstacles.push(makeObstacle(score, random));
    // Gaps widen with speed so every obstacle stays clearable with one jump.
    untilSpawn = speed * (0.75 + random() * 0.7);
  }

  const next: RunnerState = { ...state, velocity, playerLift, speed, distance, score, obstacles, untilSpawn };
  if (obstacles.some((obstacle) => overlaps(next, obstacle))) {
    return { ...next, status: "over", best: Math.max(state.best, score) };
  }
  return next;
}
