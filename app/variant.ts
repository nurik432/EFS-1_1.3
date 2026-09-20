import type { Status } from '../lib/compare';

// Всё, что отличает НДФЛ-версию от кадровой (тексты и набор статусов).
// Разметка и стили общие, лежат в page.tsx и globals.css.

export type Tone = 'ok' | 'warn' | 'danger';

export interface StatCard {
  label: string;
  statuses: Status[];
  tone: Tone;
}

export const variant = {
  windowTitle: 'Сравнение Проверки расчетов НДФЛ и Полного свода (обработка)',
  footerTag: 'НДФЛ',
  registryTitle: 'Проверка расчетов НДФЛ',
  registrySection: 'Проверка расчетов НДФЛ',
  clearRegistryTitle: 'Очистить Проверку расчетов НДФЛ',
  missingNoun: 'отсутствующие',

  modeLabel: (isVersionTwo: boolean) =>
    isVersionTwo ? 'Версия 2 (Проверка дохода)' : 'Версия 1 (Проверка исчисленного налога)',

  registryPlaceholder: (isVersionTwo: boolean) =>
    `Вставьте текст Реестра (${
      isVersionTwo
        ? 'ФИО[Tab]...[Tab]Сумма (всего от 8 колонок, ФИО - 1-я, Сумма - 8-я)'
        : 'ФИО[Tab]...[Tab]Сумма (всего 9 колонок, ФИО - 1-я, Сумма - 9-я)'
    })`,

  registryFormat: (isVersionTwo: boolean) =>
    isVersionTwo
      ? 'Для версии 2: ФИО - 1-я колонка, Сумма - 8-я колонка. Минимум 8 колонок.'
      : 'Для версии 1: ФИО - 1-я колонка, Сумма - 9-я колонка. Всего 9 колонок.',

  // Слияние одинаковых ФИО есть только в режиме, где реестр суммируется
  sumsDuplicates: (isVersionTwo: boolean) => isVersionTwo,

  statCards: [
    { label: 'Совпадает', statuses: ['Совпадает'], tone: 'ok' },
    { label: 'Различается', statuses: ['Различается'], tone: 'warn' },
    { label: 'Нет в Реестре', statuses: ['Нет в Реестре'], tone: 'danger' },
    { label: 'Нет в Своде', statuses: ['Нет в Своде'], tone: 'danger' },
  ] as StatCard[],
};

export const statusTone = (status: Status): Tone =>
  status === 'Совпадает' ? 'ok' : status === 'Различается' ? 'warn' : 'danger';
