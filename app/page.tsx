'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { compareData, filterRows, sumDifferences } from '../lib/compare';
import type { ComparisonResult } from '../lib/compare';
import { formatAmount, formatDateTime, formatElapsed, formatTime } from '../lib/format';
import { nextSort, searchRows, sortRows } from '../lib/view';
import type { Sort, SortKey } from '../lib/view';
import { statusTone, variant } from './variant';

interface Submitted {
  registryText: string;
  fullReportText: string;
  isVersionTwo: boolean;
  at: number;
}

interface Comparison {
  differences: ComparisonResult[];
  compareError: string;
  elapsedMs: number;
}

const EMPTY: Comparison = { differences: [], compareError: '', elapsedMs: 0 };

// Таблица рисует только видимые строки, поэтому высота строки фиксирована (см. .grid td в globals.css)
const ROW_HEIGHT = 28;
const OVERSCAN = 10;

const STORAGE_WARNING =
  'Данные слишком велики для сохранения в браузере: после перезагрузки страницы они пропадут. Сравнение и экспорт работают как обычно.';

const newSessionKey = () => 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);

// Квота localStorage небольшая, а вставленный реестр может быть огромным
const trySetItem = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    // Иначе после перезагрузки вернётся устаревшее значение
    try {
      localStorage.removeItem(key);
    } catch {
      // хранилище недоступно — ничего не поделать
    }
    return false;
  }
};

const SORTABLE: { key: SortKey; label: string; className?: string }[] = [
  { key: 'ФИО', label: 'ФИО' },
  { key: 'Разница', label: 'Разница', className: 'num' },
  { key: 'Статус', label: 'Статус' },
];

const CompareTables = () => {
  const [registryText, setRegistryText] = useState<string>('');
  const [fullReportText, setFullReportText] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');
  const [storageWarning, setStorageWarning] = useState<boolean>(false);
  const [filterMatches, setFilterMatches] = useState<boolean>(false);
  const [filterTerminated, setFilterTerminated] = useState<boolean>(false);
  const [query, setQuery] = useState<string>('');
  const [sort, setSort] = useState<Sort | null>(null);
  const [inputsOpen, setInputsOpen] = useState<boolean>(true);
  const [sessionId, setSessionId] = useState<string>('');
  const [modifiedAt, setModifiedAt] = useState<number | null>(null);
  const [isVersionTwo, setIsVersionTwo] = useState<boolean>(false); // false = версия 1, true = версия 2
  // Снимок данных на момент нажатия «Сравнить данные»; результат считается из него
  const [submitted, setSubmitted] = useState<Submitted | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [firstRow, setFirstRow] = useState<number>(0);
  const [viewportRows, setViewportRows] = useState<number>(20);

  const { differences, compareError, elapsedMs } = useMemo((): Comparison => {
    if (!submitted) {
      return EMPTY;
    }
    const start = performance.now();
    try {
      const rows = compareData(submitted.registryText, submitted.fullReportText, submitted.isVersionTwo);
      return { differences: rows, compareError: '', elapsedMs: performance.now() - start };
    } catch (e) {
      return {
        differences: [],
        compareError: e instanceof Error ? e.message : 'Произошла ошибка при сравнении данных',
        elapsedMs: 0,
      };
    }
  }, [submitted]);

  const error = compareError || actionError;

  // Строки, которые видит пользователь: фильтры → поиск → сортировка
  const viewRows = useMemo(
    () =>
      sortRows(
        searchRows(filterRows(differences, { hideMatches: filterMatches, hideMissing: filterTerminated }), query),
        sort,
      ),
    [differences, filterMatches, filterTerminated, query, sort],
  );

  const stats = useMemo(
    () =>
      variant.statCards.map((card) => ({
        ...card,
        count: differences.filter((row) => card.statuses.includes(row.Статус)).length,
      })),
    [differences],
  );

  // Виртуальная прокрутка: в DOM только строки в окне просмотра и небольшой запас
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => setViewportRows(Math.ceil(el.clientHeight / ROW_HEIGHT));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // При смене набора строк возвращаемся к началу таблицы
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
    setFirstRow(0);
  }, [differences, filterMatches, filterTerminated, query, sort]);

  const rangeStart = Math.max(0, firstRow - OVERSCAN);
  const rangeEnd = Math.min(viewRows.length, firstRow + viewportRows + OVERSCAN);
  const shownRows = viewRows.slice(rangeStart, rangeEnd);
  const spaceBefore = rangeStart * ROW_HEIGHT;
  const spaceAfter = (viewRows.length - rangeEnd) * ROW_HEIGHT;

  // Генерация уникального ID сессии при первой загрузке
  useEffect(() => {
    const storedSessionId = localStorage.getItem('current_session_id');
    if (storedSessionId) {
      setSessionId(storedSessionId);
    } else {
      const newSessionId = newSessionKey();
      localStorage.setItem('current_session_id', newSessionId);
      setSessionId(newSessionId);
    }
  }, []);

  // Создаем префикс для ключей localStorage, включающий ID сессии
  const getStorageKey = (key: string) => {
    return `${sessionId}_${key}`;
  };

  // Загрузка данных из localStorage при первом рендеринге и при изменении sessionId
  useEffect(() => {
    if (!sessionId) return;

    const savedRegistryText = localStorage.getItem(getStorageKey('registryText'));
    const savedFullReportText = localStorage.getItem(getStorageKey('fullReportText'));
    const savedFilterMatches = localStorage.getItem(getStorageKey('filterMatches'));
    const savedFilterTerminated = localStorage.getItem(getStorageKey('filterTerminated'));
    const savedIsVersionTwo = localStorage.getItem(getStorageKey('isVersionTwo'));
    const savedModifiedAt = localStorage.getItem(getStorageKey('modifiedAt'));

    // Результаты сравнения больше не хранятся, они пересчитываются из данных
    localStorage.removeItem(getStorageKey('differences'));

    if (savedRegistryText) setRegistryText(savedRegistryText);
    if (savedFullReportText) setFullReportText(savedFullReportText);
    if (savedFilterMatches) setFilterMatches(savedFilterMatches === 'true');
    if (savedFilterTerminated) setFilterTerminated(savedFilterTerminated === 'true');
    if (savedIsVersionTwo) setIsVersionTwo(savedIsVersionTwo === 'true');
    setModifiedAt(savedModifiedAt ? Number(savedModifiedAt) : null);

    // Если есть сохраненные данные, автоматически запускаем сравнение
    if (savedRegistryText && savedFullReportText) {
      setSubmitted({
        registryText: savedRegistryText,
        fullReportText: savedFullReportText,
        isVersionTwo: savedIsVersionTwo === 'true',
        at: Date.now(),
      });
    }
  }, [sessionId]);

  // Сохранение данных в localStorage при их изменении
  useEffect(() => {
    if (!sessionId) return;

    const entries: [string, string][] = [
      ['registryText', registryText],
      ['fullReportText', fullReportText],
      ['filterMatches', String(filterMatches)],
      ['filterTerminated', String(filterTerminated)],
      ['isVersionTwo', String(isVersionTwo)],
    ];
    let ok = true;
    for (const [key, value] of entries) {
      ok = trySetItem(getStorageKey(key), value) && ok;
    }
    setStorageWarning(!ok);
  }, [registryText, fullReportText, filterMatches, filterTerminated, sessionId, isVersionTwo]);

  // Время последнего изменения данных в сессии
  const touch = () => {
    const now = Date.now();
    setModifiedAt(now);
    if (sessionId) trySetItem(getStorageKey('modifiedAt'), String(now));
  };

  const runCompare = () => {
    setActionError('');
    if (!registryText.trim() || !fullReportText.trim()) {
      setSubmitted(null);
      setActionError('Пожалуйста, заполните оба поля данных');
      return;
    }
    setSubmitted({ registryText, fullReportText, isVersionTwo, at: Date.now() });
  };

  // Обработчик изменения версии
  const handleVersionChange = () => {
    const next = !isVersionTwo;
    setIsVersionTwo(next);
    setActionError('');

    // Результаты сбрасываем и, если данные есть, сразу пересчитываем по новой версии
    if (registryText.trim() && fullReportText.trim()) {
      setSubmitted({ registryText, fullReportText, isVersionTwo: next, at: Date.now() });
    } else {
      setSubmitted(null);
    }
  };

  // Очистка реестра
  const clearRegistry = () => {
    setRegistryText('');
    localStorage.removeItem(getStorageKey('registryText'));
    touch();
    if (!fullReportText.trim()) {
      setSubmitted(null);
    }
  };

  // Очистка полного свода
  const clearFullReport = () => {
    setFullReportText('');
    localStorage.removeItem(getStorageKey('fullReportText'));
    touch();
    if (!registryText.trim()) {
      setSubmitted(null);
    }
  };

  // Очистка всех данных
  const clearAll = () => {
    setRegistryText('');
    setFullReportText('');
    setSubmitted(null);
    setActionError('');
    setQuery('');
    setSort(null);
    localStorage.removeItem(getStorageKey('registryText'));
    localStorage.removeItem(getStorageKey('fullReportText'));
  };

  // Создание новой сессии (для работы с новыми данными)
  const createNewSession = () => {
    const newSessionId = newSessionKey();
    localStorage.setItem('current_session_id', newSessionId);
    setSessionId(newSessionId);
    clearAll();
  };

  // Функция для экспорта данных в Excel: то, что сейчас показано в таблице
  const exportToExcel = () => {
    try {
      // Формируем данные для Excel из строк, видимых при текущих фильтрах, поиске и сортировке
      const excelData = viewRows.map(row => ({
        'ФИО': row.ФИО,
        'Разница': row.Разница,
        'Статус': row.Статус as string
      }));

      // Добавляем итоговую строку
      excelData.push({
        'ФИО': 'Итоговая сумма разницы:',
        'Разница': parseFloat(sumDifferences(viewRows)),
        'Статус': ''
      });

      // Создаем рабочую книгу и лист
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Сравнение');

      // Задаем ширину колонок
      const columnWidths = [
        { wch: 40 }, // ФИО
        { wch: 15 }, // Разница
        { wch: 25 }, // Статус
      ];
      worksheet['!cols'] = columnWidths;

      // Генерируем имя файла с текущей датой
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const fileName = `Сравнение_${dateStr}.xlsx`;

      // Экспортируем файл
      XLSX.writeFile(workbook, fileName);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Ошибка при экспорте в Excel');
    }
  };

  const canCompare = registryText.trim() !== '' && fullReportText.trim() !== '';
  const total = differences.length;
  const selectOnClick = (e: React.MouseEvent<HTMLInputElement>) => e.currentTarget.select();

  return (
    <div className="desk">
      <div className="win">
        <div className="titlebar">
          <div className="titlebar-icon" aria-hidden="true" />
          <h1>{variant.windowTitle}</h1>
          <div className="spacer" />
          <div className="winctl" aria-hidden="true">
            <span className="min"><i /></span>
            <span className="max"><i /></span>
            <span className="close">✕</span>
          </div>
        </div>

        <div className="menubar" aria-hidden="true">
          <span>Файл</span><span>Правка</span><span>Действия</span><span>Сервис</span><span>Справка</span>
        </div>

        <div className="toolbar" role="toolbar" aria-label="Действия">
          <button className="btn" onClick={runCompare} disabled={!canCompare}>
            <span className="sq green" />Сравнить данные
          </button>
          <button
            className="btn"
            onClick={exportToExcel}
            disabled={viewRows.length === 0}
            title="Сохранить показанные в таблице строки в Excel файл"
          >
            <span className="sq lime" />Экспорт в Excel
          </button>
          <div className="tb-sep" />
          <button className="btn" onClick={clearAll}>
            <span className="sq red" />Очистить всё
          </button>
          <button
            className="btn"
            onClick={createNewSession}
            title="Создать новую сессию для работы с другими данными"
          >
            <span className="sq blue" />Новая сессия
          </button>
          <div className="tb-sep" />
          <button
            className="btn pressed"
            onClick={handleVersionChange}
            title={`Переключить на ${variant.modeLabel(!isVersionTwo)}`}
          >
            <span className="sq" />Режим: {variant.modeLabel(isVersionTwo)}
          </button>
        </div>

        <div className="body">
          <nav className="sidebar" aria-label="Разделы">
            <div className="side-title">Разделы</div>
            <div className="side-item active" aria-current="page"><span className="sq" />Сравнение сумм</div>
            <div className="side-item"><span className="sq" />{variant.registrySection}</div>
            <div className="side-item"><span className="sq" />Полный свод</div>
            <div className="side-item"><span className="sq" />Сотрудники</div>
            <div className="side-item"><span className="sq" />Отчёты</div>
            <div className="side-sep" />
            <div className="side-item"><span className="sq" />Настройки</div>
            <div className="session">
              Сессия<br /><b>{sessionId || '—'}</b>
              {modifiedAt !== null && <><br />изменена {formatTime(modifiedAt)}</>}
            </div>
          </nav>

          <main className="content">
            {error && (
              <div className="note error" role="alert">
                <span className="sq" />
                <div>{error}</div>
              </div>
            )}
            {storageWarning && (
              <div className="note" role="status">
                <span className="sq" />
                <div>{STORAGE_WARNING}</div>
              </div>
            )}
            {inputsOpen && (
              <>
                {!error && !storageWarning && (
                  <div className="note">
                    <span className="sq" />
                    <div>
                      Данные вставляются из буфера обмена. Разделитель колонок — табуляция.
                      {variant.sumsDuplicates(isVersionTwo) && ' При совпадении ФИО в реестре суммы складываются.'}
                    </div>
                  </div>
                )}

                <div className="panels">
                  <section className="panel" aria-labelledby="registry-title">
                    <div className="panel-head">
                      <b id="registry-title">{variant.registryTitle}</b>
                      <button className="btn small" onClick={clearRegistry} title={variant.clearRegistryTitle}>Очистить</button>
                    </div>
                    <div className="panel-body">
                      <textarea
                        rows={6}
                        aria-labelledby="registry-title"
                        placeholder={variant.registryPlaceholder(isVersionTwo)}
                        value={registryText}
                        onChange={(e) => { setRegistryText(e.target.value); touch(); }}
                      />
                      <div className="hint">Формат: {variant.registryFormat(isVersionTwo)}</div>
                    </div>
                  </section>

                  <section className="panel" aria-labelledby="report-title">
                    <div className="panel-head">
                      <b id="report-title">Полный свод</b>
                      <button className="btn small" onClick={clearFullReport}>Очистить</button>
                    </div>
                    <div className="panel-body">
                      <textarea
                        rows={6}
                        aria-labelledby="report-title"
                        placeholder="Вставьте текст Полного свода (ФИО[Tab]Сумма)"
                        value={fullReportText}
                        onChange={(e) => { setFullReportText(e.target.value); touch(); }}
                      />
                      <div className="hint">Формат: ФИО [Tab] Сумма</div>
                    </div>
                  </section>
                </div>
              </>
            )}

            <div className="progress">
              <span className="progress-label">Сравнение:</span>
              <div className="progress-bar" role="presentation">
                <div className={`progress-fill${total > 0 ? '' : ' empty'}`} />
              </div>
              <span className="progress-text">
                {total > 0 ? `${total} из ${total} записей · ${formatElapsed(elapsedMs)}` : 'нет данных'}
              </span>
            </div>

            <div className="stats">
              {stats.map((card) => (
                <div className="stat" key={card.label}>
                  <div className="stat-label">{card.label}</div>
                  <div className={`stat-value tone-${card.tone}`}>{card.count}</div>
                </div>
              ))}
              <div className="stat">
                <div className="stat-label">Сумма разницы</div>
                <div className="stat-value">{formatAmount(parseFloat(sumDifferences(differences)))}</div>
              </div>
            </div>

            <section className="results" aria-label="Результат сравнения">
              <div className="results-head">
                <b>Результат сравнения</b>
                <span className="count" aria-live="polite">
                  {total > 0 ? `показано ${viewRows.length} из ${total}` : ''}
                </span>
                <div className="spacer" />
                <input
                  type="search"
                  className="search"
                  placeholder="Поиск по ФИО"
                  aria-label="Поиск по ФИО"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  className="btn small"
                  aria-pressed={filterMatches}
                  onClick={() => setFilterMatches(!filterMatches)}
                >
                  <span className={`sq${filterMatches ? ' checked' : ''}`} />
                  {filterMatches ? 'Показать совпадения' : 'Скрыть совпадения'}
                </button>
                <button
                  className="btn small"
                  aria-pressed={filterTerminated}
                  onClick={() => setFilterTerminated(!filterTerminated)}
                >
                  <span className={`sq${filterTerminated ? ' checked' : ''}`} />
                  {filterTerminated ? 'Показать' : 'Скрыть'} {variant.missingNoun}
                </button>
                <button
                  className="btn small"
                  aria-expanded={inputsOpen}
                  onClick={() => setInputsOpen(!inputsOpen)}
                  title="Скрыть или показать поля ввода, чтобы таблице хватило места"
                >
                  <span className={`sq${inputsOpen ? '' : ' checked'}`} />
                  {inputsOpen ? 'Свернуть ввод' : 'Показать ввод'}
                </button>
              </div>

              <div
                className="table-wrap"
                ref={scrollerRef}
                onScroll={(e) => setFirstRow(Math.floor(e.currentTarget.scrollTop / ROW_HEIGHT))}
              >
                <table className="grid">
                  <colgroup>
                    <col />
                    <col className="c-num" />
                    <col className="c-status" />
                  </colgroup>
                  <thead>
                    <tr>
                      {SORTABLE.map(({ key, label, className }) => (
                        <th
                          key={key}
                          className={className}
                          aria-sort={sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <button className="th-btn" onClick={() => setSort(nextSort(sort, key))} title="Сортировать">
                            {label}
                            <span className="sort-mark" aria-hidden="true">
                              {sort?.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                            </span>
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {viewRows.length === 0 && (
                      <tr className="empty-row">
                        <td colSpan={3}>
                          {total === 0
                            ? 'Нет данных. Вставьте данные в оба поля и нажмите «Сравнить данные».'
                            : 'Ничего не найдено: измените поиск или фильтры.'}
                        </td>
                      </tr>
                    )}
                    {spaceBefore > 0 && (
                      <tr className="space-row" aria-hidden="true"><td colSpan={3} style={{ height: spaceBefore }} /></tr>
                    )}
                    {shownRows.map((row, i) => {
                      const tone = statusTone(row.Статус);
                      return (
                        <tr key={rangeStart + i} className={`row-${tone}`}>
                          <td>
                            <input type="text" className="cell" value={row.ФИО} readOnly aria-label="ФИО" onClick={selectOnClick} />
                          </td>
                          <td>
                            <input type="text" className="cell num" value={formatAmount(row.Разница)} readOnly aria-label="Разница" onClick={selectOnClick} />
                          </td>
                          <td className={`status tone-${tone}`}>{row.Статус}</td>
                        </tr>
                      );
                    })}
                    {spaceAfter > 0 && (
                      <tr className="space-row" aria-hidden="true"><td colSpan={3} style={{ height: spaceAfter }} /></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {total > 0 && (
                <div className="totals">
                  <div className="totals-row info">
                    <b>Всего записей:</b>
                    <span>{viewRows.length}</span>
                  </div>
                  <div className="totals-row sum">
                    <b>Итоговая сумма разницы:</b>
                    <b>{formatAmount(parseFloat(sumDifferences(viewRows)))}</b>
                  </div>
                </div>
              )}
            </section>
          </main>
        </div>

        <div className="statusbar">
          <div>{submitted && total > 0 ? `Сравнение выполнено: ${formatDateTime(submitted.at)}` : 'Сравнение не выполнено'}</div>
          <div>Записей: {total}</div>
          <div>Режим: {variant.modeLabel(isVersionTwo)}</div>
          <div className="spacer" />
          <div className="last">{variant.footerTag}</div>
        </div>
      </div>
    </div>
  );
};

export default CompareTables;
