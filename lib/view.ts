import { fioKey } from './compare';

export type SortKey = 'ФИО' | 'Разница' | 'Статус';
export type SortDir = 'asc' | 'desc';

export interface Sort {
  key: SortKey;
  dir: SortDir;
}

interface Row {
  ФИО: string;
  Разница: number;
  Статус: string;
}

// Поиск по части ФИО без учёта регистра и «ё»/«е»
export const searchRows = <T extends Row>(rows: T[], query: string): T[] => {
  const q = fioKey(query);
  if (!q) {
    return rows;
  }
  return rows.filter((row) => fioKey(row.ФИО).includes(q));
};

export const sortRows = <T extends Row>(rows: T[], sort: Sort | null): T[] => {
  if (!sort) {
    return rows;
  }
  const sign = sort.dir === 'asc' ? 1 : -1;
  const { key } = sort;
  return [...rows].sort((a, b) =>
    sign * (key === 'Разница' ? a.Разница - b.Разница : a[key].localeCompare(b[key], 'ru')),
  );
};

// Клик по заголовку: по возрастанию → по убыванию → без сортировки
export const nextSort = (current: Sort | null, key: SortKey): Sort | null => {
  if (!current || current.key !== key) {
    return { key, dir: 'asc' };
  }
  return current.dir === 'asc' ? { key, dir: 'desc' } : null;
};
