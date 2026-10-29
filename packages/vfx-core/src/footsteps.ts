import type { ProjectDocument } from "../../document-core/src";
import { boneInView, clipInView } from "../../document-core/src/character";
import { boneMatrices } from "../../rig-core/src";
import { evaluateClip } from "../../animation-core/src/evaluation";
import { addEvent } from "../../animation-core/src/commands";
import { makePreset } from "./presets";
/** Detect descending-to-ground transitions from the evaluated foot trajectory, not fixed timestamps. */
export function addFootstepDust(doc: ProjectDocument) {
  const clips = doc.animationClips.filter(
    (c) => clipInView(doc, c.id) && /^(Walk|Run)$/.test(c.name),
  );
  const feet = doc.bones.filter(
    (b) => boneInView(doc, b.id) && /foot/i.test(b.name),
  );
  const added: string[] = [];
  for (const clip of clips)
    for (const foot of feet) {
      const count = Math.min(1024, Math.max(8, Math.ceil(clip.duration * 60))),
        samples = Array.from({ length: count }, (_, i) => ({
          time: (i / count) * clip.duration,
          y: boneMatrices(
            evaluateClip(doc, clip.id, (i / count) * clip.duration, false),
          ).get(foot.id)!.ty,
        }));
      const ground = Math.max(...samples.map((s) => s.y)),
        contacts = samples.filter(
          (s, i) =>
            ground - s.y < 1.5 && (i === 0 || ground - samples[i - 1].y >= 1.5),
        );
      for (const contact of contacts.slice(0, 4)) {
        if (doc.vfxGraphs.length >= 32) return added;
        const name =
            "footstep_" + foot.id.slice(0, 8) + "_" + contact.time.toFixed(3),
          ev =
            doc.animationEvents.find(
              (e) => e.clipId === clip.id && e.name === name,
            ) ?? addEvent(doc, clip.id, contact.time, name);
        const effect = makePreset("Footstep Dust", doc, clip.id);
        effect.nodes[0].attachment.boneId = foot.id;
        effect.trigger = {
          clipId: clip.id,
          startEventId: ev.id,
          stopEventId: null,
          delay: 0,
          mode: "burst",
        };
        doc.vfxGraphs.push(effect);
        added.push(effect.id);
      }
    }
  return added;
}
