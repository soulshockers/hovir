import { describe, expect, it } from "vitest";

import { detectImageType } from "@/lib/media/sniff";
import { isOwnMediaUrl, mediaPublicPrefix } from "@/lib/media/urls";

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === "string" ? Array.from(part, (c) => c.charCodeAt(0)) : part)));

describe("тип зображення за сигнатурою", () => {
  it("PNG, JPEG, GIF, WebP", () => {
    expect(detectImageType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(detectImageType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectImageType(bytes("GIF89a", [1, 0]))).toBe("image/gif");
    expect(detectImageType(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe("image/webp");
  });

  it("SVG, HTML з розширенням .png і порожній файл відхиляються", () => {
    expect(detectImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(detectImageType(bytes("<!doctype html><script>alert(1)</script>"))).toBeNull();
    expect(detectImageType(bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe("URL медіа презентації", () => {
  const SUPABASE = "https://abcd.supabase.co";
  const ID = "11111111-1111-4111-8111-111111111111";
  const own = `${mediaPublicPrefix(SUPABASE, ID)}0b7c1e0e-3c1a-4d55-9a57-2f6b1d1a2e3f.png`;

  it("приймає лише файли цієї презентації в bucket інстансу", () => {
    expect(isOwnMediaUrl(own, SUPABASE, ID)).toBe(true);
    expect(isOwnMediaUrl(own, `${SUPABASE}/`, ID)).toBe(true);
    expect(isOwnMediaUrl(own.replace(ID, "22222222-2222-4222-8222-222222222222"), SUPABASE, ID)).toBe(false);
    expect(isOwnMediaUrl(own.replace("abcd", "evil"), SUPABASE, ID)).toBe(false);
    expect(isOwnMediaUrl("https://evil.example/x.png", SUPABASE, ID)).toBe(false);
    expect(isOwnMediaUrl(`${mediaPublicPrefix(SUPABASE, ID)}../other/x.png`, SUPABASE, ID)).toBe(false);
    expect(isOwnMediaUrl(`${own}?x=1`, SUPABASE, ID)).toBe(false);
    expect(isOwnMediaUrl(42, SUPABASE, ID)).toBe(false);
  });
});
