import { describe, it, expect } from "vitest";
import { rasterDimensions } from "./raster-header";
import { packageProject, unpackProject } from "./index";
import { fixture } from "../../document-core/src/fixture";
describe("raster preflight", () => {
  it("reads PNG size before decode", () => {
    const raw = atob(fixture().assetReferences[0].data.split(",")[1]);
    expect(rasterDimensions(raw)).toEqual({ width: 1, height: 1 });
  });
  it("rejects huge compressed surfaces before decode", () => {
    const bytes = Uint8Array.from(
      atob(fixture().assetReferences[0].data.split(",")[1]),
      (c) => c.charCodeAt(0),
    );
    new DataView(bytes.buffer).setUint32(16, 50000);
    expect(() => rasterDimensions(String.fromCharCode(...bytes))).toThrow(
      /4096/,
    );
  });
  it("rejects truncated data and unsupported content", () => {
    expect(() => rasterDimensions("\xff\xd8\xff")).toThrow();
    expect(() => rasterDimensions("<svg/>")).toThrow();
  });
  it("rejects encrypted archives even when unencrypted payload is valid", () => {
    const bytes = packageProject(fixture());
    bytes[6] |= 1;
    expect(() => unpackProject(bytes)).toThrow(/mã hóa/);
  });
});
