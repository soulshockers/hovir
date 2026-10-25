import type { AnySlidePlugin } from "@/lib/plugins";
import type { PluginRegistry } from "@/lib/plugins/registry";

// Слайди презентації в редакторі (openspec/specs/presentation-editor, design.md «Модель даних»).
// Чиста логіка над портом `SlideRepo`: кожна мутація списку виконується всередині `withPresentation` — на сервері це
// транзакція з блокуванням рядка презентації, тож позиції лишаються послідовними 0..n−1.

export const MAX_SLIDES = 200;
export const MAX_CONFIG_BYTES = 64 * 1024;

export interface SlideRecord {
  id: string;
  presentationId: string;
  position: number;
  pluginId: string;
  pluginVersion: number;
  config: unknown;
  updatedAt: Date;
}

export interface NewSlide {
  pluginId: string;
  pluginVersion: number;
  config: unknown;
}

/** Операції над слайдами однієї (заблокованої) презентації. */
export interface SlideTx {
  /** Слайди за зростанням `position`. */
  list(): Promise<SlideRecord[]>;
  insert(slide: NewSlide & { position: number }): Promise<SlideRecord>;
  remove(id: string): Promise<void>;
  /** `position` кожного слайда = його індекс у `ids`. */
  setOrder(ids: readonly string[]): Promise<void>;
  updateConfig(id: string, config: unknown, pluginVersion: number): Promise<SlideRecord>;
}

export interface SlideRepo {
  list(presentationId: string): Promise<SlideRecord[]>;
  /** Серіалізований доступ до слайдів презентації; наприкінці оновлює `presentations.updated_at`. */
  withPresentation<T>(presentationId: string, fn: (tx: SlideTx) => Promise<T>): Promise<T>;
}

export type SlideErrorCode = "not_found" | "unknown_plugin" | "validation_failed" | "conflict" | "slide_locked";
export type SlideResult<T> = { ok: true; value: T } | { ok: false; code: SlideErrorCode };

const fail = (code: SlideErrorCode): { ok: false; code: SlideErrorCode } => ({ ok: false, code });
const ok = <T>(value: T): SlideResult<T> => ({ ok: true, value });

export interface ListChange {
  slide: SlideRecord;
  /** Новий порядок id усіх слайдів. */
  order: string[];
}

/** Вставляє слайд одразу після `afterId` (або в кінець) і перенумеровує позиції. */
async function insertAfter(tx: SlideTx, slides: SlideRecord[], afterId: string | undefined, row: NewSlide): Promise<ListChange> {
  const index = afterId ? slides.findIndex((slide) => slide.id === afterId) : -1;
  const at = index >= 0 ? index + 1 : slides.length;
  const slide = await tx.insert({ ...row, position: slides.length });
  const order = slides.map((s) => s.id);
  order.splice(at, 0, slide.id);
  await tx.setOrder(order);
  return { slide: { ...slide, position: at }, order };
}

export async function createSlide(
  repo: SlideRepo,
  registry: PluginRegistry,
  presentationId: string,
  input: { pluginId: string; afterSlideId?: string },
): Promise<SlideResult<ListChange>> {
  const plugin = registry.get(input.pluginId);
  if (!plugin) return fail("unknown_plugin");
  return repo.withPresentation(presentationId, async (tx) => {
    const slides = await tx.list();
    if (slides.length >= MAX_SLIDES) return fail("validation_failed");
    return ok(await insertAfter(tx, slides, input.afterSlideId, { pluginId: plugin.id, pluginVersion: plugin.version, config: plugin.defaultConfig }));
  });
}

/** Копія з тим самим типом, версією й конфігом — одразу після оригіналу. */
export async function duplicateSlide(repo: SlideRepo, presentationId: string, slideId: string): Promise<SlideResult<ListChange>> {
  return repo.withPresentation(presentationId, async (tx) => {
    const slides = await tx.list();
    const original = slides.find((slide) => slide.id === slideId);
    if (!original) return fail("not_found");
    if (slides.length >= MAX_SLIDES) return fail("validation_failed");
    const { pluginId, pluginVersion, config } = original;
    return ok(await insertAfter(tx, slides, slideId, { pluginId, pluginVersion, config: structuredClone(config) }));
  });
}

export async function deleteSlide(repo: SlideRepo, presentationId: string, slideId: string): Promise<SlideResult<string[]>> {
  return repo.withPresentation(presentationId, async (tx) => {
    const slides = await tx.list();
    if (!slides.some((slide) => slide.id === slideId)) return fail("not_found");
    await tx.remove(slideId);
    const order = slides.filter((slide) => slide.id !== slideId).map((slide) => slide.id);
    await tx.setOrder(order);
    return ok(order);
  });
}

/** Новий порядок приймається лише як перестановка поточних слайдів; інакше — `conflict` (список застарів). */
export async function reorderSlides(repo: SlideRepo, presentationId: string, ids: readonly string[]): Promise<SlideResult<string[]>> {
  return repo.withPresentation(presentationId, async (tx) => {
    const current = (await tx.list()).map((slide) => slide.id);
    const wanted = new Set(ids);
    if (ids.length !== current.length || wanted.size !== ids.length || current.some((id) => !wanted.has(id))) {
      return fail("conflict");
    }
    await tx.setOrder(ids);
    return ok([...ids]);
  });
}

export const configBytes = (config: unknown) => new TextEncoder().encode(JSON.stringify(config) ?? "").length;

/**
 * Повний конфіг слайда: валідація поточною `configSchema` і запис з поточною версією плагіна. Слайд невідомого типу
 * чи записаний новішою версією плагіна змінювати не можна (`slide_locked`). `checkConfig` — перевірки ядра поверх
 * схеми (наприклад, URL зображень лише з bucket цієї презентації).
 */
export async function saveSlideConfig(
  repo: SlideRepo,
  registry: PluginRegistry,
  presentationId: string,
  slideId: string,
  raw: unknown,
  checkConfig: (plugin: AnySlidePlugin, config: unknown) => boolean = () => true,
): Promise<SlideResult<SlideRecord>> {
  if (configBytes(raw) > MAX_CONFIG_BYTES) return fail("validation_failed");
  return repo.withPresentation(presentationId, async (tx) => {
    const slide = (await tx.list()).find((s) => s.id === slideId);
    if (!slide) return fail("not_found");
    const plugin = registry.get(slide.pluginId);
    if (!plugin || slide.pluginVersion > plugin.version) return fail("slide_locked");
    const parsed = plugin.configSchema.safeParse(raw);
    if (!parsed.success || !checkConfig(plugin, parsed.data)) return fail("validation_failed");
    return ok(await tx.updateConfig(slideId, parsed.data, plugin.version));
  });
}
