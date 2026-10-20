// Абсолютні секретні посилання інстансу.

export const editPath = (token: string) => `/e/${token}`;
export const presentPath = (token: string) => `/p/${token}`;

export const editUrl = (origin: string, token: string) => `${origin}${editPath(token)}`;
export const presentUrl = (origin: string, token: string) => `${origin}${presentPath(token)}`;
