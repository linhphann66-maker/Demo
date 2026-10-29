import type { ProjectDocument } from "../../document-core/src";
import type { VFXGizmo } from "../../vfx-core/src/scene";
export function findVFXAttachment(doc: ProjectDocument, handle: VFXGizmo) {
  const e = doc.vfxGraphs.find((e) => e.id === handle.effectId);
  if (!e) return undefined;
  switch (handle.kind) {
    case "emitter":
      return e.nodes.find((n) => n.id === handle.targetId)?.attachment;
    case "base":
    case "tip":
      return e.trails?.find((n) => n.id === handle.targetId)?.[handle.kind];
    case "flipbook":
      return e.flipbooks?.find((n) => n.id === handle.targetId)?.attachment;
  }
}
