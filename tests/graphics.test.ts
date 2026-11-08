import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Camera,
  GRAPHICS,
  LAYERS,
  clientToCanvas,
  tileCenter,
} from "../src/graphics/config.ts";
import {
  createRegistry,
  DIRECTIONS,
  angleDirection,
} from "../src/graphics/assets.ts";
import {
  AssetStore,
  AssetPainter,
  RenderQueue,
  commandBounds,
  localToScreen,
} from "../src/graphics/engine.ts";
import type { AssetCommand } from "../src/graphics/engine.ts";
import {
  SceneBuilder,
  composeRack,
  composeVehicle,
  vehicleLengthSource,
} from "../src/graphics/scene.ts";
import {
  AnimationController,
  stepDistance,
} from "../src/graphics/animation.ts";
import { Game } from "../src/simulation.ts";
import type { Task } from "../src/simulation.ts";
import {
  geometry,
  neighbors,
  rig,
  HITCH_OFFSET,
  DRAWBAR_LENGTH,
} from "../src/pathfinding.ts";
import { travel } from "../src/transport.ts";
import type { Pose } from "../src/config.ts";
const close = (a: number, b: number, epsilon = 1e-7) =>
  assert.ok(Math.abs(a - b) < epsilon, `${a} ≠ ${b}`);
function synthetic(a: Pose, b: Pose, phase: Task["phase"] = "PULL") {
  const g = new Game(),
    s = travel(rig(a), rig(b), true, phase);
  g.pose = { ...a };
  g.task = {
    crate: "fixture",
    dest: { kind: "floor", x: 6, y: 2 },
    phase,
    steps: [s],
    route: [a, b],
    elapsed: 0,
    blocked: false,
    cost: s.duration,
    inserted: false,
    deposited: false,
  };
  return g;
}
function context() {
  const calls: { name: string; args: unknown[] }[] = [];
  const values: Record<string, unknown> = { calls };
  const proxy = new Proxy(values, {
    get: (t, k) =>
      k in t
        ? t[k as string]
        : (...args: unknown[]) => calls.push({ name: String(k), args }),
    set: (t, k, v) => {
      t[k as string] = v;
      return true;
    },
  });
  return proxy as unknown as CanvasRenderingContext2D & { calls: typeof calls };
}
const missing = () =>
  new AssetStore(async () => {
    throw Error("missing PNG");
  });
function ordered() {
  const g = new Game();
  g.accept();
  g.advance(1.1);
  g.selectWorker();
  assert.ok(g.choose("1-0-0"));
  assert.ok(g.order({ kind: "floor", x: 3, y: 5 }));
  return g;
}

test("graphics: 24 source pixels ×2 gives exact 48px tiles and a 960×288 starting floor", () => {
  const c = new Camera();
  const a = c.worldToScreen({ x: 0, y: 0 }),
    b = c.worldToScreen({ x: 20, y: 6 });
  assert.equal(GRAPHICS.sourceTile, 24);
  assert.equal(c.tile, 48);
  close(b.x - a.x, 960);
  close(b.y - a.y, 288);
  assert.deepEqual(c.sourceToScreen({ x: 24, y: 24 }), { x: 48, y: 48 });
});
test("graphics: camera inverse and CSS/client conversion agree after zoom, panning and negative coordinates", () => {
  const c = new Camera();
  c.frame({ minX: -12, minY: -14, maxX: 29, maxY: 8 });
  for (const zoom of [0.5, 1, 1.5, 2]) {
    c.setZoom(zoom);
    c.move(-37, 61);
    for (const p of [
      { x: 0, y: 0 },
      { x: 19.25, y: 5.75 },
      { x: -2.5, y: -4.5 },
    ]) {
      const s = c.worldToScreen(p),
        back = c.screenToWorld(s);
      close(back.x, p.x);
      close(back.y, p.y);
      assert.deepEqual(c.screenToGrid(s), {
        x: Math.floor(p.x),
        y: Math.floor(p.y),
      });
      const client = { x: 17 + s.x * 0.7, y: -63 + s.y * 0.7 };
      const mapped = clientToCanvas(
        client,
        { left: 17, top: -63, width: c.width * 0.7, height: c.height * 0.7 },
        c,
      );
      close(mapped.x, s.x);
      close(mapped.y, s.y);
    }
  }
});
test("graphics: explicit zoom pivot stays under the same world position", () => {
  const c = new Camera(),
    pivot = { x: 450, y: 200 },
    p = c.screenToWorld(pivot);
  c.setZoom(1.5, pivot);
  const s = c.worldToScreen(p);
  close(s.x, pivot.x);
  close(s.y, pivot.y);
  assert.throws(() => c.setZoom(0));
});
test("graphics: large scene bounds grow beyond the old 1400×650 surface", () => {
  const c = new Camera();
  c.frame({ minX: -10, minY: -14, maxX: 30, maxY: 8 });
  assert.ok(c.width > 1400);
  assert.ok(c.height > 650);
  for (const p of [
    { x: -10, y: -14 },
    { x: 30, y: 8 },
  ]) {
    const s = c.worldToScreen(p);
    assert.ok(s.x >= 0 && s.x <= c.width && s.y >= 0 && s.y <= c.height);
  }
});
test("graphics: all 112 worker frames, eight directions, feet anchor and per-frame hands are registered", () => {
  const r = createRegistry();
  let count = 0;
  for (const state of ["idle", "walk", "pull", "push"]) {
    const d = r.get(`worker/default/${state}`);
    assert.deepEqual(d.directions, [...DIRECTIONS]);
    assert.deepEqual(
      [d.frameWidth, d.frameHeight, d.anchorX, d.anchorY],
      [24, 24, 12, 21],
    );
    for (const direction of DIRECTIONS) {
      assert.equal(
        r.frame(`${d.id}/${direction}`).rect.y,
        d.frames[direction][0].rect.y,
      );
      for (const f of d.frames[direction]) {
        assert.ok(f.sockets?.leftHandSocket);
        assert.ok(f.sockets?.rightHandSocket);
        assert.ok(f.sockets?.gripSocket);
        count++;
      }
    }
  }
  assert.equal(count, 112);
  assert.notEqual(
    r.get("worker/default/pull").path,
    r.get("worker/default/push").path,
  );
});
test("graphics: atlas frame rectangles include at least one source pixel of spacing", () => {
  for (const d of createRegistry().all()) {
    const all = Object.values(d.frames).flat();
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i].rect,
          b = all[j].rect;
        assert.ok(
          a.x + a.width + 1 <= b.x ||
            b.x + b.width + 1 <= a.x ||
            a.y + a.height + 1 <= b.y ||
            b.y + b.height + 1 <= a.y,
          `${d.id} frames ${i}/${j}`,
        );
      }
  }
});
test("graphics: direction selection supports 8 worker and 16 jack facings without modifying the logical graph", () => {
  const r = createRegistry();
  assert.equal(r.get("jack/default/body").directions.length, 16);
  for (let i = 0; i < 8; i++)
    assert.equal(angleDirection(-Math.PI / 2 + (i * Math.PI) / 4), i);
  for (let i = 0; i < 16; i++)
    assert.equal(angleDirection(-Math.PI / 2 + (i * Math.PI) / 8, 16), i);
  const a = rig({ x: 4, y: 4, d: 0 }),
    b = neighbors(a).find((p) => p.d === 2)!;
  const visible = new Set<number>();
  for (let i = 0; i <= 100; i++) {
    const p = geometry(a, b, i / 100);
    visible.add(angleDirection(Math.atan2(p.heading.y, p.heading.x), 16));
  }
  assert.ok(visible.size >= 5);
  assert.equal(a.d, 0);
  assert.equal(b.d, 2);
});
test("graphics: distance-based strides have exactly one four-frame cycle per tile", () => {
  const g = synthetic({ x: 3, y: 1, d: 0 }, { x: 4, y: 1, d: 0 });
  const a = new AnimationController();
  assert.equal(a.sample(g).frame, 0);
  for (let i = 1; i <= 4; i++) {
    g.task!.elapsed = (g.task!.steps[0].duration * i) / 4;
    const sample = a.sample(g);
    close(sample.distance, i / 4);
    assert.equal(sample.frame, i % 4);
  }
  close(stepDistance(g.task!.steps[0]), 1);
});
test("graphics: time spent stationary never advances a walk/pull stride", () => {
  const g = synthetic({ x: 3, y: 1, d: 0 }, { x: 4, y: 1, d: 0 }),
    a = new AnimationController();
  const before = a.sample(g);
  g.time += 1000;
  const after = a.sample(g);
  assert.equal(after.distance, before.distance);
  assert.equal(after.frame, before.frame);
});
test("graphics: render sampling cadence and ×1/×4 produce the same actual distance and frame", () => {
  const a = ordered(),
    b = ordered(),
    aa = new AnimationController(),
    bb = new AnimationController();
  aa.sample(a);
  bb.sample(b);
  for (let i = 0; i < 400; i++) {
    a.advance(0.05);
    aa.sample(a);
  }
  for (let i = 0; i < 100; i++) {
    b.speed = 4;
    b.advance(0.05);
    bb.sample(b);
  }
  const x = aa.sample(a),
    y = bb.sample(b);
  close(a.time, b.time);
  close(x.distance, y.distance, 1e-5);
  assert.equal(x.frame, y.frame);
  assert.equal(x.state, y.state);
});
test("graphics: push and pull are independent states, switches freeze the movement frame", () => {
  const g = synthetic({ x: 3, y: 1, d: 0 }, { x: 4, y: 1, d: 0 }),
    a = new AnimationController();
  assert.equal(a.sample(g).state, "pull");
  g.task!.phase = "PUSH";
  assert.equal(a.sample(g).state, "push");
  g.task!.phase = "SWITCH_DIRECTION";
  g.task!.steps[0].b.mode = "push";
  const s = a.sample(g);
  assert.equal(s.state, "push");
  assert.equal(s.moving, false);
  assert.equal(s.frame, 0);
});
test("graphics: cancelling before pickup does not turn the abandoned route into walked distance", () => {
  const g = ordered(),
    a = new AnimationController();
  a.sample(g);
  g.advance(0.1);
  a.sample(g);
  g.cancel();
  for (let i = 0; i < 100 && g.task; i++) g.advance(0.05);
  const sample = a.sample(g);
  assert.ok(sample.distance < 1, `Phantom route distance ${sample.distance}`);
});
test("graphics: palms and stretched handle remain connected through every push/pull arc", () => {
  const r = createRegistry(),
    c = new Camera();
  c.move(37, -26);
  c.setZoom(1.5);
  let samples = 0;
  for (const mode of ["pull", "push"] as const) {
    const from = rig({ x: 4, y: 4, d: 0, mode }),
      to = neighbors(from).find((p) => p.d === 2)!;
    const g = synthetic(from, to, mode === "push" ? "PUSH" : "PULL"),
      scene = new SceneBuilder(r);
    for (let f = 0; f <= 50; f++) {
      g.task!.elapsed = (g.task!.steps[0].duration * f) / 50;
      scene.build(g);
      const connection = scene.connections[0],
        def = r.get(connection.actor.assetId),
        frame = r.frame(
          def.id,
          connection.actor.direction,
          connection.actor.frame,
        );
      const hand = localToScreen(
          connection.actor,
          frame.sockets!.gripSocket,
          r,
          c,
        ),
        handle = localToScreen(
          connection.handle,
          r.get(connection.handle.assetId).attachmentPoints!.end,
          r,
          c,
        );
      close(hand.x, handle.x);
      close(hand.y, handle.y);
      const geom = g.transportGeometry;
      close(
        Math.hypot(geom.head.x - geom.hitch.x, geom.head.y - geom.hitch.y),
        DRAWBAR_LENGTH,
      );
      samples++;
    }
  }
  assert.equal(samples, 102);
  assert.equal(HITCH_OFFSET, 0.42);
  assert.equal(DRAWBAR_LENGTH, 0.58);
});
test("graphics: sprite anchors and hand metadata can change without moving any simulation object", () => {
  const r = createRegistry(),
    g = ordered(),
    scene = new SceneBuilder(r);
  g.advance(3);
  const before = JSON.stringify(g);
  r.override("worker/default/walk", { anchorX: 11, anchorY: 20 });
  scene.build(g);
  const a = scene.connections[0].actor;
  assert.deepEqual(a.point, tileCenter(g.transportGeometry.head));
  assert.equal(JSON.stringify(g), before);
});
test("graphics: lifting is exactly 0–3 source pixels vertically, independent of crate rotation", () => {
  const r = createRegistry(),
    c = new Camera(),
    q = new RenderQueue(),
    base = q.asset(
      r,
      "box",
      "cargo/box/blue",
      { x: 4.5, y: 3.5 },
      { angle: Math.PI / 2 },
    ),
    raised = { ...base, liftSource: 3 };
  const a = localToScreen(base, { x: 12, y: 12 }, r, c),
    b = localToScreen(raised, { x: 12, y: 12 }, r, c);
  close(a.x, b.x);
  close(a.y - b.y, 6);
});
test("graphics: cargo and pallet are distinct resources and the shadow stays on the floor during lift", () => {
  const r = createRegistry(),
    g = new Game(),
    scene = new SceneBuilder(r);
  scene.game = g;
  const crate = {
    id: "box",
    color: "blue" as const,
    active: true,
    paid: false,
    loc: { kind: "floor" as const, x: 2, y: 2 },
  };
  scene.cargo(crate, { x: 2, y: 2 }, 0.3, 1);
  const commands = scene.queue.commands as AssetCommand[];
  assert.ok(commands.some((c) => c.assetId === "cargo/pallet"));
  assert.ok(commands.some((c) => c.assetId === "cargo/box/blue"));
  const shadow = commands.find((c) => c.assetId === "shadow/cargo")!;
  assert.equal(shadow.liftSource, undefined);
  assert.deepEqual(crate.loc, { kind: "floor", x: 2, y: 2 });
});
test("graphics: floor depth sorts by support point, not by a tall sprite’s top edge", () => {
  const r = createRegistry(),
    q = new RenderQueue();
  q.asset(r, "front", "worker/default/idle", { x: 2, y: 3 });
  q.asset(r, "back", "rack/standard/segment", { x: 2, y: 2 });
  assert.deepEqual(
    q.ordered().map((c) => c.id),
    ["back", "front"],
  );
});
test("graphics: fork/pallet/box dependencies preserve foreground layers and stable floor ordering", () => {
  const r = createRegistry(),
    q = new RenderQueue();
  q.asset(r, "box", "cargo/box/red", { x: 2, y: 1 }, { after: ["pallet"] });
  q.asset(r, "body", "jack/default/body", { x: 2, y: 2 }, { order: 10 });
  q.asset(r, "pallet", "cargo/pallet", { x: 2, y: 1 }, { after: ["body"] });
  q.asset(r, "floor", "floor/base", { x: 2, y: 2 });
  q.asset(
    r,
    "front-wall",
    "wall/segment",
    { x: 2, y: 1 },
    { layer: LAYERS.constructionFront },
  );
  assert.deepEqual(
    q.ordered().map((c) => c.id),
    ["floor", "body", "pallet", "box", "front-wall"],
  );
});
test("graphics: illegal dependency cycles are diagnosed", () => {
  const r = createRegistry(),
    q = new RenderQueue();
  q.asset(r, "a", "cargo/pallet", { x: 0, y: 0 }, { after: ["b"] });
  q.asset(r, "b", "cargo/pallet", { x: 0, y: 0 }, { after: ["a"] });
  assert.throws(() => q.ordered(), /Cykl/);
});
test("graphics: modular vehicles of 4/6/8/10 pallets use identical modules and four wheels", () => {
  const r = createRegistry();
  for (const [capacity, total] of [
    [4, 80],
    [6, 104],
    [8, 128],
    [10, 152],
  ]) {
    const q = new RenderQueue(),
      v = composeVehicle(
        q,
        r,
        {
          id: "test",
          kind: "inbound",
          bay: 0,
          capacity,
          state: "docked",
          timer: 0,
        },
        20,
      ),
      assets = q.commands.filter((c) => c.kind === "asset");
    assert.equal(vehicleLengthSource(capacity), total);
    close((v.right - v.left) * 24, total);
    assert.equal(
      assets.filter((c) => c.assetId === "vehicle/default/cargo_segment")
        .length,
      capacity / 2,
    );
    assert.equal(
      assets.filter((c) => c.assetId === "vehicle/default/slot").length,
      capacity,
    );
    assert.equal(
      assets.filter((c) => c.assetId === "vehicle/default/cab").length,
      1,
    );
    assert.equal(
      assets.filter((c) => c.assetId === "vehicle/default/wheel").length,
      4,
    );
    assert.equal(
      assets.filter((c) => c.assetId === "vehicle/default/end").length,
      1,
    );
  }
  assert.throws(() => vehicleLengthSource(5));
});
test("graphics: vehicle labels never mirror with the cab", () => {
  const r = createRegistry(),
    q = new RenderQueue();
  composeVehicle(
    q,
    r,
    {
      id: "PL-123",
      kind: "inbound",
      bay: 1,
      capacity: 8,
      state: "docked",
      timer: 0,
    },
    20,
  );
  assert.ok(
    q.commands.some(
      (c) =>
        c.kind === "asset" && c.assetId === "vehicle/default/cab" && c.mirror,
    ),
  );
  const label = q.commands.find((c) => c.kind === "text");
  assert.ok(label && label.kind === "text");
  assert.equal(label.text, "PL-123");
  assert.equal("mirror" in label, false);
});
test("graphics: extending a rack adds one post and one segment, never a doubled shared post", () => {
  const r = createRegistry();
  for (const n of [1, 2, 5]) {
    const q = new RenderQueue();
    composeRack(q, r, "rack", { x: 1, y: 1 }, n);
    const posts = q.commands.filter(
      (c) => c.kind === "asset" && c.assetId === "rack/standard/post",
    );
    assert.equal(posts.length, n + 1);
    assert.equal(new Set(posts.map((c) => c.point.x)).size, n + 1);
    assert.equal(
      q.commands.filter(
        (c) => c.kind === "asset" && c.assetId === "rack/standard/segment",
      ).length,
      n,
    );
  }
});
test("graphics: environment is deterministic, modular, and does not alter room geometry", () => {
  const r = createRegistry(),
    g = new Game(),
    scene = new SceneBuilder(r),
    before = JSON.stringify(g);
  const a = scene
    .build(g)
    .commands.filter(
      (c) => c.id.startsWith("floor/") || c.id.startsWith("room/"),
    );
  g.time = 100;
  const b = scene
    .build(g)
    .commands.filter(
      (c) => c.id.startsWith("floor/") || c.id.startsWith("room/"),
    );
  assert.deepEqual(a, b);
  g.time = 0;
  assert.equal(JSON.stringify(g), before);
  assert.ok(
    a.some((c) => c.kind === "asset" && c.assetId === "furniture/monitor"),
  );
  assert.ok(a.filter((c) => c.id.includes("/floor/")).length >= 36);
});
test("graphics: missing and undersized images fall back safely without rejecting the render loop", async () => {
  const r = createRegistry(),
    d = r.get("worker/default/walk"),
    bad = new AssetStore(async () => ({
      image: {} as CanvasImageSource,
      width: 24,
      height: 24,
    }));
  assert.equal((await bad.ready(d)).status, "placeholder");
  assert.match(bad.diagnostics()[0].reason!, /atlas/);
  assert.equal((await missing().ready(d)).status, "placeholder");
});
test("graphics: valid PNG replacement uses the same anchors and source atlas rectangles as a placeholder", async () => {
  const r = createRegistry(),
    d = r.get("worker/default/pull");
  r.override(d.id, { path: "assets/custom/pull.png" });
  const updated = r.get(d.id),
    store = new AssetStore(async (path) => {
      assert.equal(path, "assets/custom/pull.png");
      return { image: {} as CanvasImageSource, width: 99, height: 199 };
    });
  await store.ready(updated);
  const camera = new Camera(),
    painter = new AssetPainter(r, store, camera),
    q = new RenderQueue(),
    command = q.asset(
      r,
      "worker",
      d.id,
      { x: 2, y: 2 },
      { direction: 3, frame: 2 },
    ),
    ctx = context();
  painter.draw(ctx, command);
  const draw = ctx.calls.find((c) => c.name === "drawImage")!;
  assert.deepEqual(draw.args.slice(1, 5), [50, 75, 24, 24]);
  assert.equal(ctx.imageSmoothingEnabled, false);
  assert.deepEqual(
    localToScreen(command, { x: 12, y: 21 }, r, camera),
    camera.worldToScreen(command.point),
  );
});
test("graphics: non-square assets keep their declared dimensions and anchors", () => {
  const r = createRegistry();
  for (const [id, w, h, ax, ay] of [
    ["wall/segment", 24, 36, 12, 24],
    ["rack/standard/segment", 24, 40, 12, 28],
    ["furniture/locker", 24, 32, 12, 20],
    ["vehicle/default/cab", 24, 48, 0, 0],
    ["furniture/monitor", 12, 12, 6, 6],
  ] as const) {
    const d = r.get(id);
    assert.deepEqual(
      [d.frameWidth, d.frameHeight, d.anchorX, d.anchorY],
      [w, h, ax, ay],
    );
    const c = new Camera(),
      q = new RenderQueue(),
      command = q.asset(r, id, id, { x: 2, y: 2 }),
      b = commandBounds(command, r, c);
    close(b.width, w * 2);
    close(b.height, h * 2);
  }
});
test("graphics: nine-slice stretches the centre while preserving all corner dimensions", async () => {
  const r = createRegistry(),
    d = r.get("ui/panel"),
    store = new AssetStore(async () => ({
      image: {} as CanvasImageSource,
      width: 24,
      height: 24,
    }));
  await store.ready(d);
  const painter = new AssetPainter(r, store, new Camera()),
    ctx = context();
  painter.nineSlice(ctx, d.id, { x: 10, y: 20, width: 200, height: 100 });
  const draws = ctx.calls.filter((c) => c.name === "drawImage");
  assert.equal(draws.length, 9);
  assert.deepEqual(draws[0].args.slice(5), [10, 20, 16, 16]);
  assert.deepEqual(draws[4].args.slice(5), [26, 36, 168, 68]);
  assert.deepEqual(draws[8].args.slice(5), [194, 104, 16, 16]);
});
test("graphics: asset, effect, camera and debug metadata have no authority over physical collision geometry", () => {
  const g = ordered(),
    before = JSON.stringify(g),
    r = createRegistry(),
    scene = new SceneBuilder(r),
    c = new Camera();
  scene.build(g);
  c.setZoom(2);
  c.move(-100, 20);
  r.override("cargo/box/red", { anchorX: 1, anchorY: 2 });
  scene.build(g);
  assert.equal(JSON.stringify(g), before);
  assert.deepEqual(
    g.transportGeometry,
    geometry(
      g.task!.steps[0].a,
      g.task!.steps[0].b,
      g.task!.elapsed / g.task!.steps[0].duration,
    ),
  );
});
test("graphics: one-shot frame resolution clamps while looped animation wraps", () => {
  const r = createRegistry(),
    d = r.get("worker/default/walk");
  r.register({ ...d, id: "worker/test/once", animationMode: "once" });
  assert.equal(r.frame("worker/test/once", 0, 100).rect.x, 75);
  assert.equal(r.frame(d.id, 0, 100).rect.x, 0);
});
test("graphics: worker facing follows the steered drawbar while jack selection follows the axle", () => {
  const a = rig({ x: 4, y: 4, d: 0 }),
    b = neighbors(a).find((p) => p.d === 2)!;
  const g = synthetic(a, b),
    animation = new AnimationController();
  g.task!.elapsed = g.task!.steps[0].duration * 0.2;
  const geom = g.transportGeometry,
    s = animation.sample(g);
  assert.equal(
    s.direction,
    angleDirection(
      Math.atan2(geom.head.y - geom.hitch.y, geom.head.x - geom.hitch.x),
    ),
  );
  assert.equal(
    s.bodyDirection,
    angleDirection(Math.atan2(geom.heading.y, geom.heading.x), 16),
  );
});
test("graphics: exterior background is an asset-backed tile plane in layer zero", () => {
  const r = createRegistry(),
    g = new Game(),
    scene = new SceneBuilder(r),
    q = scene.build(g),
    first = q.ordered()[0];
  assert.equal(first.kind, "asset");
  assert.ok(first.kind === "asset");
  assert.equal(first.assetId, "exterior/base");
  assert.equal(first.layer, 0);
  assert.ok(first.repeat!.width > 20 * 24);
});
test("graphics: screen-space UI icons stay fixed while the world camera pans and zooms", () => {
  const r = createRegistry(),
    c = new Camera(),
    q = new RenderQueue(),
    icon = q.asset(
      r,
      "ui",
      "ui/icon/standard",
      { x: 150, y: 80 },
      { space: "screen" },
    );
  const a = commandBounds(icon, r, c);
  c.setZoom(3);
  c.move(500, -200);
  assert.deepEqual(commandBounds(icon, r, c), a);
  assert.equal(a.width, 32);
  assert.equal(a.height, 32);
});
test("graphics: nine-slice UI corners never grow with camera zoom", async () => {
  const r = createRegistry(),
    d = r.get("ui/panel"),
    c = new Camera(),
    store = new AssetStore(async () => ({
      image: {} as CanvasImageSource,
      width: 24,
      height: 24,
    }));
  await store.ready(d);
  const painter = new AssetPainter(r, store, c),
    ctx = context();
  c.setZoom(3);
  painter.nineSlice(ctx, d.id, { x: 0, y: 0, width: 200, height: 56 });
  assert.deepEqual(
    ctx.calls.find((v) => v.name === "drawImage")!.args.slice(5),
    [0, 0, 16, 16],
  );
});
test("graphics: opaque vehicle-bed modules never cover cargo in either lane", () => {
  const r = createRegistry(),
    g = new Game(),
    scene = new SceneBuilder(r);
  g.accept();
  g.advance(1.1);
  const order = scene.build(g).ordered();
  const beds = order.filter(
    (c) =>
      c.kind === "asset" &&
      (c.assetId === "vehicle/default/cargo_segment" ||
        c.assetId === "vehicle/default/slot"),
  );
  const crates = order.filter(
    (c) => c.kind === "asset" && c.assetId.startsWith("cargo/box/"),
  );
  assert.equal(crates.length, 4);
  for (const bed of beds)
    for (const crate of crates)
      assert.ok(order.indexOf(bed) < order.indexOf(crate));
});
