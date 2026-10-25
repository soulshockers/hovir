import { z } from "zod";

import { defineSlidePlugin } from "@/lib/plugins";

// Фікстура для перевірки редактора (openspec/changes/archive/2026-10-25-add-presentation-editor/design.md «Тестовий плагін»): схема
// покриває всі віджети генератора форм, а `Presenter` показує значення полів з `data-testid`. У production-реєстр
// не потрапляє: e2e-збірка підключає її через `HOVIR_TEST_PLUGINS=1` (`next.config.ts`).

export const editorSampleSchema = z.object({
  title: z.string().min(1).max(80).meta({ label: "field.title" }),
  body: z.string().max(2000).meta({ label: "field.body", widget: "markdown" }),
  image: z.string().nullable().meta({ label: "field.image", widget: "image" }),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .meta({ label: "field.accent", widget: "color" }),
  size: z.number().int().min(1).max(10).meta({ label: "field.size" }),
  visible: z.boolean().meta({ label: "field.visible" }),
  layout: z.enum(["title", "split", "full"]).meta({ label: "field.layout" }),
  options: z.array(z.string().min(1).max(40)).min(2).max(6).meta({ label: "field.options" }),
  caption: z.string().max(60).nullable().meta({ label: "field.caption" }),
  footer: z
    .object({
      text: z.string().max(40).meta({ label: "field.footerText" }),
      align: z.enum(["left", "right"]).meta({ label: "field.footerAlign" }),
    })
    .meta({ label: "field.footer" }),
});

export type EditorSampleConfig = z.infer<typeof editorSampleSchema>;

interface SampleState {
  optionCount: number;
  openedAt: number;
}

export const editorSamplePlugin = defineSlidePlugin({
  id: "editor-sample",
  version: 1,
  meta: { title: "title", icon: "flask", category: "content" },
  interactive: false,
  scoring: false,
  configSchema: editorSampleSchema,
  defaultConfig: {
    title: "Тестовий слайд",
    body: "",
    image: null,
    accent: "#3366ff",
    size: 3,
    visible: true,
    layout: "title",
    options: ["Так", "Ні"],
    caption: null,
    footer: { text: "", align: "left" },
  } satisfies EditorSampleConfig,
  server: {
    init: (config: EditorSampleConfig, ctx): SampleState => ({ optionCount: config.options.length, openedAt: ctx.now() }),
    handleAction: (state) => ({ state, broadcast: false }),
    validateAction: z.object({ type: z.literal("noop") }),
    toPublic: (state) => ({ optionCount: state.optionCount }),
    toPlayer: () => ({}),
  },
  Presenter: ({ config, state }) => (
    <div data-testid="sample-presenter" style={{ color: config.accent }}>
      <h2 data-testid="sample-title">{config.title}</h2>
      {config.visible && <p data-testid="sample-body">{config.body}</p>}
      {config.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img data-testid="sample-image" src={config.image} alt="" />
      )}
      <p data-testid="sample-size">{config.size}</p>
      <p data-testid="sample-layout">{config.layout}</p>
      <p data-testid="sample-option-count">{state.optionCount}</p>
      {config.caption !== null && <p data-testid="sample-caption">{config.caption}</p>}
      <p data-testid="sample-footer">{config.footer.text}</p>
    </div>
  ),
  Audience: () => null,
  i18n: {
    uk: {
      title: "Тестовий слайд",
      "field.title": "Заголовок",
      "field.body": "Текст",
      "field.image": "Зображення",
      "field.accent": "Акцент",
      "field.size": "Розмір",
      "field.visible": "Показувати текст",
      "field.layout": "Розміщення",
      "field.options": "Варіанти",
      "field.caption": "Підпис",
      "field.footer": "Нижній колонтитул",
      "field.footerText": "Текст колонтитула",
      "field.footerAlign": "Вирівнювання",
    },
    en: { title: "Sample slide" },
  },
});
