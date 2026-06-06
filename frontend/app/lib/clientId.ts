const STORAGE_KEY = "yourtj_client_id";

export function getClientId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
