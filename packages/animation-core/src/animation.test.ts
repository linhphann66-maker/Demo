import { describe, it, expect } from "vitest";
import { rigFixture } from "../../rig-core/src/fixture";
import { fixture, uid } from "../../document-core/src/fixture";
import { parseDocument } from "../../document-core/src";
import { packageProject, unpackProject } from "../../exporters/src";
import {
  createClip,
  setKeyframe,
  deleteKeys,
  moveKeys,
  copyKeys,
  pasteKeys,
  duplicateClip,
  resizeClip,
  addEvent,
  pruneAnimationReferences,
} from "./commands";
import {
  evaluateTrack,
  evaluateClip,
  cubicEase,
  mixPoses,
  PoseCache,
} from "./evaluation";
import { crossedEvents, playbackTime, PlaybackClock } from "./events";
import { boneMatrices } from "../../rig-core/src";
const setup = () => {
  const d = rigFixture(),
    c = createClip(d, "Test", 2);
  return { d, c };
};
describe("editable animation keys and validation", () => {
  it("creates/upserts stable key IDs and deletes keys", () => {
    const { d, c } = setup();
    const k = setKeyframe(d, c.id, uid(101), "bone.x", 0, 0);
    const same = setKeyframe(d, c.id, uid(101), "bone.x", 0, 5);
    expect(same.id).toBe(k.id);
    expect(d.keyframeTracks[0].keyframes).toHaveLength(1);
    deleteKeys(d, [k.id]);
    expect(d.keyframeTracks[0].keyframes).toHaveLength(0);
  });
  it("moves, duplicates and copy/pastes keyframes with relative time", () => {
    const { d, c } = setup();
    const a = setKeyframe(d, c.id, uid(101), "bone.x", 0, 0),
      b = setKeyframe(d, c.id, uid(101), "bone.x", 0.5, 10);
    moveKeys(d, [a.id, b.id], 0.25);
    expect(d.keyframeTracks[0].keyframes.map((k) => k.time)).toEqual([
      0.25, 0.75,
    ]);
    const copied = copyKeys(d, [a.id, b.id]);
    const ids = pasteKeys(d, c.id, 1, copied);
    expect(ids).toHaveLength(2);
    expect(d.keyframeTracks[0].keyframes.map((k) => k.time)).toEqual([
      0.25, 0.75, 1, 1.5,
    ]);
    expect(() => moveKeys(d, [a.id], 0.5)).toThrow(/cùng/);
  });
  it("duplicates entire clips with fresh stable IDs", () => {
    const { d, c } = setup();
    setKeyframe(d, c.id, uid(101), "bone.x", 0, 0);
    addEvent(d, c.id, 0.5, "marker");
    const copy = duplicateClip(d, c.id);
    expect(copy.id).not.toBe(c.id);
    expect(copy.trackIds[0]).not.toBe(c.trackIds[0]);
    expect(() => parseDocument(d)).not.toThrow();
  });
  it("retimes keys, range and events when duration changes", () => {
    const { d, c } = setup();
    setKeyframe(d, c.id, uid(101), "bone.x", 1, 10);
    const e = addEvent(d, c.id, 1, "middle");
    resizeClip(d, c.id, 4);
    expect(d.keyframeTracks[0].keyframes[0].time).toBe(2);
    expect(e.time).toBe(2);
    expect(c.range.end).toBe(4);
  });
  it("rejects wrong values, references, timestamps and discrete easing", () => {
    for (const patch of ["value", "target", "time", "step"]) {
      const { d, c } = setup();
      const k = setKeyframe(d, c.id, uid(101), "bone.x", 0, 0);
      if (patch === "value") k.value = true;
      if (patch === "target") d.keyframeTracks[0].targetId = uid(999);
      if (patch === "time") k.time = 3;
      if (patch === "step") {
        d.keyframeTracks[0].type = "layer.visible";
        d.keyframeTracks[0].targetId = uid(3);
        k.value = true;
      }
      expect(() => parseDocument(d)).toThrow();
    }
  });
  it("removes only orphaned animation references on structural edits", () => {
    const { d, c } = setup();
    setKeyframe(d, c.id, uid(101), "bone.x", 0, 0);
    setKeyframe(d, c.id, uid(102), "bone.x", 0, 0);
    d.bones = d.bones.filter((b) => b.id !== uid(103));
    d.ikTargets = [];
    pruneAnimationReferences(d);
    expect(d.keyframeTracks).toHaveLength(2);
    expect(() => parseDocument(d)).not.toThrow();
  });
  it("serializes clips, keys, handles, events and legacy migrations", () => {
    const { d, c } = setup();
    const k = setKeyframe(d, c.id, uid(101), "bone.x", 0, 0, "bezier");
    k.handles = { x1: 0.2, y1: 0, x2: 0.8, y2: 1 };
    addEvent(d, c.id, 0.5, "step");
    expect(unpackProject(packageProject(d))).toEqual(d);
    for (const version of [0, 1, 2, 3]) {
      const old = { ...fixture(), schemaVersion: version };
      expect(parseDocument(old).schemaVersion).toBe(4);
    }
  });
});
describe("deterministic evaluation", () => {
  it("interpolates numeric properties and holds stepped values", () => {
    const { d, c } = setup();
    setKeyframe(d, c.id, uid(101), "bone.x", 0, 0);
    setKeyframe(d, c.id, uid(101), "bone.x", 2, 10);
    expect(evaluateTrack(d.keyframeTracks[0], 1)).toBe(5);
    d.keyframeTracks[0].keyframes[0].interpolation = "stepped";
    expect(evaluateTrack(d.keyframeTracks[0], 1)).toBe(0);
  });
  it("takes the shortest angular path unless direct multi-turn is selected", () => {
    const { d, c } = setup();
    setKeyframe(d, c.id, uid(101), "bone.rotation", 0, 170);
    setKeyframe(d, c.id, uid(101), "bone.rotation", 2, -170);
    expect(evaluateTrack(d.keyframeTracks[0], 1)).toBe(180);
    d.keyframeTracks[0].rotationMode = "direct";
    d.keyframeTracks[0].keyframes[1].value = 890;
    expect(evaluateTrack(d.keyframeTracks[0], 1)).toBe(530);
  });
  it("evaluates cubic easing by solving its time curve", () => {
    expect(cubicEase(0.5, { x1: 0.42, y1: 0, x2: 0.58, y2: 1 })).toBeCloseTo(
      0.5,
    );
    expect(cubicEase(0.25, { x1: 0.42, y1: 0, x2: 0.58, y2: 1 })).toBeLessThan(
      0.25,
    );
  });
  it("does not accumulate or mutate the base state while scrubbing", () => {
    const { d, c } = setup();
    setKeyframe(d, c.id, uid(101), "bone.x", 0, 0);
    setKeyframe(d, c.id, uid(101), "bone.x", 2, 20);
    const before = JSON.stringify(d),
      a = evaluateClip(d, c.id, 0.7);
    evaluateClip(d, c.id, 1.6);
    const b = evaluateClip(d, c.id, 0.7);
    expect(a).toEqual(b);
    expect(JSON.stringify(d)).toBe(before);
    expect(a.bones[0].pose.x).toBeCloseTo(7);
  });
  it("propagates animated scale through the skeleton", () => {
    const { d, c } = setup();
    setKeyframe(d, c.id, uid(101), "bone.scaleX", 0, 1);
    setKeyframe(d, c.id, uid(101), "bone.scaleX", 2, 2);
    const pose = evaluateClip(d, c.id, 1, false);
    expect(boneMatrices(pose).get(uid(103))!.tx).toBeCloseTo(300);
  });
  it("supports opacity, visibility and attachment switching", () => {
    const { d, c } = setup();
    setKeyframe(d, c.id, uid(3), "layer.opacity", 0, 1);
    setKeyframe(d, c.id, uid(3), "layer.opacity", 2, 0);
    setKeyframe(d, c.id, uid(3), "layer.visible", 0, true);
    setKeyframe(d, c.id, uid(3), "layer.visible", 1, false);
    setKeyframe(d, c.id, uid(3), "attachment.bone", 0, null);
    setKeyframe(d, c.id, uid(3), "attachment.bone", 1, uid(102));
    const pose = evaluateClip(d, c.id, 1, false);
    expect(pose.layers[0].opacity).toBe(0.5);
    expect(pose.layers[0].visible).toBe(false);
    expect(pose.attachments[0].boneId).toBe(uid(102));
  });
  it("evaluates animated IK target and IK/FK blend", () => {
    const { d, c } = setup();
    setKeyframe(d, c.id, uid(110), "ik.x", 0, 120);
    setKeyframe(d, c.id, uid(110), "ik.y", 0, 80);
    setKeyframe(d, c.id, uid(110), "ik.blend", 0, 1);
    let pose = evaluateClip(d, c.id, 0);
    let end = boneMatrices(pose).get(uid(103))!;
    expect(end.tx).toBeCloseTo(120);
    expect(end.ty).toBeCloseTo(80);
    d.keyframeTracks.find((t) => t.type === "ik.blend")!.keyframes[0].value = 0;
    pose = evaluateClip(d, c.id, 0);
    end = boneMatrices(pose).get(uid(103))!;
    expect(end.tx).toBeCloseTo(200);
    expect(end.ty).toBeCloseTo(0);
  });
  it("bounds pose caches without retaining unlimited evaluations", () => {
    const { d, c } = setup(),
      cache = new PoseCache();
    for (let i = 0; i < 100; i++) cache.get(d, c.id, i / 100);
    expect(cache.size).toBeLessThanOrEqual(32);
    cache.clear();
    expect(cache.size).toBe(0);
  });
  it("crossfades numeric values and switches discrete values at the midpoint", () => {
    const { d, c } = setup(),
      other = createClip(d, "Other", 2);
    setKeyframe(d, c.id, uid(101), "bone.x", 0, 0);
    setKeyframe(d, other.id, uid(101), "bone.x", 0, 10);
    setKeyframe(d, other.id, uid(3), "layer.visible", 0, false);
    const a = evaluateClip(d, c.id, 0),
      b = evaluateClip(d, other.id, 0);
    expect(mixPoses(d, a, b, 0.25).bones[0].pose.x).toBe(2.5);
    expect(mixPoses(d, a, b, 0.25).layers[0].visible).toBe(true);
    expect(mixPoses(d, a, b, 0.5).layers[0].visible).toBe(false);
    expect(mixPoses(d, a, b, 1).layers.map((l) => l.id)).toEqual(
      d.layers.map((l) => l.id),
    );
  });
});
describe("clock, looping and event intervals", () => {
  it("uses measured timestamps and resets after pause", () => {
    const clock = new PlaybackClock();
    expect(clock.tick(100).delta).toBe(0);
    expect(clock.tick(350, 2).delta).toBe(0.5);
    clock.pause();
    expect(clock.tick(10000).delta).toBe(0);
  });
  it("honors playback ranges and loop/once boundaries", () => {
    const { c } = setup();
    c.range = { start: 0.5, end: 1.5 };
    expect(playbackTime(c, 1.25)).toBeCloseTo(0.75);
    c.loopMode = "once";
    expect(playbackTime(c, 10)).toBe(1.5);
  });
  it("dispatches skipped frames, loop end/start and restarts without duplicates", () => {
    const { d, c } = setup();
    const start = addEvent(d, c.id, 0, "start"),
      mid = addEvent(d, c.id, 1, "middle"),
      end = addEvent(d, c.id, 2, "end");
    expect(crossedEvents(d, c, 0, 0, true).map((x) => x.event.id)).toEqual([
      start.id,
    ]);
    expect(crossedEvents(d, c, 0, 2).map((x) => x.event.id)).toEqual([
      mid.id,
      end.id,
      start.id,
    ]);
    expect(crossedEvents(d, c, 2, 2.1)).toHaveLength(0);
    expect(
      crossedEvents(d, c, 0, 6).filter((x) => x.event.id === mid.id),
    ).toHaveLength(3);
  });
  it("fires non-looping end events only once", () => {
    const { d, c } = setup();
    c.loopMode = "once";
    addEvent(d, c.id, 2, "end");
    expect(crossedEvents(d, c, 1.9, 2.3)).toHaveLength(1);
    expect(crossedEvents(d, c, 2.3, 3)).toHaveLength(0);
  });
});
