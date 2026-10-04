"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  createRunner,
  GROUND_Y,
  HEIGHT,
  jump,
  PLAYER_H,
  PLAYER_W,
  PLAYER_X,
  step,
  WIDTH,
  type Obstacle,
  type RunnerState,
  type RunnerStatus
} from "./runner-engine";

const BEST_KEY = "thehrav.runnerBest";

function readBest(): number {
  try {
    const stored = Number(window.localStorage.getItem(BEST_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  } catch {
    return 0;
  }
}

function saveBest(best: number) {
  try {
    window.localStorage.setItem(BEST_KEY, String(best));
  } catch {
    // Private mode or blocked storage: the best score just isn't remembered.
  }
}

interface Palette {
  ink: string;
  accent: string;
  faint: string;
}

function readPalette(): Palette {
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#175c45";
  return { ink: "#3d4a43", accent, faint: "#c9d3cc" };
}

const pad = (value: number) => String(value).padStart(5, "0");

function drawPlayer(context: CanvasRenderingContext2D, state: RunnerState, palette: Palette) {
  const top = GROUND_Y - state.playerLift - PLAYER_H;
  context.fillStyle = palette.accent;
  // Body and head
  context.fillRect(PLAYER_X, top + 8, PLAYER_W - 6, PLAYER_H - 14);
  context.fillRect(PLAYER_X + 8, top, PLAYER_W - 8, 11);
  // Eye
  context.fillStyle = "#ffffff";
  context.fillRect(PLAYER_X + PLAYER_W - 6, top + 3, 3, 3);
  // Tail
  context.fillStyle = palette.accent;
  context.fillRect(PLAYER_X - 5, top + 10, 6, 5);
  // Legs: alternate while running, together in the air
  const stride = state.playerLift > 0 || state.status !== "running" ? 0 : Math.floor(state.distance / 18) % 2;
  context.fillRect(PLAYER_X + 3, top + PLAYER_H - 6, 4, stride ? 4 : 6);
  context.fillRect(PLAYER_X + 10, top + PLAYER_H - 6, 4, stride ? 6 : 4);
}

function drawObstacle(context: CanvasRenderingContext2D, obstacle: Obstacle, distance: number, palette: Palette) {
  const top = GROUND_Y - obstacle.lift - obstacle.height;
  context.fillStyle = palette.ink;
  if (obstacle.kind === "bird") {
    const wingsUp = Math.floor(distance / 30) % 2 === 0;
    context.fillRect(obstacle.x, top + 7, obstacle.width, 5);
    context.fillRect(obstacle.x - 4, top + 6, 6, 4);
    context.fillRect(obstacle.x + 9, wingsUp ? top : top + 11, 12, 7);
    return;
  }
  // One or two cacti side by side, each a stem with two arms
  const stems = obstacle.width > 20 ? 2 : 1;
  for (let index = 0; index < stems; index += 1) {
    const x = obstacle.x + index * 18;
    context.fillRect(x + 4, top, 6, obstacle.height);
    context.fillRect(x, top + 8, 4, 10);
    context.fillRect(x + 10, top + 5, 4, 10);
  }
}

function draw(context: CanvasRenderingContext2D, state: RunnerState, palette: Palette, labels: { start: string; over: string }) {
  context.clearRect(0, 0, WIDTH, HEIGHT);

  // Slow clouds and ground specks give a sense of motion.
  context.fillStyle = palette.faint;
  for (let index = 0; index < 3; index += 1) {
    const x = WIDTH - ((state.distance * 0.2 + index * 230) % (WIDTH + 60));
    context.fillRect(x, 24 + index * 14, 34, 6);
    context.fillRect(x + 8, 20 + index * 14, 18, 4);
  }
  context.fillStyle = palette.ink;
  context.fillRect(0, GROUND_Y, WIDTH, 1.5);
  for (let index = 0; index < 14; index += 1) {
    const x = WIDTH - ((state.distance + index * 47) % WIDTH);
    context.fillRect(x, GROUND_Y + 5 + (index % 3) * 4, index % 2 ? 3 : 6, 1.5);
  }

  for (const obstacle of state.obstacles) drawObstacle(context, obstacle, state.distance, palette);
  drawPlayer(context, state, palette);

  context.fillStyle = palette.ink;
  context.font = "bold 13px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textAlign = "right";
  context.fillText(`HI ${pad(state.best)}  ${pad(state.score)}`, WIDTH - 10, 20);

  if (state.status !== "running") {
    context.textAlign = "center";
    context.font = "bold 15px system-ui, sans-serif";
    context.fillText(state.status === "over" ? labels.over : labels.start, WIDTH / 2, HEIGHT / 2 - 8);
  }
}

/** The runner on a canvas. Space, ↑, a tap or a click jumps (and starts or restarts a run). */
export function RunnerGame() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<RunnerState | null>(null);
  const [status, setStatus] = useState<RunnerStatus>("ready");
  const [lastScore, setLastScore] = useState(0);

  const press = useCallback(() => {
    if (!stateRef.current) return;
    stateRef.current = jump(stateRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    stateRef.current = createRunner(readBest());
    const palette = readPalette();
    const labels = { start: t("game.start"), over: t("game.over") };

    // Sharp drawing on high-density screens; CSS keeps the canvas fluid in width.
    const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    canvas.width = WIDTH * ratio;
    canvas.height = HEIGHT * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    let frame = 0;
    let previous = performance.now();
    let shownStatus: RunnerStatus = "ready";
    const tick = (time: number) => {
      const current = stateRef.current!;
      const next = step(current, (time - previous) / 1000);
      previous = time;
      if (next.status === "over" && current.status === "running") saveBest(next.best);
      stateRef.current = next;
      if (next.status !== shownStatus) {
        shownStatus = next.status;
        setStatus(next.status);
        setLastScore(next.score);
      }
      draw(context, next, palette, labels);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
        event.preventDefault();
        if (!event.repeat) press();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
    };
  }, [press, t]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="block w-full h-auto rounded-xl bg-[#f7f9f7] border border-gray-200 touch-none select-none cursor-pointer"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
        role="img"
        aria-label={t("game.canvasLabel")}
        onPointerDown={(event) => {
          event.preventDefault();
          press();
        }}
      />
      <p className="sr-only" aria-live="polite">
        {status === "over" ? t("game.overAnnounce", { score: lastScore }) : ""}
      </p>
      <p className="mt-3 text-sm text-gray-600">{t("game.controls")}</p>
    </div>
  );
}
