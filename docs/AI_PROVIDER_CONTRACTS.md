# AI provider contracts

Capabilities: character, costume, weapon, segmentation, inpainting, landmarks, rig-plan, mesh-suggestion, motion-plan, vfx-config, edit-command, quality-check. Provider adapter exposes id, capabilities, availability, plan(request, signal) and execute(plan, signal). Output includes provenance, seed, model, input and output references, an editable document patch and verification findings. Segmentation is uncertain; manual review is mandatory. No provider is installed in Phase 1.

Lifecycle: REQUEST → VALIDATE → PLAN → EXECUTE → VERIFY → PREVIEW → APPROVAL → COMMIT. Failed/cancelled are terminal. Only explicit approval may commit a verified document patch. Requests include UUID, capability, prompt, target IDs, base revision and parameters. Jobs include status/progress/error, cancellation, timestamps, inputs, outputs, model/provider provenance and reproducibility metadata. Stale base revisions require revalidation. The editor never applies provider output directly. Secrets live only on the API. No dummy AI progress or fallback artwork.

Local deterministic samples are procedural, not AI. Provider registry reports unavailable capabilities honestly. Future real adapters are independent of editor rendering and document schema.

## Phase 2 integration boundary

No provider or paid AI service is added. Future rig planning adapters can produce ordinary skeleton/bone/IK/attachment records validated by document-core; mesh suggestion adapters can propose bounded geometry and normalized weights. Procedural template generation is explicitly labelled as such and lives in rig-core, independent of React, rendering and provider APIs. The existing command boundary can commit a verified, approved document change; Phase 2 does not bypass future preview/approval requirements or implement fake job execution. Source image replacement rebuilds only its layer-specific derived mesh and preserves unrelated rig entities.

## Side-scrolling anatomical contracts (no provider)

sideCharacterSpec/sideCharacterPrompt explicitly request side-scrolling 2D, mild 3/4 right view, full body/neutral pose, separated near/far limbs, front/back hair, clean silhouette and rig-friendly consistent anatomy. They exclude front-symmetric, extreme-perspective, top-down and up/down generation. AnatomicalEditRequest requires preserving visible source pixels and occluded regions, overlap/underlap sizes, source ID/base revision and a canonical right-facing spec. Region output must include editable source/mask/visible/occluded/overlap/underlap references, pivots/bones, provider provenance and review findings.

The local API exposes `/api/ai/side-character-contract`; segmentation/inpainting endpoints validate the request and return503 because no real provider is configured. They do not create fake jobs or mark generation complete. Editor joint completion is explicitly procedural_neighbor_fill_v1, performed locally from opaque neighbour colours and saved as editable derived PNGs. Real anatomical segmentation, occluded repainting and AI completion remain integration work for a later phase.

## Phase 5A–5B real gateway contract

Character Builder uses its own capability endpoint `/api/builder/providers` and bounded job endpoints under `/api/builder/jobs`. The legacy generic AI endpoint retains its existing behavior. A real remote adapter accepts semantic classification, segmentation, background removal, inpainting, landmarks and assembly plans via strict typed HTTPS JSON. The server holds credentials; the browser provides consent and approves validated results. A/B local image operations remain explicitly procedural. There is no configured pretrained model or fabricated success when the gateway is absent. Model setup, local development limits, response schemas and actual test evidence are documented in PHASE5AB_IMPLEMENTATION.md and PHASE5AB_VALIDATION.md.
