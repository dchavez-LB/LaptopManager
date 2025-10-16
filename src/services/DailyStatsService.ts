import { Platform } from 'react-native';

export type DailyStats = {
  date: string; // formato YYYY-MM-DD
  loans: number;
  returns: number;
  actives: number; // asignaciones a salón u operaciones activas del día
};

const STORAGE_KEY = 'dailyStats';
let memoryStats: DailyStats | null = null;

function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function loadRaw(): Promise<DailyStats | null> {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const webRaw = window.localStorage.getItem(STORAGE_KEY);
      if (!webRaw) return null;
      return JSON.parse(webRaw) as DailyStats;
    }
    return memoryStats;
  } catch {
    return null;
  }
}

async function save(stats: DailyStats): Promise<void> {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    } else {
      memoryStats = stats;
    }
  } catch {}
}

export const DailyStatsService = {
  async getToday(): Promise<DailyStats> {
    const today = todayString();
    const existing = await loadRaw();
    if (!existing || existing.date !== today) {
      const fresh: DailyStats = { date: today, loans: 0, returns: 0, actives: 0 };
      await save(fresh);
      return fresh;
    }
    return existing;
  },

  async increment(key: 'loans' | 'returns' | 'actives', amount: number = 1): Promise<DailyStats> {
    const today = todayString();
    const stats = await this.getToday();
    const updated: DailyStats = {
      date: today,
      loans: stats.loans + (key === 'loans' ? amount : 0),
      returns: stats.returns + (key === 'returns' ? amount : 0),
      actives: stats.actives + (key === 'actives' ? amount : 0),
    };
    await save(updated);
    return updated;
  },

  async reset(): Promise<DailyStats> {
    const fresh: DailyStats = { date: todayString(), loans: 0, returns: 0, actives: 0 };
    await save(fresh);
    return fresh;
  },
};