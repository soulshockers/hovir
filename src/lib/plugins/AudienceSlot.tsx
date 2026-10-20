import type { AnySlidePlugin } from "./contract";

interface AudienceSlotProps {
  plugin: AnySlidePlugin;
  config: unknown;
  state: unknown;
  me: unknown;
  dispatch: (action: unknown) => Promise<unknown>;
}

/**
 * Екран слухача для слайда: `Audience` плагіна, а для `interactive: false` — «Дивіться на екран».
 * Пропси (`plugin`, `dispatch`) не серіалізуються, тож рендериться всередині клієнтського компонента сторінки слухача.
 */
export function AudienceSlot({ plugin, config, state, me, dispatch }: AudienceSlotProps) {
  if (!plugin.interactive) {
    return (
      <div data-testid="watch-screen" className="flex min-h-[50vh] items-center justify-center px-6 text-center">
        <p className="text-2xl font-semibold">Дивіться на екран</p>
      </div>
    );
  }
  const { Audience } = plugin;
  return <Audience config={config} state={state} me={me} dispatch={dispatch} />;
}
