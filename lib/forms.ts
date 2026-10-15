export type FormState = { error?: string; ok?: string } | undefined;

export const text = (fd: FormData, key: string, max = 5000) => String(fd.get(key) ?? "").trim().slice(0, max);
export const optional = (fd: FormData, key: string, max = 5000) => text(fd, key, max) || null;
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export const dateOrNull = (fd: FormData, key: string) => {
  const v = text(fd, key, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};
export const numberOrNull = (fd: FormData, key: string) => {
  const v = text(fd, key, 20).replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
