import { describe, expect, it } from "vitest";

import { fakeCtx } from "@/lib/plugins/testing";

import { editorSamplePlugin } from "../fixtures/plugins/editor-sample";
import { plugins as testRegistry } from "../fixtures/plugins";

describe("editorSamplePlugin", () => {
  it("defaultConfig проходить configSchema", () => {
    expect(editorSamplePlugin.configSchema.safeParse(editorSamplePlugin.defaultConfig).success).toBe(true);
  });

  it("публічний стан для превʼю рахується з конфігу", () => {
    const { server } = editorSamplePlugin;
    const state = server.init({ ...editorSamplePlugin.defaultConfig, options: ["a", "b", "c"] }, fakeCtx());
    expect(server.toPublic(state)).toEqual({ optionCount: 3 });
  });

  it("тестовий реєстр містить фікстуру", () => {
    expect(testRegistry.map((plugin) => plugin.id)).toContain("editor-sample");
  });
});
