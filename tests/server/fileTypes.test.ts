import { describe, expect, it } from "vitest";
import { classifyFile } from "@/lib/shared/fileTypes";

describe("classifyFile", () => {
  it("classifies CAD and 3D print files", () => {
    expect(classifyFile("bracket.stl")).toEqual({
      extension: "stl",
      family: "cad",
      label: "STL Model"
    });
    expect(classifyFile("fixture.3mf")).toEqual({
      extension: "3mf",
      family: "cad",
      label: "3MF Project"
    });
  });

  it("classifies media files", () => {
    expect(classifyFile("render.webm").family).toBe("video");
    expect(classifyFile("scan.tiff").family).toBe("image");
    expect(classifyFile("thumbnail.png").family).toBe("image");
  });

  it("falls back to generic binary files", () => {
    expect(classifyFile("machine.jlb")).toEqual({
      extension: "jlb",
      family: "other",
      label: "JLB File"
    });
  });
});
