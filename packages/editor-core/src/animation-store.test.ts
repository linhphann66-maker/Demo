import { beforeEach, describe, it, expect, vi } from "vitest";
import { rigFixture } from "../../rig-core/src/fixture";
import { uid } from "../../document-core/src/fixture";
import {
  createClip,
  evaluateClip,
  setKeyframe,
} from "../../animation-core/src";
import { useEditor } from "./store";
import { useAnimation } from "./animation-state";
import {
  selectAnimation,
  seekAnimation,
  tickAnimation,
  installPlaybackLoop,
  restartAnimation,
} from "./animation-playback";
import { getPreviewDocument } from "./animation-preview";
beforeEach(() => {
  const d = rigFixture();
  createClip(d, "Test", 2);
  useEditor.getState().open(d);
  selectAnimation(d.animationClips[0].id);
});
it("changing facing or actor position during playback does not pause or bake the animation", () => {
  useAnimation.setState({ playing: true, time: 0.4, elapsed: 0.4 });
  const before = useEditor.getState().document!;
  useEditor.getState().command("Face left", (d) => {
    d.characterSettings.facing = "left";
    d.characterSettings.worldPosition.x = 30;
  });
  expect(useAnimation.getState().playing).toBe(true);
  expect(useAnimation.getState().time).toBe(0.4);
  expect(useEditor.getState().document!.keyframeTracks).toEqual(
    before.keyframeTracks,
  );
});
describe("animation command and preview integration", () => {
  it("duplicates clips through the actual Immer command history", () => {
    const s = useEditor.getState();
    s.command("Add key", (d) =>
      setKeyframe(
        d,
        d.animationClips[0].id,
        uid(101),
        "bone.rotation",
        0.5,
        20,
      ),
    );
    const id = useEditor.getState().document!.animationClips[0].id;
    s.duplicateAnimation(id);
    expect(useEditor.getState().error).toBeNull();
    expect(useEditor.getState().document!.animationClips).toHaveLength(2);
    expect(
      useEditor.getState().document!.keyframeTracks[1].keyframes[0].value,
    ).toBe(20);
    s.undo();
    expect(useEditor.getState().document!.animationClips).toHaveLength(1);
    s.redo();
    expect(useEditor.getState().document!.animationClips).toHaveLength(2);
  });

  it("records Auto Key as undoable tracks without changing source rest/pose", () => {
    const s = useEditor.getState();
    useAnimation.setState({ autoKey: true });
    seekAnimation(0.5);
    s.updateBone(uid(101), { pose: { x: 0, y: 0, rotation: 30 } });
    let d = useEditor.getState().document!;
    expect(d.bones[0].pose.rotation).toBe(0);
    expect(d.keyframeTracks[0].keyframes[0]).toMatchObject({
      time: 0.5,
      value: 30,
    });
    s.undo();
    expect(useEditor.getState().document!.keyframeTracks).toHaveLength(0);
    s.redo();
    d = useEditor.getState().document!;
    expect(
      evaluateClip(d, d.animationClips[0].id, 0.5).bones[0].pose.rotation,
    ).toBe(30);
  });
  it("keeps non-Auto Key pose temporary until explicit recording", () => {
    const s = useEditor.getState(),
      before = s.document!;
    s.updateBone(uid(101), { pose: { x: 0, y: 0, rotation: 20 } });
    expect(useEditor.getState().document).toBe(before);
    expect(getPreviewDocument(before).bones[0].pose.rotation).toBe(20);
    s.selectBone(uid(101));
    s.recordPose();
    expect(useEditor.getState().document!.keyframeTracks).toHaveLength(5);
    expect(useAnimation.getState().override).toBeNull();
  });
  it("seeking clears temporary poses and never dispatches events", () => {
    const s = useEditor.getState();
    s.updateBone(uid(101), { pose: { x: 10, y: 0, rotation: 0 } });
    seekAnimation(0.5);
    expect(getPreviewDocument(s.document!).bones[0].pose.x).toBe(0);
    expect(useAnimation.getState().eventLog).toHaveLength(0);
  });
  it("records IK target keys rather than baking solver bone rotations", () => {
    useAnimation.setState({ autoKey: true });
    useEditor.getState().solveIK(uid(110), 120, 80);
    const d = useEditor.getState().document!;
    expect(d.keyframeTracks.map((t) => t.type).sort()).toEqual([
      "ik.blend",
      "ik.x",
      "ik.y",
    ]);
    expect(d.bones.every((b) => b.pose.rotation === 0)).toBe(true);
  });
  it("advances elapsed time at selected speed and stops once clips", () => {
    const doc = useEditor.getState().document!;
    useEditor.getState().command("once", (d) => {
      d.animationClips[0].loopMode = "once";
    });
    useAnimation.setState({ playing: true, speed: 2 });
    tickAnimation(0.25);
    expect(useAnimation.getState().time).toBe(0.5);
    tickAnimation(2);
    expect(useAnimation.getState().playing).toBe(false);
    expect(useAnimation.getState().time).toBe(doc.animationClips[0].duration);
  });
  it("owns one RAF and cleans it after repeated play/pause and unmount", () => {
    let next = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      callbacks.set(++next, cb);
      return next;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
    vi.stubGlobal("document", {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const dispose = installPlaybackLoop();
    for (let i = 0; i < 20; i++) {
      restartAnimation(true);
      expect(callbacks.size).toBe(1);
      useAnimation.getState().pause();
      expect(callbacks.size).toBe(0);
    }
    dispose();
    expect(callbacks.size).toBe(0);
    vi.unstubAllGlobals();
  });
});
