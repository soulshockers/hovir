"use client";

import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";

import { previewCtx, previewState } from "@/lib/editor/preview";
import type { AnySlidePlugin } from "@/lib/plugins";

// Кадр превʼю 16:9: той самий `Presenter`, що й на сцені, з публічним станом, обчисленим з конфігу.
// Кадр `inert`: кнопки доповідача в превʼю не працюють.

const noopControls = { dispatch: async () => undefined };

export class PreviewBoundary extends Component<{ children: ReactNode; resetKey: unknown }, { failed: boolean; key: unknown }> {
  state = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: { resetKey: unknown }, state: { failed: boolean; key: unknown }) {
    return props.resetKey === state.key ? null : { failed: false, key: props.resetKey };
  }

  componentDidCatch(error: unknown) {
    console.error("[editor] превʼю плагіна впало:", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div data-testid="preview-error" className="flex h-full items-center justify-center p-4 text-center text-sm text-slate-500">
          Превʼю недоступне
        </div>
      );
    }
    return this.props.children;
  }
}

function PresenterView({ plugin, config, openedAt }: { plugin: AnySlidePlugin; config: unknown; openedAt: number }) {
  const state = useMemo(() => previewState(plugin, config, previewCtx(openedAt)), [plugin, config, openedAt]);
  const { Presenter } = plugin;
  return <Presenter config={config} state={state} controls={noopControls} />;
}

/** Кадр 16:9. `thumbnail` — мініатюра: `Preview` плагіна, якщо він є, інакше зменшений `Presenter`. */
export function SlideFrame({
  plugin,
  config,
  openedAt,
  thumbnail = false,
}: {
  plugin: AnySlidePlugin;
  config: unknown;
  openedAt: number;
  thumbnail?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  // Кадр рендериться в 1280×720 і масштабується під ширину контейнера, як сцена під екран.
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => element.style.setProperty("--frame-scale", String(entry.contentRect.width / 1280)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { Preview } = plugin;
  const content =
    thumbnail && Preview ? <Preview config={config} /> : <PresenterView plugin={plugin} config={config} openedAt={openedAt} />;
  return (
    <div
      ref={frame}
      inert
      data-testid={thumbnail ? "slide-thumbnail" : "slide-preview"}
      className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <div
        className="absolute left-0 top-0 h-[720px] w-[1280px] origin-top-left p-12"
        style={{ transform: `scale(var(--frame-scale, ${thumbnail ? 0.12 : 0.5}))` }}
      >
        <PreviewBoundary resetKey={config}>{content}</PreviewBoundary>
      </div>
    </div>
  );
}
