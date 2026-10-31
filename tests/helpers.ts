import assert from "node:assert/strict";
import { Game } from "../src/simulation.ts";
export function finish(g: Game) {
  let i = 0;
  while (g.task && g.status === "playing" && i++ < 20000) {
    g.advance(0.05);
    g.assertInvariant();
  }
  assert.equal(g.task, null, `Unfinished: ${g.message}`);
  assert.notEqual(g.status, "lost", "Bankruptcy");
  g.assertInvariant();
}
export function move(g: Game, id: string, dest: any) {
  g.selectWorker();
  assert.ok(g.choose(id), g.message);
  assert.ok(g.order(dest), g.message);
  finish(g);
}
export const storage = [
  { x: 3, y: 5 },
  { x: 2, y: 5 },
  { x: 3, y: 4 },
  { x: 2, y: 4 },
];
export function roundOne(g: Game) {
  g.accept();
  g.advance(1.1);
  for (const [i, id] of ["1-0-0", "1-0-1", "1-1-0", "1-1-1"].entries())
    move(g, id, { kind: "floor", ...storage[i] });
  g.advance(1.1);
  assert.equal(g.status, "summary");
}
