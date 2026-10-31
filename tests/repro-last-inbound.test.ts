import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/simulation.ts";
import { planTransport } from "../src/transport.ts";
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

test("diagnostic: compare drop sides before the crate that traps the worker", () => {
  const g = new Game(); g.accept(); g.advance(1.1);
  g.crates.find(c=>c.id==="1-0-0")!.loc={kind:"floor",x:4,y:0};
  g.crates.find(c=>c.id==="1-1-0")!.loc={kind:"floor",x:5,y:0};
  // The third crate (1-1-1) is already carried; the last is inbound at x=-2,y=2.
  const moving = g.crates.find(c=>c.id==="1-1-1")!;
  moving.loc={kind:"worker"}; g.carried=moving.id;
  g.pose={x:8,y:2,d:0,mode:"pull"};
  const source={x:7,y:2}, dest={x:7,y:0};
  for(const d of [0,2,4,6]){
    const plan=planTransport(g.pose,source,dest,g.planningFree(),g.planningFree(moving.id),undefined,d,true);
    if(!plan){console.log("CANDIDATE",JSON.stringify({d,plan:null}));continue;}
    const end=plan.steps.at(-1)!.b;
    moving.loc={kind:"floor",x:7,y:0}; g.carried=null;
    const route=findPath(end,p=>g.contact({kind:"inbound",lane:0,depth:1},p),g.planningFree());
    console.log("CANDIDATE",JSON.stringify({d,cost:plan.cost,end,route:route?.length??null,lower:plan.steps.find(s=>s.phase==="LOWER")?.a}));
    moving.loc={kind:"worker"}; g.carried=moving.id;
  }
});