import { afterEach, describe, expect, it, vi } from "vitest";
import { imageDimensionsWithinLimit, isScannableImage, parseTesseractTsv, readScamImageTexts } from "../image-scam-ocr";

const image = {
  url: "https://cdn.discordapp.com/attachments/123/456/example.png",
  size: 24,
  contentType: "image/png",
  width: 100,
  height: 100,
};
const pngSignature = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 100, 0, 0, 0, 100,
]);

afterEach(() => vi.restoreAllMocks());

describe("scam image OCR", () => {
  it("accepts small Discord images and rejects untrusted hosts, non-images and huge uploads", () => {
    expect(isScannableImage(image)).toBe(true);
    expect(isScannableImage({ ...image, url: "https://cdn.discordapp.com.evil.test/x.png" })).toBe(false);
    expect(isScannableImage({ ...image, url: "http://cdn.discordapp.com/x.png" })).toBe(false);
    expect(isScannableImage({ ...image, contentType: "application/pdf" })).toBe(false);
    expect(isScannableImage({ ...image, size: 7 * 1024 * 1024 })).toBe(false);
    expect(isScannableImage({ ...image, width: 10_000, height: 10_000 })).toBe(false);
  });

  it("keeps readable OCR words and drops low-confidence noise", () => {
    const row = (word: string, confidence: number) =>
      `5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t${confidence}\t${word}`;
    const header = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
    expect(parseTesseractTsv([header, row("MrBeast", 65), row("BONUSES", 90), row("Withdrawial", 25), row("Success", 85)].join("\n")))
      .toBe("MrBeast BONUSES Withdrawial Success");
    expect(parseTesseractTsv([header, row("Bonuses", 18), row("withdraw", 20), row("success", 25), row("maybe", 18)].join("\n")))
      .toBe("");
  });

  it("checks actual image dimensions, not only Discord's claimed dimensions", () => {
    expect(imageDimensionsWithinLimit(Buffer.from(pngSignature))).toBe(true);
    const disguisedHugeImage = Buffer.from(pngSignature);
    disguisedHugeImage.writeUInt32BE(20_000, 16);
    expect(imageDimensionsWithinLimit(disguisedHugeImage)).toBe(false);
    expect(imageDimensionsWithinLimit(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(false);
    expect(imageDimensionsWithinLimit(Buffer.from([71, 73, 70, 56, 57, 97, 100, 0, 100, 0]))).toBe(true);
    expect(imageDimensionsWithinLimit(Buffer.from([255, 216, 255, 192, 0, 11, 8, 0, 100, 0, 100, 3, 1, 17, 0]))).toBe(true);
    const webp = Buffer.alloc(30);
    webp.write("RIFF", 0);
    webp.write("WEBP", 8);
    webp.write("VP8X", 12);
    webp.writeUInt32LE(10, 16);
    webp.writeUIntLE(99, 24, 3);
    webp.writeUIntLE(99, 27, 3);
    expect(imageDimensionsWithinLimit(webp)).toBe(true);
  });

  it("downloads only selected images, passes real image bytes to OCR and checks file signatures", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => new Response(
      String(url).endsWith("bad.png") ? new Uint8Array([1, 2, 3, 4]) : pngSignature,
      { status: 200 },
    ));
    const recognize = vi.fn(async (_bytes: Buffer) => "BONUSES Withdrawal Success! MrBeast");
    const texts = await readScamImageTexts([
      { ...image, url: "https://elsewhere.example/x.png" },
      { ...image, url: "https://cdn.discordapp.com/attachments/123/456/bad.png" },
      image,
      { ...image, url: "https://cdn.discordapp.com/attachments/123/456/third.png" },
    ], recognize);
    expect(texts).toEqual(["BONUSES Withdrawal Success! MrBeast"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(recognize).toHaveBeenCalledTimes(1);
    expect(recognize.mock.calls[0][0].subarray(0, 8)).toEqual(Buffer.from(pngSignature.subarray(0, 8)));
  });

  it("never runs OCR for an oversized server response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(pngSignature, {
      status: 200,
      headers: { "content-length": String(7 * 1024 * 1024) },
    }));
    const recognize = vi.fn(async () => "claim your bonus");
    expect(await readScamImageTexts([image], recognize)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recognize).not.toHaveBeenCalled();
  });

  it("queues a third image instead of silently skipping it while two scans are running", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(pngSignature));
    const releases: Array<() => void> = [];
    const recognize = vi.fn(async () => new Promise<string>((resolve) => {
      releases.push(() => resolve("BONUSES Withdrawial Success MrBeast Activate"));
    }));
    const first = readScamImageTexts([image], recognize);
    const second = readScamImageTexts([image], recognize);
    const third = readScamImageTexts([image], recognize);
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    releases[0]!();
    await vi.waitFor(() => expect(releases).toHaveLength(3));
    releases[1]!();
    releases[2]!();
    expect(await Promise.all([first, second, third])).toEqual([
      ["BONUSES Withdrawial Success MrBeast Activate"],
      ["BONUSES Withdrawial Success MrBeast Activate"],
      ["BONUSES Withdrawial Success MrBeast Activate"],
    ]);
  });
});