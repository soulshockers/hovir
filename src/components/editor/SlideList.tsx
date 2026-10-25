"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { AnySlidePlugin } from "@/lib/plugins";

import { SlideFrame } from "./SlidePreview";
import type { LocalSlide } from "./state";

export const pluginTitle = (plugin: AnySlidePlugin) => plugin.i18n.uk[plugin.meta.title] ?? plugin.id;

interface Props {
  slides: LocalSlide[];
  selectedId: string | null;
  openedAt: number;
  plugin(id: string): AnySlidePlugin | undefined;
  onSelect(id: string): void;
  onMove(from: number, to: number): void;
  onDuplicate(id: string): void;
  onDelete(id: string): void;
}

const STATUS_LABEL: Partial<Record<LocalSlide["status"], string>> = {
  unknown_plugin: "Невідомий тип слайда",
  invalid_config: "Помилка конфігу",
  no_migration: "Помилка конфігу",
  newer_version: "Лише для читання",
};

/** Список слайдів: вибір, перетягування (мишею чи клавіатурою за ручкою), кнопки «Вгору»/«Вниз», дублювання, видалення. */
export function SlideList({ slides, selectedId, openedAt, plugin, onSelect, onMove, onDuplicate, onDelete }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = slides.findIndex((slide) => slide.id === active.id);
    const to = slides.findIndex((slide) => slide.id === over.id);
    if (from >= 0 && to >= 0) onMove(from, to);
  }

  return (
    <DndContext id="slide-list" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={slides.map((slide) => slide.id)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-2" data-testid="slide-list" aria-label="Слайди">
          {slides.map((slide, index) => (
            <SlideItem
              key={slide.id}
              slide={slide}
              index={index}
              count={slides.length}
              selected={slide.id === selectedId}
              openedAt={openedAt}
              plugin={plugin(slide.pluginId)}
              onSelect={onSelect}
              onMove={onMove}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SlideItem({
  slide,
  index,
  count,
  selected,
  openedAt,
  plugin,
  onSelect,
  onMove,
  onDuplicate,
  onDelete,
}: {
  slide: LocalSlide;
  index: number;
  count: number;
  selected: boolean;
  openedAt: number;
  plugin: AnySlidePlugin | undefined;
} & Pick<Props, "onSelect" | "onMove" | "onDuplicate" | "onDelete">) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });
  const number = index + 1;
  const title = plugin ? pluginTitle(plugin) : slide.pluginId;
  const badge = STATUS_LABEL[slide.status];
  const iconButton = "rounded border border-slate-300 px-1.5 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-30";

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="slide-item"
      data-slide-id={slide.id}
      data-plugin-id={slide.pluginId}
      aria-current={selected ? "true" : undefined}
      className={`rounded-lg border p-2 ${selected ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"} ${isDragging ? "z-10 opacity-80 shadow-lg" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Перетягнути слайд ${number}`}
          className="cursor-grab px-1 text-slate-400 hover:text-slate-700"
        >
          ⠿
        </button>
        <button type="button" onClick={() => onSelect(slide.id)} className="flex min-w-0 flex-1 flex-col gap-1 text-left" aria-label={`Слайд ${number}: ${title}`}>
          <span className="flex items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold">{number}</span>
            <span className="truncate">{title}</span>
          </span>
          {plugin && (slide.status === "ok" || slide.status === "migrated") ? (
            <SlideFrame plugin={plugin} config={slide.lastValid} openedAt={openedAt} thumbnail />
          ) : (
            <span data-testid="slide-status" className="rounded bg-amber-50 px-2 py-3 text-center text-xs text-amber-900">
              {badge}
            </span>
          )}
        </button>
      </div>
      {selected && (
        <div className="mt-2 flex flex-wrap gap-1">
          <button type="button" className={iconButton} disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label={`Перемістити слайд ${number} вгору`}>
            ↑ Вгору
          </button>
          <button type="button" className={iconButton} disabled={index === count - 1} onClick={() => onMove(index, index + 1)} aria-label={`Перемістити слайд ${number} вниз`}>
            ↓ Вниз
          </button>
          <button type="button" className={iconButton} disabled={slide.status === "unknown_plugin" || slide.status === "newer_version"} onClick={() => onDuplicate(slide.id)}>
            Дублювати
          </button>
          <button type="button" className={`${iconButton} text-red-700`} onClick={() => onDelete(slide.id)}>
            Видалити
          </button>
        </div>
      )}
    </li>
  );
}
