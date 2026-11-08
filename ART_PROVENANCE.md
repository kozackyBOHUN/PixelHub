# Provenance

Repository: https://github.com/kozackyBOHUN/PixelHub

Baseline commit: e165bc5550ee38c434de0c2519b6ccac4d99b951

Catalog blob: fe62ba9ccb475bdef2b63d3284b4559e92a6b019

Registry blob: 1e7affc2c9a11078a15cb19ce70299c4a9e52d82

Engine blob: 14e10ccfdbc1c736867a82df6a13f250c04d3727

Source references were read through the GitHub connector. Verification sources are a separate local snapshot, not a published change. Production files were rasterized at their declared source dimensions using build_art.py, following explicit user authorization for programmatic pixel drawing. Asset colors follow the accepted textual visual brief. No downloaded third-party stock artwork was used.

A built-in image generation call was made as an initial worker concept. Its result was oversized, and was not cropped, rescaled or used as production artwork. Final bitmap art is the source-scale raster artwork in public/assets, with SHA-256 hashes in inventory.json.

Prompt used for that concept:

Use case: stylized-concept. Create a production pixel-art worker sprite sheet PNG, TRANSPARENT background. Exact output raster 99 pixels wide by 199 pixels tall, native pixel grid, no scaling, no antialias. 4 columns x 8 rows, every frame 24x24, gutters 1 transparent pixel. Rows N NE E SE S SW W NW. Columns four distinct WALK cycle phases. Warehouse worker blue cap orange workwear navy trousers boots, orthographic top down 2.5D, strong dark outlines, small tasteful shading. Feet anchor (12,21) in every cell. No labels no grid lines no shadows. Real ready game sprites, consistent identity, distinct directional views.

Only native scale PNG files under public/assets are integration inputs. Preview images and the GIF are review artifacts. No deployment, commit, push or merge was performed.


## Local integration

The supplied public/assets files were installed unchanged into the current PixelHub 0.2 CMR-fix branch. Registry and config match the reference except for a trailing blank line; catalog JSON is semantically identical. Existing manifest was empty, so no user overrides were displaced. No renderer, simulation, collision, campaign, or save code changed.

Archive SHA-256: 7bcb24a3ae99b4a26662728988d5ba7d6dfa9e71141594c4d429a376efab0ef8
