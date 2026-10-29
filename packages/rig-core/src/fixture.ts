import { fixture, uid } from "../../document-core/src/fixture";
import type { ProjectDocument, Bone } from "../../document-core/src";
export function rigFixture(): ProjectDocument {
  const d = fixture();
  d.skeletons = [
    {
      id: uid(100),
      name: "Test rig",
      provenance: "user-created",
      template: null,
    },
  ];
  const bone = (n: number, parentId: string | null, x: number): Bone => ({
    id: uid(n),
    skeletonId: uid(100),
    parentId,
    name: "Bone " + n,
    rest: { x, y: 0, rotation: 0 },
    pose: { x: 0, y: 0, rotation: 0 },
    length: 100,
    constraints: { minRotation: -180, maxRotation: 180 },
  });
  d.bones = [
    bone(101, null, 0),
    bone(102, uid(101), 100),
    bone(103, uid(102), 100),
  ];
  d.ikTargets = [
    {
      id: uid(110),
      rootBoneId: uid(101),
      midBoneId: uid(102),
      endBoneId: uid(103),
      x: 200,
      y: 0,
      bend: 1,
      enabled: false,
    },
  ];
  return d;
}
