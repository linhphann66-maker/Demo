# Phase 4 — VFX Studio 0.4.0

The initial particle foundation is completed by the current implementation. Final validation/publication results are tracked in `PHASE4_VALIDATION.md`; historical foundation evidence remains under ignored work logs and source archives.

- [x] Audit and preserve existing uncommitted Phase 1–3/side/particle work
- [x] Versioned strict schemas and deterministic seeded particle engine
- [x] Shared Pixi renderer, pooling, source-texture reuse and resource cleanup
- [x] VFX library/hierarchy, emitter inspector and undoable canonical editing
- [x] Bone/root/custom attachments, editable base/tip markers, gizmo drag, Local/World and mirroring
- [x] Motion ribbon trails bound to actual Attack events with fade/cleanup/reproducible seeks
- [x] Parameter keys, easing/Bezier curves, lifetime curves, timeline editing and copy/paste
- [x] Soft glow, tint/alpha, transforms, scoped distortion/dissolve and flipbook metadata/frames
- [x] Five procedural reference presets and independent saved preset instances
- [x] Footstep events generated from evaluated Walk/Run foot trajectories
- [x] Project/API/JSON persistence, compatible old-file loading and validated resource imports
- [x] Transparent VFX-only and character+VFX spritesheet export; current-frame PNG with VFX
- [x] Transient quality controls, CPU/render measurement and bounded lifecycle browser coverage
- [x] Final complete regression: 44/44 E2E + 1/1 targeted deletion regression, 138 unit, 88 API, strict TypeScript, lint and production build
- [x] Native existing-Site deployment succeeded; confirmed current URL: https://ai-2d-asset-studio-flame-knight.songkiem9.chatgpt.site

This uses a functional structured effect stack rather than a decorative/free-form node graph. Optional unsupported formats/backends and exact loop/crossfade behavior are documented in `PHASE4_IMPLEMENTATION.md`. No paid AI or Phase 5 generation is included. GitHub HEAD stays unchanged; only the separate Sites publishing source is committed/pushed under the existing publication authorization.
