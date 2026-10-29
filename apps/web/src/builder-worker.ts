import { components } from "../../../packages/character-builder/src/detect";
self.onmessage = (
  event: MessageEvent<{
    width: number;
    height: number;
    buffer: ArrayBuffer;
    mode: "sheet" | "layers";
    tolerance: number;
  }>,
) => {
  try {
    const p = event.data;
    const result = components(
      {
        width: p.width,
        height: p.height,
        data: new Uint8ClampedArray(p.buffer),
      },
      p.mode,
      p.tolerance,
      (n) => self.postMessage({ progress: n }),
    );
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
