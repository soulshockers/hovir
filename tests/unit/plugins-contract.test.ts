import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineSlidePlugin } from "@/lib/plugins";

import { counterPlugin } from "./plugin-fixtures";

// Порушення контракту ловить `tsc` (`pnpm typecheck`): якщо котрийсь `@ts-expect-error` стане зайвим, перевірка типів впаде.

describe("контракт SlidePlugin", () => {
  it("defineSlidePlugin повертає той самий маніфест", () => {
    expect(defineSlidePlugin(counterPlugin)).toBe(counterPlugin);
  });

  it("категорія поза content/poll/game і Audience, що приймає State, — помилки типів", () => {
    defineSlidePlugin({
      ...counterPlugin,
      // @ts-expect-error — категорії 'quiz' немає в контракті
      meta: { title: "title", icon: "x", category: "quiz" },
    });

    type State = { count: number; secret: number };
    defineSlidePlugin<{ step: number }, State, { count: number }, Record<string, never>, { type: "inc" }>({
      ...counterPlugin,
      server: {
        init: () => ({ count: 0, secret: 42 }),
        handleAction: (state) => ({ state }),
        validateAction: z.object({ type: z.literal("inc") }),
        toPublic: (state) => ({ count: state.count }),
        toPlayer: () => ({}),
      },
      // @ts-expect-error — клієнтський компонент отримує PublicState, а не State із секретом
      Audience: ({ state }: { state: State }) => String(state.secret),
    });
    expect(true).toBe(true);
  });
});
