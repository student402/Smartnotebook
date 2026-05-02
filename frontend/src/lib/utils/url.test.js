import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./url";

describe("normalizeUrl", () => {
  it("returns media path for Windows absolute path with backslashes", () => {
    const value = String.raw`C:\Users\me\project\media\note-images\1\photo.png`;
    expect(normalizeUrl(value)).toBe("/media/note-images/1/photo.png");
  });

  it("returns media path for Windows absolute path with forward slashes", () => {
    const value = "C:/Users/me/project/media/note-images/1/photo.png";
    expect(normalizeUrl(value)).toBe("/media/note-images/1/photo.png");
  });

  it("returns media path for file URL pointing to media file", () => {
    const value = "file:///C:/Users/me/project/media/note-images/1/photo.png";
    expect(normalizeUrl(value)).toBe("/media/note-images/1/photo.png");
  });

  it("keeps non-media Windows file path unchanged except slash normalization", () => {
    const value = String.raw`C:\Users\me\Desktop\photo.png`;
    expect(normalizeUrl(value)).toBe("C:/Users/me/Desktop/photo.png");
  });

  it("normalizes localhost media URL to relative media path", () => {
    const value = "http://127.0.0.1:8000/media/note-images/1/photo.png";
    expect(normalizeUrl(value)).toBe("/media/note-images/1/photo.png");
  });
});
