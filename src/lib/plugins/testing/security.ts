import type { Actor, AnySlidePlugin, ParticipantInfo } from "../contract";

import { fakeCtx } from "./ctx";

// Тест-хелпер безпеки (openspec/changes/archive/2026-10-21-add-slide-plugin-system/design.md «Тест-хелпер безпеки»): поки раунд не
// закрито, ні `toPublic`, ні `toPlayer` жодного учасника не містять секретів зі `State`.

export interface SecurityStep<Action = unknown> {
  actor: Actor;
  action: Action;
  /** Зсув часу перед кроком (мс) — щоб перевірити закриття раунду за таймером. */
  advanceMs?: number;
}

/** Фікстура плагіна: `plugins/<id>/security.fixture.ts`, експорт `securityFixture`. */
export interface SecurityFixture<Config = unknown, State = unknown, Action = unknown> {
  config: Config;
  participants: ParticipantInfo[];
  steps: SecurityStep<Action>[];
  /** Значення-секрети стану (задумане число, правильна відповідь). Плагін без секретів повертає `[]`. */
  secretsOf(state: State): unknown[];
  /** Чи закрито раунд: після цього розкриття відповіді дозволене. */
  isRoundClosed(state: State): boolean;
  /** `random()` для детермінованого `ctx`. */
  randoms?: number[];
}

export class SecretLeakError extends Error {
  constructor(
    readonly pluginId: string,
    readonly step: string,
    readonly fn: string,
    readonly path: string,
  ) {
    super(`Плагін "${pluginId}" розкриває секрет у ${fn} (${step}): ${path}`);
    this.name = "SecretLeakError";
  }
}

/**
 * Проганяє `init` і кроки фікстури через `tick` → `validateAction` → `handleAction` з детермінованим `ctx` і після кожного
 * кроку шукає секрети в серіалізованих `toPublic`/`toPlayer`. Кидає `SecretLeakError` з плагіном, кроком, функцією й
 * JSON-шляхом. Секрет-рядок шукається й як підрядок, число — як число чи рядок із ним, об'єкт — за JSON-рівністю.
 */
export function checkPluginSecrets(plugin: AnySlidePlugin, fixture: SecurityFixture): void {
  const ctx = fakeCtx({ participants: fixture.participants, randoms: fixture.randoms });
  const { server } = plugin;
  let state: unknown = server.init(fixture.config, ctx);
  inspect(plugin, fixture, state, "init");

  fixture.steps.forEach((step, index) => {
    if (step.advanceMs) ctx.advance(step.advanceMs);
    state = server.tick?.(state, ctx) ?? state;
    const action = server.validateAction.parse(step.action);
    state = server.handleAction(state, action, step.actor, ctx).state;
    inspect(plugin, fixture, state, `крок ${index + 1}`);
  });
}

function inspect(plugin: AnySlidePlugin, fixture: SecurityFixture, state: unknown, step: string) {
  if (fixture.isRoundClosed(state)) return;
  const secrets = fixture.secretsOf(state).filter((secret) => secret !== undefined && secret !== null && secret !== "");
  if (secrets.length === 0) return;

  const views: [string, unknown][] = [
    ["toPublic", plugin.server.toPublic(state)],
    ...fixture.participants.map(
      ({ participantId }) => [`toPlayer(${participantId})`, plugin.server.toPlayer(state, participantId)] as [string, unknown],
    ),
  ];
  for (const [fn, value] of views) {
    const path = findSecret(JSON.parse(JSON.stringify(value ?? null)), secrets, "$");
    if (path) throw new SecretLeakError(plugin.id, step, fn, path);
  }
}

function findSecret(node: unknown, secrets: unknown[], path: string): string | null {
  if (secrets.some((secret) => matches(node, secret))) return path;
  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) {
      const found = findSecret(item, secrets, `${path}[${index}]`);
      if (found) return found;
    }
  } else if (node && typeof node === "object") {
    for (const [key, item] of Object.entries(node)) {
      const found = findSecret(item, secrets, `${path}.${key}`);
      if (found) return found;
    }
  }
  return null;
}

function matches(node: unknown, secret: unknown): boolean {
  if (typeof secret === "string") return typeof node === "string" && node.includes(secret);
  if (typeof secret === "number") return node === secret || node === String(secret);
  if (typeof secret === "object") return node !== null && typeof node === "object" && JSON.stringify(node) === JSON.stringify(secret);
  return node === secret;
}
