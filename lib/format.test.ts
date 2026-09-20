import { describe, expect, it } from 'vitest';
import { formatAmount, formatDateTime, formatElapsed, formatTime } from './format';

describe('formatAmount', () => {
  it('форматирует по-русски: пробел между разрядами, запятая', () => {
    expect(formatAmount(0)).toBe('0,00');
    expect(formatAmount(2000)).toBe('2 000,00');
    expect(formatAmount(18750.5)).toBe('18 750,50');
    expect(formatAmount(1234567.891)).toBe('1 234 567,89');
  });

  it('отрицательные числа с обычным минусом', () => {
    expect(formatAmount(-1500)).toBe('-1 500,00');
  });

  it('не выводит «-0,00»', () => {
    expect(formatAmount(-0.001)).toBe('0,00');
    expect(formatAmount(-0)).toBe('0,00');
  });
});

describe('время', () => {
  const t = new Date(2026, 8, 20, 14, 2).getTime();

  it('formatTime и formatDateTime', () => {
    expect(formatTime(t)).toBe('14:02');
    expect(formatDateTime(t)).toBe('20.09.2026 14:02');
  });

  it('formatElapsed', () => {
    expect(formatElapsed(20)).toBe('< 0,1 с');
    expect(formatElapsed(400)).toBe('0,4 с');
    expect(formatElapsed(1250)).toBe('1,3 с');
  });
});
