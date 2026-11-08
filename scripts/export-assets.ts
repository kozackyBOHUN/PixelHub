import { createRegistry } from "../src/graphics/assets.ts";
import { GRAPHICS, LAYERS } from "../src/graphics/config.ts";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("public/assets", { recursive: true });
writeFileSync(
  "public/assets/catalog.json",
  JSON.stringify(
    {
      version: 1,
      scale: GRAPHICS,
      layers: LAYERS,
      assets: createRegistry().all(),
    },
    null,
    2,
  ) + "\n",
);
