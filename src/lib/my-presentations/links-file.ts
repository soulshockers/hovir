// Файл `.txt` з посиланнями формується в браузері, без запиту до сервера.

export interface LinksFileInput {
  title: string;
  createdAt: Date;
  editUrl: string;
  presentUrl: string;
}

export function linksFileText({ title, createdAt, editUrl, presentUrl }: LinksFileInput): string {
  return [
    `Презентація: ${title}`,
    `Створено: ${createdAt.toISOString()}`,
    "",
    `Редагування (edit): ${editUrl}`,
    `Показ (present): ${presentUrl}`,
    "",
    "УВАГА: цей файл дає повний доступ до презентації. Не пересилайте його й не публікуйте.",
    "Без власника інстансу втрачені посилання відновити неможливо.",
    "",
  ].join("\n");
}

/** Безпечна назва файлу з назви презентації. */
export function linksFileName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "presentation";
  return `${base} — посилання.txt`;
}

/** Завантажує текст як UTF-8 файл у браузері. */
export function downloadTextFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
