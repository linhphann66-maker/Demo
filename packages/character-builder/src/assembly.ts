import { axisOf, anchoredLayers, worldAnchor } from "./layout";
export { axisOf } from "./layout";
import { refreshBuilderSegments } from "./joint-segments";
import {
  parseDocument,
  syncHierarchy,
  worldMatrix,
  type ProjectDocument,
  type Asset,
  type Layer,
  type CharacterBuild,
  type PartSlot,
  primarySlots,
} from "../../document-core/src";
import { sideTemplate, sideLandmarks } from "../../rig-core/src/side-template";
import {
  bindLayer,
  boneMatrices,
  transform,
  inverse,
  degrees,
  type Point,
  setBoneRotation,
} from "../../rig-core/src";
import { generateMesh, putMesh, autoWeights } from "../../mesh-core/src";
import {
  registerPart,
  createJointCompletion,
  smoothJointWeights,
  completionTexture,
} from "../../mesh-core/src/joint-completion";
import { validateJoints } from "../../mesh-core/src/joint-validation";
import { createSideReferenceClips } from "../../animation-core/src/side-presets";
export const slotTitles: Record<PartSlot, string> = {
  head: "Đầu (gồm mặt)",
  hair: "Tóc",
  torso: "Thân",
  left_arm: "Tay trái",
  right_arm: "Tay phải",
  left_leg: "Chân trái",
  right_leg: "Chân phải",
};
export function emptyBuild(
  base: ProjectDocument,
  assets: Asset[],
  build: CharacterBuild,
  name: string,
): ProjectDocument {
  const now = new Date().toISOString();
  return parseDocument({
    ...base,
    projectId: crypto.randomUUID(),
    metadata: {
      name: name.trim().slice(0, 100) || "Imported adventurer",
      createdAt: now,
      updatedAt: now,
      revision: 0,
    },
    characterDefinitions: [],
    assetReferences: assets,
    layers: [],
    hierarchy: [],
    skeletons: [],
    bones: [],
    meshes: [],
    vertexWeights: [],
    equipmentSlots: [],
    attachments: [],
    ikTargets: [],
    rigSettings: { mode: "rest" },
    animationClips: [],
    keyframeTracks: [],
    animationEvents: [],
    vfxGraphs: [],
    vfxPresets: [],
    characterParts: [],
    characterJoints: [],
    characterVariants: [],
    jointValidation: null,
    characterSettings: {
      characterView: "side_3_4",
      defaultFacing: "right",
      facing: "right",
      movementMode: "horizontal",
      mirrorForOppositeDirection: true,
      enableVerticalFacing: false,
      worldPosition: { x: 0, y: 0 },
    },
    characterBuild: build,
    revisionHistory: [],
  });
}
export function assemble(
  doc: ProjectDocument,
  options: { allowPartial?: boolean } = {},
) {
  const b = doc.characterBuild!;
  for (const slot of primarySlots) {
    const c = b.candidates.find((c) => c.id === b.selection[slot]);
    if (c && c.label !== "unknown" && c.label !== slot)
      throw Error(
        slotTitles[slot] +
          ": ảnh được gán loại khác; hãy đổi nhãn trong chế độ nâng cao.",
      );
  }
  if (!options.allowPartial && primarySlots.some((s) => !b.selection[s]))
    throw Error("Cần chọn đủ đúng 7 slot trước khi lắp");
  if (!primarySlots.some((s) => b.selection[s]))
    throw Error("Chọn ít nhất một phần trước khi ghép thử");
  if (doc.bones.length)
    throw Error(
      "Đã có rig; không tự ghi đè. Quay lại bản Assembly chưa rig nếu muốn tạo lại.",
    );
  const result = anchoredLayers(doc);
  doc.layers = result.layers;
  b.layerMappings = result.mappings;
  syncHierarchy(doc);
  return parseDocument(doc);
}
export function rigAssembly(doc: ProjectDocument) {
  const review=doc.characterBuild?.aiReview;
  if(review?.needsReviewCandidateIds.some(id=>Object.values(doc.characterBuild!.selection).includes(id)))throw Error('Cần xác nhận các phần Gemini chưa chắc chắn trước khi tạo rig');
  if (
    !doc.characterBuild ||
    primarySlots.some(
      (s) =>
        !doc.characterBuild!.selection[s] ||
        !doc.characterBuild!.layerMappings.some((m) => m.slot === s),
    )
  )
    throw Error("Cần ghép đủ 7 phần đã chọn trước khi tạo rig");
  if (doc.bones.length) throw Error("Rig đã tồn tại; không ghi đè tự động");
  const b = doc.characterBuild!,
    map = sideTemplate(doc),
    desired = new Map<string, [Point, Point]>();
  const extras = b.optionalAttachments ?? [];
  const dropNames = [
    ...(!extras.some((a) => a.kind === "cloak" && a.layerId)
      ? ["Cape Base", "Cape Tip"]
      : []),
    ...(!extras.some((a) => a.kind === "sword" && a.layerId)
      ? ["Weapon Socket"]
      : []),
  ];
  const drop = new Set(
    doc.bones.filter((b) => dropNames.includes(b.name)).map((b) => b.id),
  );
  doc.bones = doc.bones.filter((b) => !drop.has(b.id));
  doc.equipmentSlots = doc.equipmentSlots.filter((s) => !drop.has(s.boneId));

  const layer = (slot: PartSlot) =>
    doc.layers.find(
      (l) => l.id === b.layerMappings.find((m) => m.slot === slot)!.layerId,
    )!;
  const at = (slot: PartSlot, u: number, v: number) => {
    const l = layer(slot),
      a = doc.assetReferences.find((a) => a.id === l.assetId)!;
    return transform(worldMatrix(doc, l), { x: a.width * u, y: a.height * v });
  };
  const aLeft = worldAnchor(doc, "torso", "left_hip_anchor"),
    aRight = worldAnchor(doc, "torso", "right_hip_anchor");
  const hip = { x: (aLeft.x + aRight.x) / 2, y: (aLeft.y + aRight.y) / 2 },
    chest = at("torso", 0.48, 0.45),
    neck = worldAnchor(doc, "torso", "neck_anchor"),
    head = worldAnchor(doc, "head", "neck_base"),
    headTip = at("head", 0.6, 0.1);
  desired.set("Root", [
    { x: hip.x, y: 650 },
    { x: hip.x + 25, y: 650 },
  ]);
  desired.set("Hip", [hip, { x: hip.x, y: hip.y - 22 }]);
  desired.set("Spine", [hip, chest]);
  desired.set("Chest", [chest, neck]);
  desired.set("Neck", [neck, head]);
  desired.set("Head", [head, headTip]);
  for (const side of ["Near", "Far"])
    for (const limb of ["arm", "leg"]) {
      const slot = ((side === "Near" ? "right_" : "left_") + limb) as PartSlot,
        l = layer(slot),
        c = b.candidates.find((c) => c.id === b.selection[slot])!,
        a = doc.assetReferences.find((a) => a.id === l.assetId)!,
        axis = axisOf(c, a),
        m = worldMatrix(doc, l),
        start = worldAnchor(
          doc,
          slot,
          limb === "arm" ? "shoulder_joint" : "hip_joint",
        ),
        end = transform(m, axis.end),
        p = (t: number) => ({
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        });
      if (limb === "arm") {
        desired.set(side + " Shoulder", [neck, start]);
        desired.set(side + " Upper Arm", [start, p(0.52)]);
        desired.set(side + " Forearm", [p(0.52), p(0.91)]);
        desired.set(side + " Hand", [p(0.91), end]);
      } else {
        desired.set(side + " Thigh", [start, p(0.5)]);
        desired.set(side + " Shin", [p(0.5), p(0.91)]);
        desired.set(side + " Foot", [p(0.91), { x: end.x + 25, y: end.y }]);
      }
    }
  const scalp = worldAnchor(doc, "head", "scalp_anchor");
  desired.set("Hair Front", [scalp, { x: scalp.x + 22, y: scalp.y + 35 }]);
  desired.set("Hair Back", [scalp, { x: scalp.x - 20, y: scalp.y + 45 }]);
  const cloak = extras.find((a) => a.kind === "cloak" && a.layerId);
  if (cloak) {
    const p = worldAnchor(doc, "torso", "cloak_anchor");
    desired.set("Cape Base", [p, { x: p.x - 10, y: p.y + 110 }]);
    desired.set("Cape Tip", [
      { x: p.x - 10, y: p.y + 110 },
      { x: p.x - 25, y: p.y + 220 },
    ]);
  }
  const hand = desired.get("Near Hand")![0];
  desired.set("Weapon Socket", [hand, { x: hand.x + 2, y: hand.y - 100 }]);
  for (const bone of doc.bones) {
    const old = sideLandmarks[bone.name as keyof typeof sideLandmarks],
      fallback: [Point, Point] = [
        { x: old[0] + hip.x - 400, y: old[1] + hip.y - 440 },
        { x: old[2] + hip.x - 400, y: old[3] + hip.y - 440 },
      ],
      points = desired.get(bone.name) ?? fallback,
      parent = bone.parentId
        ? boneMatrices(doc, "rest").get(bone.parentId)!
        : null,
      local = parent ? transform(inverse(parent), points[0]) : points[0];
    bone.rest = {
      ...local,
      rotation:
        degrees(
          Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x),
        ) - (parent ? degrees(Math.atan2(parent.b, parent.a)) : 0),
    };
    bone.length = Math.max(
      1,
      Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
    );
  }
  const matrices = boneMatrices(doc, "rest");
  for (const target of doc.ikTargets) {
    const m = matrices.get(target.endBoneId)!;
    target.x = m.tx;
    target.y = m.ty;
  }
  for (const mapping of b.layerMappings) {
    const name = mapping.slot.includes("arm")
      ? mapping.slot.startsWith("right")
        ? "Near Upper Arm"
        : "Far Upper Arm"
      : mapping.slot.includes("leg")
        ? mapping.slot.startsWith("right")
          ? "Near Thigh"
          : "Far Thigh"
        : mapping.slot === "torso"
          ? "Chest"
          : mapping.slot === "hair"
            ? "Hair Front"
            : "Head";
    bindLayer(doc, mapping.layerId, map.get(name)!.id);
  }
  for (const extra of extras)
    if (extra.layerId)
      bindLayer(
        doc,
        extra.layerId,
        map.get(extra.kind === "cloak" ? "Cape Base" : "Weapon Socket")!.id,
      );
  doc.rigSettings.mode = "rest";
  return parseDocument(doc);
}
export async function meshAssembly(
  doc: ProjectDocument,
  signal: AbortSignal,
  progress: (n: number, label: string) => void,
) {
  if (!doc.bones.length) throw Error("Cần tạo rig trước");
  if (doc.meshes.length || doc.characterParts.length)
    throw Error("Mesh/parts đã tồn tại; không tự ghi đè.");
  const b = doc.characterBuild!,
    bones = new Map(doc.bones.map((b) => [b.name, b]));
  for (let i = 0; i < b.layerMappings.length; i++) {
    if (signal.aborted) throw new DOMException("Đã hủy", "AbortError");
    const m = b.layerMappings[i],
      candidate = b.candidates.find((c) => c.id === m.candidateId)!,
      limb = m.slot.includes("arm") || m.slot.includes("leg"),
      soft =
        candidate.material === "soft" &&
        m.slot !== "head" &&
        m.slot !== "torso";
    if (soft) {
      const mesh = await generateMesh(doc, m.layerId);
      putMesh(doc, mesh);
      const names = limb
          ? (m.slot.startsWith("right") ? "Near" : "Far") +
            (m.slot.includes("arm") ? " Upper Arm" : " Thigh")
          : m.slot === "hair"
            ? "Hair Front"
            : "Chest",
        upper = bones.get(names)!;
      autoWeights(
        doc,
        mesh,
        limb
          ? [
              upper.id,
              ...doc.bones
                .filter((b) => b.parentId === upper.id)
                .map((b) => b.id),
            ]
          : [upper.id],
      );
    }
    const part = await registerPart(
      doc,
      m.layerId,
      m.slot,
      m.slot.startsWith("left")
        ? "far"
        : m.slot.startsWith("right")
          ? "near"
          : "center",
      limb && soft ? "continuous" : "body",
    );
    if (limb) {
      const side = m.slot.startsWith("right") ? "Near" : "Far",
        arm = m.slot.includes("arm"),
        upper = bones.get(side + (arm ? " Upper Arm" : " Thigh"))!,
        lower = bones.get(side + (arm ? " Forearm" : " Shin"))!,
        joint = {
          id: crypto.randomUUID(),
          name: side + (arm ? " Elbow" : " Knee"),
          kind: arm ? ("elbow" as const) : ("knee" as const),
          upperBoneId: upper.id,
          lowerBoneId: lower.id,
          layerIds: [m.layerId],
          mode: soft
            ? ("continuous_mesh" as const)
            : ("rigid_segment" as const),
          radius: Math.min(
            24,
            Math.max(
              5,
              Math.min(
                doc.assetReferences.find((a) => a.id === part.sourceAssetId)!
                  .width * doc.layers.find((l) => l.id === m.layerId)!.scaleX,
                30,
              ) * 0.42,
            ),
          ),
          overlapSize: 6,
          underlapSize: 10,
          completion: "procedural_neighbor_fill_v1" as const,
        };
      part.jointId = joint.id;
      doc.characterJoints.push(joint);
      if (soft) {
        smoothJointWeights(doc, joint);
        try {
          await refreshBuilderSegments(doc, joint);
          await createJointCompletion(doc, joint);
        } catch (error) {
          b.warnings.push(joint.name + ": " + String(error));
        }
      } else
        b.warnings.push(
          joint.name +
            ": rigid một mảnh; không giả vờ sprite tự gập được hai đoạn.",
        );
    }
    progress(
      (i + 1) / b.layerMappings.length,
      "Tạo mesh/weights " + slotTitles[m.slot],
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  for (const extra of b.optionalAttachments ?? [])
    if (extra.kind === "cloak" && extra.layerId) {
      const mesh = await generateMesh(doc, extra.layerId);
      putMesh(doc, mesh);
      autoWeights(
        doc,
        mesh,
        doc.bones.filter((b) => b.name.startsWith("Cape ")).map((b) => b.id),
      );
      await registerPart(doc, extra.layerId, "cloak", "far", "body");
    }
  // Shoulder/hip covers use neighboring source pixels, not AI anatomical reconstruction.
  for (const side of ["Near", "Far"])
    for (const arm of [true, false]) {
      const slot = ((side === "Near" ? "right_" : "left_") +
          (arm ? "arm" : "leg")) as PartSlot,
        m = b.layerMappings.find((m) => m.slot === slot)!,
        layer = doc.layers.find((l) => l.id === m.layerId)!,
        part = doc.characterParts.find((p) => p.layerId === m.layerId)!,
        lower = bones.get(side + (arm ? " Upper Arm" : " Thigh"))!,
        upper = doc.bones.find((b) => b.id === lower.parentId)!,
        position = boneMatrices(doc, "rest").get(lower.id)!,
        id = crypto.randomUUID(),
        joint = {
          id,
          name: side + (arm ? " Shoulder" : " Hip"),
          kind: arm ? ("shoulder" as const) : ("hip" as const),
          upperBoneId: upper.id,
          lowerBoneId: lower.id,
          layerIds: [layer.id],
          mode: doc.meshes.some((mesh) => mesh.layerId === layer.id)
            ? ("continuous_mesh" as const)
            : ("rigid_segment" as const),
          radius: 12,
          overlapSize: 6,
          underlapSize: 10,
          completion: "procedural_neighbor_fill_v1" as const,
        };
      doc.characterJoints.push(joint);
      try {
        const assetId = crypto.randomUUID(),
          layerId = crypto.randomUUID(),
          center = transform(inverse(worldMatrix(doc, layer)), {
            x: position.tx,
            y: position.ty,
          }),
          data = await completionTexture(doc, layer.assetId, center, 20);
        doc.assetReferences.push({
          id: assetId,
          name: joint.name + " cover · procedural",
          kind: "derived",
          provenance: "procedural",
          dependencies: [layer.assetId],
          width: 128,
          height: 128,
          data,
        });
        const cover: Layer = {
          id: layerId,
          assetId,
          parentId: null,
          name: joint.name + " underlap",
          visible: true,
          locked: false,
          opacity: 1,
          x: position.tx,
          y: position.ty,
          pivotX: 64,
          pivotY: 64,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        };
        doc.layers.splice(
          doc.layers.findIndex((l) => l.id === layer.id),
          0,
          cover,
        );
        bindLayer(doc, layerId, lower.id);
        joint.layerIds.push(layerId);
        const patch = await registerPart(
          doc,
          layerId,
          "joint_cover",
          part.depth,
          "body",
          id,
        );
        patch.underlapAssetId = assetId;
      } catch (error) {
        b.warnings.push(joint.name + ": " + String(error));
      }
    }
  syncHierarchy(doc);
  doc.characterParts.forEach(
    (p) => (p.renderOrder = doc.layers.findIndex((l) => l.id === p.layerId)),
  );
  return parseDocument(doc);
}
export function validateAssembly(doc: ProjectDocument) {
  const reports = doc.characterJoints.map((j) =>
    validateJoints(
      { ...doc, characterJoints: [j] },
      j.kind === "elbow"
        ? [0, -20, -45, -70, -90, -120]
        : [0, 20, 45, 70, 90, 120],
      [j.kind],
    ),
  );
  const report = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    sourceRevision: doc.metadata.revision,
    testedAngles: [0, 20, 45, 70, 90, 120, -20, -45, -70, -90, -120],
    samples: reports.reduce((n, r) => n + r.samples, 0),
    uncoveredSamples: reports.reduce((n, r) => n + r.uncoveredSamples, 0),
    issues: reports.flatMap((r) => r.issues).slice(0, 2048),
    jointIds: reports.flatMap((r) => r.jointIds),
  };
  doc.jointValidation = report;
  return parseDocument(doc);
}
export function addBuilderAnimations(doc: ProjectDocument) {
  const existing = new Set(doc.animationClips.map((c) => c.id));
  const rest = boneMatrices(doc, "rest"),
    feet = new Map(
      doc.bones
        .filter((b) => b.name.endsWith(" Foot"))
        .map((b) => [b.name, { ...rest.get(b.id)! }]),
    );
  createSideReferenceClips(doc);
  for (const track of doc.keyframeTracks) {
    if (existing.has(track.clipId)) continue;
    const target = doc.ikTargets.find((t) => t.id === track.targetId);
    if (!target) continue;
    const bone = doc.bones.find((b) => b.id === target.endBoneId)!;
    if (!bone.name.endsWith(" Foot")) continue;
    const near = bone.name.startsWith("Near"),
      foot = feet.get(bone.name)!,
      root = doc.bones.find((b) => b.id === target.rootBoneId)!,
      mid = doc.bones.find((b) => b.id === target.midBoneId)!,
      scale = (root.length + mid.length) / 197;
    for (const key of track.keyframes)
      if (typeof key.value === "number") {
        if (track.type === "ik.x")
          key.value = foot.tx + (key.value - (near ? 419 : 360)) * scale;
        if (track.type === "ik.y")
          key.value = foot.ty + (key.value - 630) * scale;
      }
  }
  return parseDocument(doc);
}
export function poseBuilderJoint(
  doc: ProjectDocument,
  id: string,
  rotation: number,
) {
  doc.rigSettings.mode = "pose";
  doc.ikTargets.forEach((t) => (t.enabled = false));
  setBoneRotation(doc.bones.find((b) => b.id === id)!, rotation);
  return doc;
}
