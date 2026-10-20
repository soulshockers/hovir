import { describe, expect, it } from "vitest";

import { checkInstancePassword } from "@/lib/access/password";

describe("checkInstancePassword", () => {
  it("правильний пароль", () => {
    expect(checkInstancePassword("s3cret", "s3cret")).toBe("ok");
  });

  it("неправильний пароль тієї самої довжини", () => {
    expect(checkInstancePassword("s3cret", "s3creT")).toBe("invalid");
  });

  it("пароль іншої довжини", () => {
    expect(checkInstancePassword("s3cret", "s3cret-longer")).toBe("invalid");
    expect(checkInstancePassword("s3cret", "s")).toBe("invalid");
  });

  it("порожній або відсутній пароль", () => {
    expect(checkInstancePassword("s3cret", "")).toBe("missing");
    expect(checkInstancePassword("s3cret", undefined)).toBe("missing");
    expect(checkInstancePassword("s3cret", 123)).toBe("missing");
  });

  it("пароль інстансу не задано", () => {
    expect(checkInstancePassword(undefined, "будь-що")).toBe("not_configured");
    expect(checkInstancePassword("", "")).toBe("not_configured");
  });
});
