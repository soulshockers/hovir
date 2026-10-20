// Хелпери для тестів плагінів. Контрактний набір порту сховища — окремо: `@/lib/plugins/testing/store-contract`.

export { fakeCtx, type FakeCtx } from "./ctx";
export { checkPluginSecrets, SecretLeakError, type SecurityFixture, type SecurityStep } from "./security";
