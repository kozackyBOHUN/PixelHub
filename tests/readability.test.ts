import { test } from "node:test";
import assert from "node:assert/strict";
import cfg from "../src/config.ts";
import { CampaignGame } from "../src/campaign-game.ts";
import type { Crate } from "../src/simulation.ts";
import { ready, remainingRounds } from "../src/shipments.ts";
import { createRegistry } from "../src/graphics/assets.ts";
import { SceneBuilder } from "../src/graphics/scene.ts";
import { Camera } from "../src/graphics/config.ts";
import {
  commandBounds,
  AssetPainter,
  AssetStore,
} from "../src/graphics/engine.ts";
function fixture() {
  const g = new CampaignGame();
  g.round = 5;
  g.startRound();
  const crate: Crate = {
    id: "READABILITY",
    color: "gray",
    destinationColor: "red",
    dispatchRound: 7,
    dueRound: 7,
    active: false,
    paid: false,
    loc: { kind: "floor", x: 6, y: 0 },
    temperature: "standard",
    condition: "standard",
  };
  g.crates = [crate];
  const registry = createRegistry(),
    scene = new SceneBuilder(registry);
  scene.build(g);
  return { g, crate, registry, scene };
}
test("readability: future cargo retains destination colour and a two-round badge without becoming eligible", () => {
  const { g, crate, scene } = fixture();
  const commands = scene.queue.commands;
  const box = commands.find((c) => c.id === "cargo/READABILITY/box");
  assert.ok(box?.kind === "asset");
  assert.equal(box.assetId, "cargo/box/red");
  const due = commands.find((c) => c.id === "cargo/READABILITY/due");
  assert.ok(due?.kind === "badge");
  assert.equal(due.text, "2");
  assert.equal(remainingRounds(crate, g.round), 2);
  assert.equal(ready(crate, g.round), false);
});
test("readability: spinning a transported pose never tilts the 2.5D box or pallet image", () => {
  const { g, crate, scene } = fixture();
  const snapshot = () =>
    JSON.stringify([g.crates, g.pose, g.task, g.time, g.ledger]);
  const before = snapshot();
  for (let i = 0; i < 16; i++) {
    scene.queue.clear();
    scene.cargo(crate, { x: 4, y: 2 }, (i * Math.PI) / 8, 1);
    for (const suffix of ["box", "pallet"]) {
      const c = scene.queue.commands.find(
        (c) => c.id === `cargo/READABILITY/${suffix}`,
      );
      assert.ok(c?.kind === "asset");
      assert.equal(c.angle, 0);
      assert.equal(c.liftSource, 3);
    }
    const badge = scene.queue.commands.find((c) => c.kind === "badge");
    assert.ok(badge);
    assert.equal(badge.point.y, 2.5 - 0.15 - 3 / 24);
  }
  assert.equal(snapshot(), before);
});
test("readability: room boundaries are confined to reserved rooms and no tall wall covers the storage aisle", () => {
  const { scene } = fixture();
  const commands = scene.queue.commands;
  assert.equal(commands.filter((c) => c.kind === "room").length, 4);
  assert.ok(
    !commands.some((c) => c.kind === "asset" && c.assetId.startsWith("wall/")),
  );
  for (const room of cfg.map.rooms) {
    const panel = commands.find((c) => c.id === `room/${room.id}/interior`);
    assert.ok(panel?.kind === "room");
    assert.deepEqual(panel.point, { x: room.x, y: room.y });
    assert.equal(panel.width, room.width);
    assert.equal(panel.height, room.height);
  }
});
test("readability: every furniture frame fits inside its room, including the bottom row", () => {
  const { scene, registry } = fixture();
  const camera = new Camera();
  for (const room of cfg.map.rooms) {
    const min = camera.worldToScreen({ x: room.x, y: room.y });
    const max = camera.worldToScreen({
      x: room.x + room.width,
      y: room.y + room.height,
    });
    const furniture = scene.queue.commands.filter(
      (c) =>
        c.kind === "asset" &&
        c.id.startsWith(`room/${room.id}/`) &&
        c.assetId.startsWith("furniture/"),
    );
    assert.ok(furniture.length >= 2);
    for (const c of furniture) {
      assert.ok(c.kind === "asset");
      const b = commandBounds(c, registry, camera);
      assert.ok(
        b.x >= min.x &&
          b.y >= min.y &&
          b.x + b.width <= max.x &&
          b.y + b.height <= max.y,
        c.id,
      );
    }
  }
});
test("readability: round badge paints an opaque background and centred readable text even when zoomed out", () => {
  const { registry, scene } = fixture();
  const camera = new Camera();
  camera.zoom = 0.5;
  const painter = new AssetPainter(
    registry,
    new AssetStore(async () => {
      throw Error("unused");
    }),
    camera,
  );
  const calls: { name: string; args: unknown[] }[] = [];
  const values: Record<string, unknown> = { measureText: () => ({ width: 8 }) };
  const ctx = new Proxy(values, {
    get: (t, k) =>
      k in t
        ? t[k as string]
        : (...args: unknown[]) => calls.push({ name: String(k), args }),
    set: (t, k, v) => {
      t[k as string] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const badge = scene.queue.commands.find((c) => c.kind === "badge")!;
  painter.draw(ctx, badge);
  assert.equal(values.font, "bold 12px monospace");
  assert.equal(values.textAlign, "center");
  assert.ok(calls.find((c) => c.name === "fillRect"));
  assert.ok(calls.find((c) => c.name === "strokeRect"));
  assert.ok(calls.find((c) => c.name === "fillText" && c.args[0] === "2"));
});
