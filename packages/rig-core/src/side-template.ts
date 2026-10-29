import type { ProjectDocument, Bone } from "../../document-core/src";
import { boneMatrices, transform, inverse, degrees } from "./index";
export const sideLandmarks = {
  Root: [400, 650, 425, 650],
  Hip: [400, 440, 400, 418],
  Spine: [400, 440, 405, 345],
  Chest: [405, 345, 416, 270],
  Neck: [416, 270, 425, 248],
  Head: [425, 248, 438, 170],
  "Far Shoulder": [408, 278, 375, 290],
  "Far Upper Arm": [375, 290, 389, 380],
  "Far Forearm": [389, 380, 411, 454],
  "Far Hand": [411, 454, 417, 467],
  "Near Shoulder": [416, 277, 432, 295],
  "Near Upper Arm": [432, 295, 455, 385],
  "Near Forearm": [455, 385, 482, 457],
  "Near Hand": [482, 457, 490, 467],
  "Far Thigh": [384, 433, 367, 535],
  "Far Shin": [367, 535, 360, 630],
  "Far Foot": [360, 630, 411, 646],
  "Near Thigh": [411, 433, 426, 535],
  "Near Shin": [426, 535, 419, 630],
  "Near Foot": [419, 630, 467, 646],
  "Cape Base": [365, 275, 344, 410],
  "Cape Tip": [344, 410, 310, 585],
  "Hair Back": [395, 180, 365, 270],
  "Hair Front": [434, 155, 468, 214],
  "Weapon Socket": [482, 457, 484, 340],
} as const;
export function sideTemplate(doc: ProjectDocument) {
  const id = crypto.randomUUID();
  doc.skeletons.push({
    id,
    name: "Side 3/4 · procedural",
    provenance: "procedural",
    template: "side-3-4-v1",
  });
  const byName = new Map<string, Bone>();
  for (const [name, coords] of Object.entries(sideLandmarks)) {
    const parent: string | null =
      name === "Root"
        ? null
        : name === "Hip"
          ? "Root"
          : name === "Spine"
            ? "Hip"
            : name === "Chest"
              ? "Spine"
              : name === "Neck"
                ? "Chest"
                : name === "Head"
                  ? "Neck"
                  : name === "Cape Base"
                    ? "Chest"
                    : name === "Cape Tip"
                      ? "Cape Base"
                      : name.startsWith("Hair ")
                        ? "Head"
                        : name === "Weapon Socket"
                          ? "Near Hand"
                          : name.endsWith(" Shoulder")
                            ? "Chest"
                            : name.endsWith(" Upper Arm")
                              ? name.replace(" Upper Arm", " Shoulder")
                              : name.endsWith(" Forearm")
                                ? name.replace(" Forearm", " Upper Arm")
                                : name.endsWith(" Hand")
                                  ? name.replace(" Hand", " Forearm")
                                  : name.endsWith(" Thigh")
                                    ? "Hip"
                                    : name.endsWith(" Shin")
                                      ? name.replace(" Shin", " Thigh")
                                      : name.replace(" Foot", " Shin");
    const pb = parent ? byName.get(parent) : null;
    if (parent && !pb) throw Error("Side template parent missing: " + parent);
    const [x, y, ex, ey] = coords,
      m = pb ? boneMatrices(doc, "rest").get(pb.id)! : null,
      local = m ? transform(inverse(m), { x, y }) : { x, y },
      angle = degrees(Math.atan2(ey - y, ex - x));
    const b: Bone = {
      id: crypto.randomUUID(),
      skeletonId: id,
      parentId: pb?.id ?? null,
      name,
      rest: {
        ...local,
        rotation: angle - (m ? degrees(Math.atan2(m.b, m.a)) : 0),
      },
      pose: { x: 0, y: 0, rotation: 0 },
      length: Math.hypot(ex - x, ey - y),
      constraints: {
        minRotation: name.endsWith(" Shin")
          ? 0
          : name.endsWith(" Forearm")
            ? -145
            : -180,
        maxRotation: name.endsWith(" Shin")
          ? 155
          : name.endsWith(" Forearm")
            ? 55
            : 180,
      },
    };
    doc.bones.push(b);
    byName.set(name, b);
  }
  for (const side of ["Near", "Far"])
    for (const limb of ["arm", "leg"]) {
      const root = byName.get(
          side + (limb === "arm" ? " Upper Arm" : " Thigh"),
        )!,
        mid = byName.get(side + (limb === "arm" ? " Forearm" : " Shin"))!,
        end = byName.get(side + (limb === "arm" ? " Hand" : " Foot"))!,
        m = boneMatrices(doc, "rest").get(end.id)!;
      doc.ikTargets.push({
        id: crypto.randomUUID(),
        rootBoneId: root.id,
        midBoneId: mid.id,
        endBoneId: end.id,
        x: m.tx,
        y: m.ty,
        bend: limb === "arm" ? -1 : 1,
        enabled: false,
        blend: 1,
      });
    }
  doc.equipmentSlots.push({
    id: crypto.randomUUID(),
    name: "Weapon Socket",
    boneId: byName.get("Weapon Socket")!.id,
  });
  return byName;
}
