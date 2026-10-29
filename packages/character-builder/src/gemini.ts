import { primarySlots, type ProjectDocument } from "../../document-core/src";
import { type AIAnalysis } from "../../ai-contracts/src/gemini";
import { ensureAssembly, setAnchor } from "./layout";

/** Validated model suggestions remain editable. Uncertain anatomy needs explicit review. */
export function applyGeminiAnalysis(
  doc: ProjectDocument,
  analysis: AIAnalysis,
  model: string,
  jobId: string,
) {
  const b = doc.characterBuild!;
  const needs = new Set(analysis.ambiguousCandidateIds);
  for (const a of analysis.assignments) {
    const c = b.candidates.find((c) => c.id === a.candidateId);
    if (!c) throw Error("AI candidate không tồn tại");
    c.label = a.slot;
    c.confidence = a.confidence;
    c.method = "provider";
    c.rejected = false;
    c.orientation = analysis.facing === "unknown" ? "unknown" : analysis.facing;
    c.provider = { id: "google-gemini", model, jobId, approved: false };
    c.warnings = a.warnings.slice(0, 16);
    if (
      a.confidence < 0.8 ||
      (["left_arm", "right_arm", "left_leg", "right_leg"].includes(a.slot) &&
        !a.lateralityCertain)
    )
      needs.add(c.id);
  }
  for (const slot of primarySlots)
    b.selection[slot] =
      analysis.assignments.find((a) => a.slot === slot)?.candidateId ?? null;
  b.method = "provider";
  b.provider = { id: "google-gemini", model };
  b.approved = false;
  b.warnings = analysis.warnings.slice(0, 16);
  b.aiReview = {
    model,
    jobId,
    at: new Date().toISOString(),
    viewpoint: analysis.viewpoint,
    facing: analysis.facing,
    renderOrder: analysis.renderOrder,
    needsReviewCandidateIds: [...needs],
    assignments: analysis.assignments.map(
      ({ candidateId, slot, confidence, lateralityCertain, depth }) => ({
        candidateId,
        slot,
        confidence,
        lateralityCertain,
        depth,
      }),
    ),
  };
  // Keep all source textures. Only chosen optional candidates must cease being accessories.
  b.optionalAttachments = b.optionalAttachments?.filter(
    (a) => !Object.values(b.selection).includes(a.candidateId),
  );
  ensureAssembly(doc);
  for (const a of analysis.anchors)
    setAnchor(doc, a.candidateId, a.name, { x: a.x, y: a.y });
}
