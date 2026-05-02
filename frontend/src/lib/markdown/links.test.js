import { describe, expect, it } from "vitest";
import { getStandaloneLinkData } from "./links";

describe("getStandaloneLinkData image parsing", () => {
  it("parses Windows image path with backslashes", () => {
    const line = String.raw`![photo](C:\Users\me\project\media\note-images\1\photo.png)`;
    expect(getStandaloneLinkData(line)).toEqual({
      type: "image",
      alt: "photo",
      url: "/media/note-images/1/photo.png",
    });
  });

  it("parses Windows image path with forward slashes", () => {
    const line = "![photo](C:/Users/me/project/media/note-images/1/photo.png)";
    expect(getStandaloneLinkData(line)).toEqual({
      type: "image",
      alt: "photo",
      url: "/media/note-images/1/photo.png",
    });
  });

  it("parses file URL image path", () => {
    const line = "![photo](file:///C:/Users/me/project/media/note-images/1/photo.png)";
    expect(getStandaloneLinkData(line)).toEqual({
      type: "image",
      alt: "photo",
      url: "/media/note-images/1/photo.png",
    });
  });

  it("returns null for non-standalone image line", () => {
    expect(getStandaloneLinkData("plain text line")).toBeNull();
  });
});
