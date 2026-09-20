export interface DataRow {
  ФИО: string;
  СУММА: number;
}

export const STATUS_TERMINATED = 'Уволен или работает по ГПХ';

export type Status = 'Совпадает' | 'Различается' | typeof STATUS_TERMINATED;

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

// Предполагаем, что ФИО — это первые три слова (Фамилия Имя Отчество)
export const extractFIO = (text: string): string =>
  cleanFIO(text.trim().split(/\s+/).slice(0, 3).join(' '));

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

// Реестр для кадров.
// Режим «3 колонки» (isVersionTwo = false): ФИО[Tab]СНИЛС[Tab]Сумма.
// Режим «2 колонки» (isVersionTwo = true): ФИО[Tab]Сумма; ФИО берётся как первые три слова,
// суммы одинаковых ФИО складываются.
export const parseRegistryText = (text: string, isVersionTwo: boolean): DataRow[] => {
  const columns = isVersionTwo ? 2 : 3;

  const rows = nonEmptyLines(text).map(({ line, number }) => {
    const parts = line.split('\t');
    if (parts.length !== columns) {
      throw new Error(`Ошибка в строке ${number} реестра: неверный формат данных. Ожидаются ${columns} колонки.`);
    }
    return {
      ФИО: isVersionTwo ? extractFIO(parts[0]) : cleanFIO(parts[0]),
      СУММА: parseSum(parts[columns - 1].trim(), `строке ${number} реестра`),
    };
  });

  if (!isVersionTwo) {
    return rows;
  }

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

  // При повторяющихся ФИО в реестре (режим «3 колонки») побеждает последняя строка
  const registryMap = new Map<string, number>();
  registry.forEach((row) => registryMap.set(fioKey(row.ФИО), row.СУММА));

  // Идём по своду: кого нет в реестре — уволен или работает по ГПХ.
  // Обратной проверки (есть в реестре, нет в своде) в кадровой версии нет.
  return fullReport.map((row): ComparisonResult => {
    const sumRegistry = registryMap.get(fioKey(row.ФИО));

    if (sumRegistry === undefined) {
      return { ФИО: row.ФИО, Разница: row.СУММА, Статус: STATUS_TERMINATED };
    }
    return {
      ФИО: row.ФИО,
      Разница: row.СУММА - sumRegistry,
      Статус: row.СУММА === sumRegistry ? 'Совпадает' : 'Различается',
    };
  });
};

export const filterRows = (rows: ComparisonResult[], { hideMatches, hideMissing }: Filters): ComparisonResult[] =>
  rows.filter(
    (row) =>
      (!hideMatches || row.Статус !== 'Совпадает') &&
      (!hideMissing || row.Статус !== STATUS_TERMINATED),
  );

export const sumDifferences = (rows: ComparisonResult[]): string =>
  rows.reduce((total, row) => total + row.Разница, 0).toFixed(2);
