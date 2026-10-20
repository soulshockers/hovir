import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AudienceSlot } from "@/lib/plugins/AudienceSlot";

import { counterPlugin } from "./plugin-fixtures";

const render = (plugin: typeof counterPlugin) =>
  renderToString(
    createElement(AudienceSlot, {
      plugin,
      config: plugin.defaultConfig,
      state: { count: 3 },
      me: {},
      dispatch: async () => null,
    }),
  );

describe("AudienceSlot", () => {
  it("неінтерактивний слайд: слухач бачить «Дивіться на екран»", () => {
    const html = render({ ...counterPlugin, interactive: false });
    expect(html).toContain("Дивіться на екран");
    expect(html).not.toContain("counter-audience");
  });

  it("інтерактивний слайд: рендериться Audience плагіна з публічним станом", () => {
    const html = render(counterPlugin);
    expect(html).toContain('data-testid="counter-audience"');
    expect(html).toContain("Лічильник: 3");
    expect(html).not.toContain("Дивіться на екран");
  });
});
