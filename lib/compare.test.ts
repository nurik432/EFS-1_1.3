import { describe, expect, it } from 'vitest';
import {
  compareData,
  filterRows,
  parseFullReportText,
  parseRegistryText,
  parseSum,
  STATUS_TERMINATED,
  sumDifferences,
} from './compare';

const row3 = (fio: string, snils: string, sum: string) => [fio, snils, sum].join('\t');
const row2 = (fio: string, sum: string) => [fio, sum].join('\t');

describe('parseSum', () => {
  it('понимает пробелы-разделители и десятичную запятую', () => {
    expect(parseSum('1 234,56', 'x')).toBe(1234.56);
    expect(parseSum('1 234,56', 'x')).toBe(1234.56);
  });

  it('пустая строка — 0', () => {
    expect(parseSum('', 'x')).toBe(0);
  });

  it('нечисловое значение — ошибка, а не NaN', () => {
    expect(() => parseSum('abc', 'строке 3 реестра')).toThrow('строке 3 реестра');
  });
});

describe('parseRegistryText: 3 колонки', () => {
  it('ФИО, СНИЛС, сумма', () => {
    const rows = parseRegistryText(row3('Иванов Иван Иванович', '123-456-789 00', '100,50'), false);
    expect(rows).toEqual([{ ФИО: 'Иванов Иван Иванович', СУММА: 100.5 }]);
  });

  it('не 3 колонки — ошибка с номером строки', () => {
    expect(() => parseRegistryText(row2('А Б В', '1'), false)).toThrow('строке 1 реестра');
  });

  it('пустые строки пропускаются, номера строк остаются исходными', () => {
    const text = [row3('А Б В', '1', '1'), '', row3('Г Д Е', '2', 'oops')].join('\n');
    expect(() => parseRegistryText(text, false)).toThrow('строке 3');
  });

  it('CRLF не ломает разбор', () => {
    const text = [row3('А Б В', '1', '1'), row3('Г Д Е', '2', '2')].join('\r\n');
    expect(parseRegistryText(text, false)).toHaveLength(2);
  });
});

describe('parseRegistryText: 2 колонки', () => {
  it('ФИО и сумма', () => {
    expect(parseRegistryText(row2('Иванов Иван Иванович', '10'), true)).toEqual([
      { ФИО: 'Иванов Иван Иванович', СУММА: 10 },
    ]);
  });

  it('ФИО берётся как первые три слова', () => {
    const rows = parseRegistryText(row2('Иванов Иван Иванович 12345', '10'), true);
    expect(rows[0].ФИО).toBe('Иванов Иван Иванович');
  });

  it('суммы одинаковых ФИО складываются', () => {
    const text = [row2('Иванов И И', '10'), row2('иванов  и и', '5')].join('\n');
    const rows = parseRegistryText(text, true);
    expect(rows).toHaveLength(1);
    expect(rows[0].СУММА).toBe(15);
  });

  it('не 2 колонки — ошибка', () => {
    expect(() => parseRegistryText(row3('А Б В', '1', '1'), true)).toThrow('Ожидаются 2 колонки');
  });
});

describe('parseFullReportText', () => {
  it('две колонки: ФИО и сумма', () => {
    expect(parseFullReportText('А Б В\t1 000,5')).toEqual([{ ФИО: 'А Б В', СУММА: 1000.5 }]);
  });

  it('не две колонки — ошибка', () => {
    expect(() => parseFullReportText('А Б В')).toThrow('строке 1 полного свода');
  });
});

describe('compareData', () => {
  const registry = [row3('Иванов Иван', '1', '100'), row3('Петров Пётр', '2', '50'), row3('Только Реестр', '3', '7')].join('\n');
  const report = ['Иванов Иван\t100', 'ПЕТРОВ ПЕТР\t60', 'Только Свод\t3'].join('\n');

  it('определяет три статуса', () => {
    const byFio = Object.fromEntries(compareData(registry, report, false).map((r) => [r.ФИО, r]));
    expect(byFio['Иванов Иван'].Статус).toBe('Совпадает');
    expect(byFio['ПЕТРОВ ПЕТР']).toMatchObject({ Статус: 'Различается', Разница: 10 });
    expect(byFio['Только Свод']).toMatchObject({ Статус: STATUS_TERMINATED, Разница: 3 });
  });

  it('кто есть только в реестре, в результат не попадает', () => {
    const fios = compareData(registry, report, false).map((r) => r.ФИО);
    expect(fios).toEqual(['Иванов Иван', 'ПЕТРОВ ПЕТР', 'Только Свод']);
  });

  it('сопоставляет без учёта регистра и ё/е', () => {
    const rows = compareData(row3('Пётр Первый', '1', '1'), 'петр  первый\t1', false);
    expect(rows).toEqual([{ ФИО: 'петр первый', Разница: 0, Статус: 'Совпадает' }]);
  });

  it('работает в режиме 2 колонок', () => {
    const rows = compareData(row2('А А', '4'), 'А А\t4', true);
    expect(rows[0].Статус).toBe('Совпадает');
  });

  it('требует оба поля', () => {
    expect(() => compareData('', report, false)).toThrow('заполните оба поля');
  });
});

describe('filterRows и sumDifferences', () => {
  const rows = compareData(
    [row3('А А', '1', '1'), row3('Б Б', '1', '1')].join('\n'),
    ['А А\t1', 'Б Б\t3', 'Г Г\t4'].join('\n'),
    false,
  );

  it('скрывает совпадения', () => {
    const shown = filterRows(rows, { hideMatches: true, hideMissing: false });
    expect(shown.map((r) => r.Статус)).not.toContain('Совпадает');
  });

  it('скрывает уволенных и работающих по ГПХ', () => {
    const shown = filterRows(rows, { hideMatches: false, hideMissing: true });
    expect(shown.map((r) => r.Статус)).not.toContain(STATUS_TERMINATED);
    expect(shown).toHaveLength(2);
  });

  it('считает итог по отфильтрованным строкам', () => {
    // 0 (А) + 2 (Б) + 4 (Г)
    expect(sumDifferences(rows)).toBe('6.00');
    expect(sumDifferences(filterRows(rows, { hideMatches: true, hideMissing: true }))).toBe('2.00');
  });
});
