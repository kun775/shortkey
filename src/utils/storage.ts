import { ShortLink } from '../types';

const STORAGE_KEY = 'sk_gs_history';

export function getLocalHistory(): ShortLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalHistory(item: ShortLink): ShortLink[] {
  try {
    const history = getLocalHistory();
    // 过滤同 slug 旧记录，最新置顶
    const filtered = history.filter((h) => h.slug !== item.slug);
    const updated = [item, ...filtered].slice(0, 30); // 保留最新 30 条
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function removeHistoryItem(slug: string): ShortLink[] {
  try {
    const history = getLocalHistory();
    const updated = history.filter((h) => h.slug !== slug);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function clearAllHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error(e);
  }
}
