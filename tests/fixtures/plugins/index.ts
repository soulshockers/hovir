import type { AnySlidePlugin } from "@/lib/plugins";

// Реальний реєстр — відносним шляхом: під `HOVIR_TEST_PLUGINS=1` псевдонім `@plugins/index` веде сюди ж (`next.config.ts`).
import { plugins as realPlugins } from "../../../plugins/index";
import { editorSamplePlugin } from "./editor-sample";

/** Реєстр тестової e2e-збірки: реальні плагіни + фікстура редактора. */
export const plugins: readonly AnySlidePlugin[] = [...realPlugins, editorSamplePlugin];
