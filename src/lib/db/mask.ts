/** Прибирає з тексту облікові дані, хости й рядки підключення до Postgres. */
export function maskConnectionDetails(text: string, urls: string[]): string {
  let masked = text.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgres://***");
  for (const raw of urls) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }
    const secrets = [parsed.password, parsed.username, parsed.hostname]
      .map((value) => decodeURIComponent(value))
      .filter((value) => value.length >= 3);
    for (const secret of secrets) masked = masked.split(secret).join("***");
  }
  return masked;
}
