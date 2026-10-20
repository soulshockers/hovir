import type { Locale, ParticipantInfo, ServerCtx } from "./contract";

/** `ServerCtx` для API routes: серверний час і криптографічна випадковість. */
export function createServerCtx(input: { participants: readonly ParticipantInfo[]; locale: Locale }): ServerCtx {
  return {
    now: () => Date.now(),
    random: () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32,
    participants: input.participants,
    locale: input.locale,
  };
}
