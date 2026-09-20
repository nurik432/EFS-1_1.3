export interface DataRow {
  ФИО: string;
  СУММА: number;
}

export type Status = 'Совпадает' | 'Различается' | 'Нет в Реестре' | 'Нет в Своде';

export interface ComparisonResult {
  ФИО: string;
  Разница: number;
  Статус: Status;
}

export interface Filters {
  hideMatches: boolean;
  hideMissing: boolean;
}

export const cleanFIO = (fio: string): string => fio.replace(/\s+/g, ' ').trim();

// Ключ для сопоставления: без учёта регистра, «ё» = «е», лишние пробелы схлопнуты
export const fioKey = (fio: string): string =>
  cleanFIO(fio).toLowerCase().replace(/ё/g, 'е');

export const parseSum = (sumString: string, where: string): number => {
  if (!sumString) {
    return 0;
  }
  const formattedSum = sumString.replace(/\s+/g, '').replace(',', '.');
  const sum = parseFloat(formattedSum);
  if (Number.isNaN(sum)) {
    throw new Error(`Ошибка в ${where}: «${sumString}» не является числом.`);
  }
  return sum;
};

// Пустые строки пропускаем, но номера строк в сообщениях остаются исходными
const nonEmptyLines = (text: string): { line: string; number: number }[] =>
  text
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.trim() !== '');

export const parseRegistryText = (text: string, isVersionTwo: boolean): DataRow[] => {
  const rows = nonEmptyLines(text).map(({ line, number }) => {
    const parts = line.split('\t');
    if (!isVersionTwo) {
      // Версия 1: ровно 9 колонок, ФИО — 1-я, Сумма — 9-я
      if (parts.length !== 9) {
        throw new Error(`Ошибка в строке ${number} реестра: неверный формат данных для версии 1. Ожидается 9 колонок.`);
      }
      return {
        ФИО: cleanFIO(parts[0]),
        СУММА: parseSum(parts[8].trim(), `строке ${number} реестра`),
      };
    }
    // Версия 2: минимум 8 колонок, ФИО — 1-я, Сумма — 8-я
    if (parts.length < 8) {
      throw new Error(`Ошибка в строке ${number} реестра: неверный формат данных для версии 2. Ожидается минимум 8 колонок.`);
    }
    return {
      ФИО: cleanFIO(parts[0]),
      СУММА: parseSum(parts[7].trim(), `строке ${number} реестра`),
    };
  });

  if (!isVersionTwo) {
    return rows;
  }

  // В версии 2 суммы одинаковых ФИО складываются
  const merged = new Map<string, DataRow>();
  rows.forEach((row) => {
    const key = fioKey(row.ФИО);
    const existing = merged.get(key);
    if (existing) {
      existing.СУММА += row.СУММА;
    } else {
      merged.set(key, { ...row });
    }
  });
  return Array.from(merged.values());
};

export const parseFullReportText = (text: string): DataRow[] =>
  nonEmptyLines(text).map(({ line, number }) => {
    const parts = line.split('\t').map((part) => part.trim());
    if (parts.length !== 2) {
      throw new Error(`Ошибка в строке ${number} полного свода: неверный формат данных. Ожидаются 2 колонки.`);
    }
    return {
      ФИО: cleanFIO(parts[0]),
      СУММА: parseSum(parts[1], `строке ${number} полного свода`),
    };
  });

// Бросает Error с понятным сообщением, если данные некорректны
export const compareData = (
  registryText: string,
  fullReportText: string,
  isVersionTwo: boolean,
): ComparisonResult[] => {
  if (!registryText.trim() || !fullReportText.trim()) {
    throw new Error('Пожалуйста, заполните оба поля данных');
  }

  const registry = parseRegistryText(registryText, isVersionTwo);
  const fullReport = parseFullReportText(fullReportText);

  // При повторяющихся ФИО в реестре побеждает последняя строка
  const registryMap = new Map<string, number>();
  registry.forEach((row) => registryMap.set(fioKey(row.ФИО), row.СУММА));

  const reportKeys = new Set<string>();
  const results: ComparisonResult[] = [];

  fullReport.forEach((row) => {
    const key = fioKey(row.ФИО);
    reportKeys.add(key);
    const sumRegistry = registryMap.get(key);

    if (sumRegistry === undefined) {
      results.push({ ФИО: row.ФИО, Разница: row.СУММА, Статус: 'Нет в Реестре' });
    } else {
      results.push({
        ФИО: row.ФИО,
        Разница: row.СУММА - sumRegistry,
        Статус: row.СУММА === sumRegistry ? 'Совпадает' : 'Различается',
      });
    }
  });

  registry.forEach((row) => {
    if (!reportKeys.has(fioKey(row.ФИО))) {
      results.push({ ФИО: row.ФИО, Разница: -row.СУММА, Статус: 'Нет в Своде' });
    }
  });

  return results;
};

export const filterRows = (rows: ComparisonResult[], { hideMatches, hideMissing }: Filters): ComparisonResult[] =>
  rows.filter(
    (row) =>
      (!hideMatches || row.Статус !== 'Совпадает') &&
      (!hideMissing || (row.Статус !== 'Нет в Реестре' && row.Статус !== 'Нет в Своде')),
  );

export const sumDifferences = (rows: ComparisonResult[]): string =>
  rows.reduce((total, row) => total + row.Разница, 0).toFixed(2);
