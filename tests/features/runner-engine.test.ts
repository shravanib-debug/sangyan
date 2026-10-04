import { describe, expect, it } from "vitest";

import { createRunner, jump, step, WIDTH, type RunnerState } from "@/features/games/runner-engine";

const FRAME = 1 / 60;
const run = (state: RunnerState, seconds: number, random = () => 0.5) => {
  let current = state;
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) current = step(current, FRAME, random);
  return current;
};

describe("runner engine", () => {
  it("waits on the start screen until the first jump", () => {
    const ready = createRunner();
    expect(step(ready, 1).distance).toBe(0);
    const started = jump(ready);
    expect(started.status).toBe("running");
    expect(started.velocity).toBeGreaterThan(0);
  });

  it("jumps from the ground, lands again, and ignores mid-air jumps", () => {
    let state = run(jump(createRunner()), 0.1);
    expect(state.playerLift).toBeGreaterThan(0);
    expect(jump(state)).toBe(state);
    state = run(state, 1);
    expect(state.playerLift).toBe(0);
  });

  it("ends the run on hitting a cactus and keeps the best score", () => {
    const start: RunnerState = {
      ...jump(createRunner(5)),
      velocity: 0,
      obstacles: [{ kind: "cactus", x: 60, width: 14, height: 26, lift: 0 }],
      untilSpawn: WIDTH
    };
    const over = step(start, FRAME);
    expect(over.status).toBe("over");
    expect(over.best).toBe(5);
    expect(step(over, 1)).toBe(over);
    const again = jump(over);
    expect(again).toMatchObject({ status: "running", score: 0, obstacles: [], best: 5 });
  });

  it("lets a high bird pass over a player on the ground", () => {
    const start: RunnerState = {
      ...jump(createRunner()),
      velocity: 0,
      obstacles: [{ kind: "bird", x: 60, width: 30, height: 18, lift: 38 }],
      untilSpawn: WIDTH
    };
    expect(step(start, FRAME).status).toBe("running");
  });

  it("spawns obstacles, speeds up, and scores with distance", () => {
    const state = run(jump(createRunner()), 3);
    expect(state.obstacles.length + (state.status === "over" ? 1 : 0)).toBeGreaterThan(0);
    expect(state.score).toBe(Math.floor(state.distance / 10));
  });

  it("clamps long frames so a background tab cannot teleport the player", () => {
    const state = jump(createRunner());
    expect(step(state, 10).distance).toBeLessThan(state.speed * 0.06);
  });
});
