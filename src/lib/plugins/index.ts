// Публічний вхід для авторів плагінів: контракт і `defineSlidePlugin`. Застосунок імпортує рантайм ядра напряму
// (`@/lib/plugins/registry`, `@/lib/plugins/runtime`, …), щоб плагіни не тягнули реєстр циклічно.

export {
  defineSlidePlugin,
  type Actor,
  type ActionResult,
  type AnySlidePlugin,
  type FeedEvent,
  type I18nKey,
  type Locale,
  type ParticipantInfo,
  type PresenterControls,
  type ServerCtx,
  type SlidePlugin,
} from "./contract";
