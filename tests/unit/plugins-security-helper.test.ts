import { describe, expect, it } from "vitest";

import { checkPluginSecrets, SecretLeakError } from "@/lib/plugins/testing";

import { counterPlugin, guessPlugin, guessSecurityFixture, type GuessState } from "./plugin-fixtures";

const withPublic = (toPublic: (state: GuessState) => unknown) => ({
  ...guessPlugin,
  server: { ...guessPlugin.server, toPublic },
});

describe("checkPluginSecrets", () => {
  it("коректний плагін проходить, а розкриття відповіді після закриття раунду — не протікання", () => {
    expect(() => checkPluginSecrets(guessPlugin, guessSecurityFixture)).not.toThrow();
  });

  it("секрет у toPublic під час раунду — помилка з плагіном, кроком, функцією і шляхом", () => {
    const leaky = withPublic((state) => ({ roundStatus: state.roundStatus, debug: { target: state.secret } }));
    expect(() => checkPluginSecrets(leaky, guessSecurityFixture)).toThrow(
      new SecretLeakError("guess-number", "init", "toPublic", "$.debug.target"),
    );
    expect(() => checkPluginSecrets(leaky, guessSecurityFixture)).toThrow(
      'Плагін "guess-number" розкриває секрет у toPublic (init): $.debug.target',
    );
  });

  it("секрет у toPlayer і як підрядок у тексті", () => {
    const hinting = {
      ...guessPlugin,
      server: { ...guessPlugin.server, toPlayer: (state: GuessState) => ({ hint: `Число — ${state.secret}` }) },
    };
    expect(() => checkPluginSecrets(hinting, { ...guessSecurityFixture, secretsOf: (state: GuessState) => [String(state.secret)] })).toThrow(
      /toPlayer\(alice\) \(init\): \$\.hint/,
    );
  });

  it("секрет, що з'являється лише після дії, ловиться на цьому кроці", () => {
    const lateLeak = withPublic((state) => ({ target: state.roundStatus === "running" ? state.secret : null }));
    expect(() => checkPluginSecrets(lateLeak, guessSecurityFixture)).toThrow(/\(крок 1\): \$\.target/);
  });

  it("плагін без секретів проходить з порожнім переліком", () => {
    expect(() =>
      checkPluginSecrets(counterPlugin, {
        config: counterPlugin.defaultConfig,
        participants: [{ participantId: "alice", nickname: "Лис" }],
        steps: [{ actor: { kind: "participant", participantId: "alice" }, action: { type: "inc" } }],
        secretsOf: () => [],
        isRoundClosed: () => false,
      }),
    ).not.toThrow();
  });
});
