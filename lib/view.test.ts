import { describe, expect, it } from 'vitest';
import { nextSort, searchRows, sortRows } from './view';

const rows = [
  { ФИО: 'Петров Пётр', Разница: 10, Статус: 'Различается' },
  { ФИО: 'Иванов Иван', Разница: -5, Статус: 'Совпадает' },
  { ФИО: 'Сидоров Семён', Разница: 2.5, Статус: 'Различается' },
];

describe('searchRows', () => {
  it('ищет по части ФИО без учёта регистра и ё/е', () => {
    expect(searchRows(rows, 'ПЕТР').map((r) => r.ФИО)).toEqual(['Петров Пётр']);
    expect(searchRows(rows, 'семен').map((r) => r.ФИО)).toEqual(['Сидоров Семён']);
  });

  it('пустой запрос возвращает все строки', () => {
    expect(searchRows(rows, '  ')).toBe(rows);
  });

  it('ничего не найдено — пустой список', () => {
    expect(searchRows(rows, 'Яковлев')).toEqual([]);
  });
});

describe('sortRows', () => {
  it('по ФИО по возрастанию и убыванию', () => {
    expect(sortRows(rows, { key: 'ФИО', dir: 'asc' }).map((r) => r.ФИО)).toEqual([
      'Иванов Иван',
      'Петров Пётр',
      'Сидоров Семён',
    ]);
    expect(sortRows(rows, { key: 'ФИО', dir: 'desc' })[0].ФИО).toBe('Сидоров Семён');
  });

  it('по разнице — как по числу', () => {
    expect(sortRows(rows, { key: 'Разница', dir: 'asc' }).map((r) => r.Разница)).toEqual([-5, 2.5, 10]);
    expect(sortRows(rows, { key: 'Разница', dir: 'desc' }).map((r) => r.Разница)).toEqual([10, 2.5, -5]);
  });

  it('без сортировки порядок не меняется и исходный массив не трогается', () => {
    expect(sortRows(rows, null)).toBe(rows);
    const copy = [...rows];
    sortRows(rows, { key: 'Разница', dir: 'asc' });
    expect(rows).toEqual(copy);
  });
});

describe('nextSort', () => {
  it('цикл: по возрастанию → по убыванию → сброс', () => {
    const first = nextSort(null, 'ФИО');
    expect(first).toEqual({ key: 'ФИО', dir: 'asc' });
    const second = nextSort(first, 'ФИО');
    expect(second).toEqual({ key: 'ФИО', dir: 'desc' });
    expect(nextSort(second, 'ФИО')).toBeNull();
  });

  it('другая колонка начинает с возрастания', () => {
    expect(nextSort({ key: 'ФИО', dir: 'desc' }, 'Разница')).toEqual({ key: 'Разница', dir: 'asc' });
  });
});
