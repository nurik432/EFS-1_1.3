import { describe, expect, it } from 'vitest';
import {
  compareData,
  filterRows,
  parseFullReportText,
  parseRegistryText,
  parseSum,
  sumDifferences,
} from './compare';

const v1Row = (fio: string, sum: string) => [fio, '', '', '', '', '', '', '', sum].join('\t');
const v2Row = (fio: string, sum: string) => [fio, '', '', '', '', '', '', sum].join('\t');

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

describe('parseRegistryText', () => {
  it('версия 1: 9 колонок, сумма в последней', () => {
    const rows = parseRegistryText(v1Row('Иванов Иван Иванович', '100,50'), false);
    expect(rows).toEqual([{ ФИО: 'Иванов Иван Иванович', СУММА: 100.5 }]);
  });

  it('версия 1: неверное число колонок — ошибка с номером строки', () => {
    expect(() => parseRegistryText('a\tb', false)).toThrow('строке 1');
  });

  it('версия 2: сумма в 8-й колонке, дубли ФИО складываются', () => {
    const text = [v2Row('Иванов И И', '10'), v2Row('иванов  и и', '5')].join('\n');
    const rows = parseRegistryText(text, true);
    expect(rows).toHaveLength(1);
    expect(rows[0].СУММА).toBe(15);
  });

  it('пустые строки пропускаются, номера строк остаются исходными', () => {
    const text = [v1Row('А Б В', '1'), '', v1Row('Г Д Е', 'oops')].join('\n');
    expect(() => parseRegistryText(text, false)).toThrow('строке 3');
  });

  it('CRLF не ломает разбор', () => {
    const text = [v1Row('А Б В', '1'), v1Row('Г Д Е', '2')].join('\r\n');
    expect(parseRegistryText(text, false)).toHaveLength(2);
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
  const registry = [v1Row('Иванов Иван', '100'), v1Row('Петров Пётр', '50'), v1Row('Только Реестр', '7')].join('\n');
  const report = ['Иванов Иван\t100', 'ПЕТРОВ ПЕТР\t60', 'Только Свод\t3'].join('\n');

  it('определяет все четыре статуса', () => {
    const byStatus = Object.fromEntries(compareData(registry, report, false).map((r) => [r.ФИО, r]));
    expect(byStatus['Иванов Иван'].Статус).toBe('Совпадает');
    expect(byStatus['ПЕТРОВ ПЕТР']).toMatchObject({ Статус: 'Различается', Разница: 10 });
    expect(byStatus['Только Свод']).toMatchObject({ Статус: 'Нет в Реестре', Разница: 3 });
    expect(byStatus['Только Реестр']).toMatchObject({ Статус: 'Нет в Своде', Разница: -7 });
  });

  it('сопоставляет без учёта регистра и ё/е', () => {
    const rows = compareData(v1Row('Пётр Первый', '1'), 'петр  первый\t1', false);
    expect(rows).toEqual([{ ФИО: 'петр первый', Разница: 0, Статус: 'Совпадает' }]);
  });

  it('требует оба поля', () => {
    expect(() => compareData('', report, false)).toThrow('заполните оба поля');
  });
});

describe('filterRows и sumDifferences', () => {
  const rows = compareData(
    [v1Row('А А', '1'), v1Row('Б Б', '1'), v1Row('В В', '5')].join('\n'),
    ['А А\t1', 'Б Б\t3', 'Г Г\t4'].join('\n'),
    false,
  );

  it('скрывает совпадения', () => {
    const shown = filterRows(rows, { hideMatches: true, hideMissing: false });
    expect(shown.map((r) => r.Статус)).not.toContain('Совпадает');
  });

  it('скрывает отсутствующие', () => {
    const shown = filterRows(rows, { hideMatches: false, hideMissing: true });
    expect(shown.map((r) => r.Статус).sort()).toEqual(['Совпадает', 'Различается'].sort());
  });

  it('считает итог по отфильтрованным строкам', () => {
    // 0 (А) + 2 (Б) + 4 (Г) - 5 (В)
    expect(sumDifferences(rows)).toBe('1.00');
    expect(sumDifferences(filterRows(rows, { hideMatches: true, hideMissing: true }))).toBe('2.00');
  });
});
