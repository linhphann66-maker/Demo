# Created file manifest

Historical Phase 1 file manifest; Phase 2 additions/modifications are listed in `PHASE2_VALIDATION.md`, current Phase 3 changes in `PHASE3_VALIDATION.md`.

All Phase 1 application files were new. No existing tracked source was modified. Dependencies, generated build output and runtime/test scratch files are excluded below.

- `.gitignore`
- `README.md`
- `apps/api/jobs.py`
- `apps/api/main.py`
- `apps/api/requirements.txt`
- `apps/api/tests/test_api.py`
- `apps/web/package.json`
- `apps/web/src/App.tsx`
- `apps/web/src/Viewport.tsx`
- `apps/web/src/demo.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`
- `docs/AI_PROVIDER_CONTRACTS.md`
- `docs/ARCHITECTURE.md`
- `docs/FILE_MANIFEST.md`
- `docs/PRODUCT_SPEC.md`
- `docs/PROJECT_FORMAT.md`
- `docs/ROADMAP.md`
- `docs/VALIDATION.md`
- `eslint.config.js`
- `index.html`
- `package-lock.json`
- `package.json`
- `packages/ai-contracts/package.json`
- `packages/ai-contracts/src/index.ts`
- `packages/animation-core/package.json`
- `packages/animation-core/src/index.ts`
- `packages/document-core/package.json`
- `packages/document-core/src/document.test.ts`
- `packages/document-core/src/fixture.ts`
- `packages/document-core/src/index.ts`
- `packages/editor-core/package.json`
- `packages/editor-core/src/store.test.ts`
- `packages/editor-core/src/store.ts`
- `packages/exporters/package.json`
- `packages/exporters/src/index.ts`
- `packages/exporters/src/raster-header.test.ts`
- `packages/exporters/src/raster-header.ts`
- `packages/render-core/package.json`
- `packages/render-core/src/index.ts`
- `packages/vfx-core/package.json`
- `packages/vfx-core/src/index.ts`
- `playwright.config.ts`
- `tests/editor.spec.ts`
- `tsconfig.json`
- `vite.config.ts`
- `vitest.config.ts`

## Phase 5A–5B additions

- `packages/character-builder/package.json`, `src/index.ts`, `detect.ts`, `images.ts`, `assembly.ts`, `joint-segments.ts`, `provider.ts`, `model-results.ts`, `builder.test.ts`: detection, extraction, assembly, integration, provider contracts and unit coverage.
- `packages/document-core/src/builder-schema.ts`; additions in `index.ts`, `character-schema.ts`, `mesh-core/src/joint-validation.ts`, `editor-core/src/store.ts`: optional builder persistence, hip kind, compatible sweep opt-in and mapping pruning.
- `apps/web/src/CharacterBuilder.tsx`, `BuilderPreview.tsx`, `BuilderMaskEditor.tsx`, `BuilderModelPanel.tsx`, `builder-worker.ts`, `builder-provider.ts`; additions to `App.tsx` and `styles.css`: wizard, live previews, mask review, provider approval, Worker and toolbar entry.
- `apps/api/builder_models.py`, `builder_provider.py`, `tests/test_builder.py`; additions to `main.py`, `character_models.py`: strict persistence/API jobs and tests.
- `tests/character-builder.spec.ts`, `tests/fixtures/generate-builder-fixture.py`, `BUILDER_LICENSE.md` and original fixture PNGs: real browser workflow and project-owned artwork.
- `docs/PHASE5AB_IMPLEMENTATION.md`, `PHASE5AB_PROGRESS.md`, `PHASE5AB_VALIDATION.md`; updates to README/architecture/format/manifest/contracts/roadmap/validation and root/web versions/package lock. No new external dependency.

## Seven-part Builder continuation

The current Builder uses seven primary parts, a head including facial artwork, version-2 builder metadata, simplified review and deterministic normalization/anchor-based assembly. Earlier eight-slot descriptions are historical. Compatibility, implementation, limitations and current verification: [BUILDER_7_SLOTS.md](BUILDER_7_SLOTS.md). No push/publication is performed for this continuation.
