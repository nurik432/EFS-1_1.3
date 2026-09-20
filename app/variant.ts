import { STATUS_TERMINATED } from '../lib/compare';
import type { Status } from '../lib/compare';

// Всё, что отличает кадровую версию от НДФЛ-версии (тексты и набор статусов).
// Разметка и стили общие, лежат в page.tsx и globals.css.

export type Tone = 'ok' | 'warn' | 'danger';

export interface StatCard {
  label: string;
  statuses: Status[];
  tone: Tone;
}

export const variant = {
  windowTitle: 'Сравнение Реестра и Полного свода (обработка)',
  footerTag: 'Кадры · ЕФС-1',
  registryTitle: 'Реестр',
  registrySection: 'Реестр ЕФС-1',
  clearRegistryTitle: 'Очистить реестр',
  missingNoun: 'уволенных',

  modeLabel: (isVersionTwo: boolean) => (isVersionTwo ? '2 колонки' : '3 колонки'),

  registryPlaceholder: (isVersionTwo: boolean) =>
    `Вставьте текст Реестра (${isVersionTwo ? 'ФИО[Tab]Сумма' : 'ФИО[Tab]СНИЛС[Tab]Сумма'})`,

  registryFormat: (isVersionTwo: boolean) =>
    isVersionTwo ? 'ФИО [Tab] Сумма' : 'ФИО [Tab] СНИЛС [Tab] Сумма',

  // Слияние одинаковых ФИО есть только в режиме «2 колонки»
  sumsDuplicates: (isVersionTwo: boolean) => isVersionTwo,

  statCards: [
    { label: 'Совпадает', statuses: ['Совпадает'], tone: 'ok' },
    { label: 'Различается', statuses: ['Различается'], tone: 'warn' },
    { label: 'Уволен или ГПХ', statuses: [STATUS_TERMINATED], tone: 'danger' },
  ] as StatCard[],
};

export const statusTone = (status: Status): Tone =>
  status === 'Совпадает' ? 'ok' : status === 'Различается' ? 'warn' : 'danger';
