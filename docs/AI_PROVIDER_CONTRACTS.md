# AI provider contracts

Capabilities: character, costume, weapon, segmentation, inpainting, landmarks, rig-plan, mesh-suggestion, motion-plan, vfx-config, edit-command, quality-check. Provider adapter exposes id, capabilities, availability, plan(request, signal) and execute(plan, signal). Output includes provenance, seed, model, input and output references, an editable document patch and verification findings. Segmentation is uncertain; manual review is mandatory. No provider is installed in Phase 1.

Lifecycle: REQUEST → VALIDATE → PLAN → EXECUTE → VERIFY → PREVIEW → APPROVAL → COMMIT. Failed/cancelled are terminal. Only explicit approval may commit a verified document patch. Requests include UUID, capability, prompt, target IDs, base revision and parameters. Jobs include status/progress/error, cancellation, timestamps, inputs, outputs, model/provider provenance and reproducibility metadata. Stale base revisions require revalidation. The editor never applies provider output directly. Secrets live only on the API. No dummy AI progress or fallback artwork.

Local deterministic samples are procedural, not AI. Provider registry reports unavailable capabilities honestly. Future real adapters are independent of editor rendering and document schema.
