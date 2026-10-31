import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/simulation.ts";
import { findPath, neighbors, transition, geometry, geometryFree, sweptCells } from "../src/pathfinding.ts";

test("repro: last crate in inbound truck remains reachable after three top-row deposits", () => {
  const g = new Game();
  g.accept();
  g.advance(1.1);
  const placed = [
    ["1-0-0", 4, 0],
    ["1-1-0", 5, 0],
    ["1-1-1", 7, 0],
  ] as const;
  for (const [id, x, y] of placed) {
    const crate = g.crates.find((c) => c.id === id)!;
    crate.loc = { kind: "floor", x, y };
    crate.paid = true;
  }
  // Screenshot: worker at (7,2), forks at (7,1), facing south.
  g.pose = { x: 7, y: 2, d: 2, mode: "pull" };
  const crate = g.crates.find((c) => c.id === "1-0-1")!;
  console.log("REPRO INITIAL", JSON.stringify({
    pose:g.pose, crate:crate.loc, accessible:g.accessible(crate.loc), 
    geometry:g.transportGeometry, freeAtWorker:g.free()(g.pose),
    freeAtForks:g.free()({x:7,y:1})
  }));
  g.assertInvariant();
  const goal = (p: any) => g.contact(crate.loc,p);
  const free = g.planningFree();
  for (const b of neighbors({ ...g.pose, mode:"pull" })) {
    const bad=sweptCells(g.pose,b,false).filter(p=>!free(p));
    console.log("NEIGHBOR", JSON.stringify({b,legal:transition(g.pose,b,free,false),bad:bad.slice(0,12)}));
  }
  for (const remove of [[],["7,0"],["4,0","5,0"],["4,0","5,0","7,0"]]) {
    const ignored = (p:any) => free(p)||remove.includes(p.x+","+p.y);
    console.log("REMOVED",JSON.stringify({remove,route:findPath(g.pose,goal,ignored)?.length??null}));
  }
    const route = findPath(g.pose, goal, g.planningFree());
  console.log("REPRO ROUTE", JSON.stringify({count:route?.length ?? null,first:route?.slice(0,3),last:route?.at(-1)}));
  g.selectWorker();
  const chosen=g.choose(crate.id);
  console.log("REPRO CHOOSE",JSON.stringify({chosen,message:g.message}));
  assert.ok(chosen, g.message);
});
