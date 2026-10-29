# Phase 4 VFX Studio validation — 0.4.0

## Preservation and baseline

The existing repository was extended in place. Before changes, editable source was archived in ignored `work/phase4-completion-baseline/source.tar.gz`. Actual baseline: 125 unit tests passed; strict TypeScript and production build passed. Earlier particle foundation evidence (73 API and 37 browser tests) was historical until the current reruns. Original front/side artwork, rig/mesh and animation records remain editable. No GitHub commit/push is performed.

## Current executed checks

- `npm run typecheck`: passed.
- `npm test`: 138 tests passed, 13 files.
- `.venv/bin/pytest apps/api/tests -q`: 88 tests passed; one existing Starlette/AnyIO deprecation warning.
- `npm run lint`: passed.
- `npm run build`: passed, version 0.4.0; Pixi's existing >500 kB chunk warning remains.
- Focused VFX browser checks: 8 passed (1.2 minutes), including the existing particle workflow and seven new full-studio workflows.
- `npm run test:e2e`: **44/44 tests passed in 5.0 minutes**, including all original Phase 1–3/side cases and the full VFX studio cases.

## Evidence and coverage

New unit cases cover sampled moving sword markers, fading stop and bounded geometry, stable event references/timing edits, burst seek consistency, parameter rate integration, linear/stepped/Bezier/color interpolation, normalized lifetime curves, follow/pin/reflection behavior, atlas frame selection/bounds, all five editable presets, independent instances, nested ID remapping, project ZIP, undo/redo, resource/reference rejection, cache cleanup and evaluated foot-contact events.

New API cases roundtrip extended effects, textures and preset definitions and reject duplicate IDs, missing bones/assets, frame bounds/offset errors, duplicate or unsorted keys, out-of-range values, invalid curve times/values, unknown fields and invalid trigger/sprite references.

Browser tests operate the actual existing editor and Pixi canvas: event-linked trail and marker edits; pixel changes when hidden; no ghost trail after lifetime; parameter keys/Bezier/preset saves/reload; scoped GLSL compile without fallback; imported two-frame colored flipbook; VFX-only and combined PNG atlases with transparency and multiple different frame hashes; a single undoable marker drag; reflected canonical ribbon coordinates; five-preset render lifecycle; editable JSON resource export/reimport with remapped IDs and preserved image bytes; actual footstep-bound instances; live parameter edits keep playback running; preview Stop pauses/clears without changing source visibility.

Artifacts: `work/phase4-trail.png`, `phase4-filters-flipbook.png`, `phase4-vfx-spritesheet.png`, `phase4-vfx-frames.json`, `phase4-combined-spritesheet.png`, `phase4-combined-frames.json`; logs `phase4-completion-{typecheck,unit,api,lint,build,browser,final-e2e}.log`.

## Performance

`work/phase4-completion-performance.json` records an isolated 90-frame loop (first five warmups excluded) against five presets on the 45-layer/48-bone demo, including actual skeletal evaluation, VFX simulation, adapter updates and render submission. Last focused run: median ~3.1 ms, p95 ~8.1 ms, peak115 particles/21 ribbon rows, max203 pooled sprites, 85 matrix cache entries. Pool/cache counts are zero after teardown and the main editor continues rendering. These are software-WebGL CPU/submission measurements, not GPU completion/FPS guarantees. Final full run regenerates the measurement file and its exact values are reported below.

## Modified files

Core additions: `packages/vfx-core/src/extended-schema.ts`, `parameters.ts`, `scene.ts`, `presets.ts`, `footsteps.ts`, `curves.ts`, `validation.ts`, `studio.test.ts`; existing schema/index/project evaluator extended. `packages/render-core/src/vfx.ts` and SceneRenderer add pooled particles/ribbons/flipbooks/scoped filters/cleanup. `packages/editor-core/src/vfx-actions.ts`, `vfx-state.ts`, store integrate gestures, runtime controls, clipboard, playback and reference pruning.

Web: new `VFXAdvanced.tsx`, `VFXLifeCurves.tsx`, `VFXTimeline.tsx`, `vfx-import.ts`; existing VFXStudio/App/Viewport/style integration. Exporters add `vfx.ts` and extend animation/current-frame exports. API extends `vfx_models.py`/main with `tests/test_vfx_studio.py`. AI contracts add `vfx.ts` and export it. Browser coverage: `tests/vfx-studio.spec.ts`; package metadata/lock, README, architecture, project format and Phase 4 documentation updated. Exact hash comparison against the preserved baseline is written to `work/phase4-completion-changes.json`.

## Limits and manual steps

See `PHASE4_IMPLEMENTATION.md` for the complete supported contract, loop/crossfade semantics and honest exclusions. In particular: typed stack instead of full visual graph; rectangular unrotated/untrimmed atlases; fixed safe WebGL shaders; no real AI, GIF/MP4 or engine-specific importer. Imported/custom rigs can need marker/curve/attachment adjustment. Old non-loop endpoint convention is retained. No claim of universal seamless artwork deformation or unlimited GPU budgets.

Manual trial: VFX → Fire Slash → Play Attack; edit base/tip or drag overlay; move start/stop event; add parameter keys; use shader/flipbook sections; save/reload; export both spritesheet modes or portable effect data. Choose Footstep Dust to create contact-bound Walk/Run instances. Phase 1–3 work remains available in the existing tabs.

## Publication

Final regression and native Sites deployment confirmed below. Keep the old Site's identity, URL and audience. Source commits/pushes are restricted to the separate Sites publishing checkout under the existing user authorization.

## Final measurement

```json
{
  "measurements": {
    "samples": 85,
    "medianMs": 2.900000000372529,
    "p95Ms": 6,
    "maxAllocated": 203,
    "peakParticles": 115,
    "peakRows": 21,
    "cacheSize": 85,
    "layers": 45,
    "bones": 48
  },
  "warning": [],
  "allocatedAfterDestroy": 0,
  "cacheAfterClear": 0
}
```

Final validation source GitHub HEAD: `e6908e55f2fd65f1d70b70455361ef6f00580cc9` (unchanged).

## Final targeted cleanup regression

A non-square sprite-texture aspect-ratio check is included in the final 44-test run. A final isolated keyed-emitter deletion fix then passed its dedicated browser regression (1/1, 15.1 seconds): removing the emitter prunes only its own parameter tracks, and undo/redo restores/removes the complete component correctly. Typecheck, lint and production build were rerun successfully after this change. Total executed browser scenarios: 44 full regressions plus this targeted regression. Earlier interrupted rerun logs are retained and are not counted as successful tests.

Latest full-run measurement (including texture aspect check):

```json
{
  "measurements": {
    "samples": 85,
    "medianMs": 2.8999999994412065,
    "p95Ms": 10,
    "maxAllocated": 203,
    "peakParticles": 115,
    "peakRows": 21,
    "cacheSize": 85,
    "layers": 45,
    "bones": 48
  },
  "aspect": {
    "actual": 0.8138297872340425,
    "expected": 0.8138297872340425
  },
  "warning": [],
  "allocatedAfterDestroy": 0,
  "cacheAfterClear": 0
}
```

## Confirmed publication

Native Sites deployment succeeded on the same project ID and owner-private audience. Source commit: `39d4caa9f83922625203682174b6432182a252e3`. Deployment: `appgdep_6ae2ca0987a48191893125a5c3b73c45`. Current URL returned by Sites: https://ai-2d-asset-studio-flame-knight.songkiem9.chatgpt.site. The service now returns the songkiem9 hostname rather than the previous daringgoby6 hostname; no new Site was created. Root GitHub HEAD remains unchanged. Native deployment metadata is retained in `/workspace/work/site-vfx-complete-deployment.json`.
