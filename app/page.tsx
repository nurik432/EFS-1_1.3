'use client';

import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { compareData, filterRows, sumDifferences } from '../lib/compare';
import type { ComparisonResult } from '../lib/compare';

interface Submitted {
  registryText: string;
  fullReportText: string;
  isVersionTwo: boolean;
}

const newSessionKey = () => 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);

const CompareTables = () => {
  const [registryText, setRegistryText] = useState<string>('');
  const [fullReportText, setFullReportText] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');
  const [filterMatches, setFilterMatches] = useState<boolean>(false);
  const [filterTerminated, setFilterTerminated] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [isVersionTwo, setIsVersionTwo] = useState<boolean>(false); // false = версия 1 (9 колонок реестра), true = версия 2 (сумма в 8-й колонке)
  // Снимок данных на момент нажатия «Сравнить данные»; результат считается из него
  const [submitted, setSubmitted] = useState<Submitted | null>(null);

  const { differences, compareError } = useMemo((): { differences: ComparisonResult[]; compareError: string } => {
    if (!submitted) {
      return { differences: [], compareError: '' };
    }
    try {
      return {
        differences: compareData(submitted.registryText, submitted.fullReportText, submitted.isVersionTwo),
        compareError: '',
      };
    } catch (e) {
      return {
        differences: [],
        compareError: e instanceof Error ? e.message : 'Произошла ошибка при сравнении данных',
      };
    }
  }, [submitted]);

  const error = compareError || actionError;

  const visibleRows = useMemo(
    () => filterRows(differences, { hideMatches: filterMatches, hideMissing: filterTerminated }),
    [differences, filterMatches, filterTerminated],
  );

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

    // Результаты сравнения больше не хранятся, они пересчитываются из данных
    localStorage.removeItem(getStorageKey('differences'));

    if (savedRegistryText) setRegistryText(savedRegistryText);
    if (savedFullReportText) setFullReportText(savedFullReportText);
    if (savedFilterMatches) setFilterMatches(savedFilterMatches === 'true');
    if (savedFilterTerminated) setFilterTerminated(savedFilterTerminated === 'true');
    if (savedIsVersionTwo) setIsVersionTwo(savedIsVersionTwo === 'true');

    // Если есть сохраненные данные, автоматически запускаем сравнение
    if (savedRegistryText && savedFullReportText) {
      setSubmitted({
        registryText: savedRegistryText,
        fullReportText: savedFullReportText,
        isVersionTwo: savedIsVersionTwo === 'true',
      });
    }
  }, [sessionId]);

  // Сохранение данных в localStorage при их изменении
  useEffect(() => {
    if (!sessionId) return;

    localStorage.setItem(getStorageKey('registryText'), registryText);
    localStorage.setItem(getStorageKey('fullReportText'), fullReportText);
    localStorage.setItem(getStorageKey('filterMatches'), String(filterMatches));
    localStorage.setItem(getStorageKey('filterTerminated'), String(filterTerminated));
    localStorage.setItem(getStorageKey('isVersionTwo'), String(isVersionTwo));
  }, [registryText, fullReportText, filterMatches, filterTerminated, sessionId, isVersionTwo]);

  const runCompare = () => {
    setActionError('');
    if (!registryText.trim() || !fullReportText.trim()) {
      setSubmitted(null);
      setActionError('Пожалуйста, заполните оба поля данных');
      return;
    }
    setSubmitted({ registryText, fullReportText, isVersionTwo });
  };

  // Обработчик изменения версии
  const handleVersionChange = () => {
    const next = !isVersionTwo;
    setIsVersionTwo(next);
    setActionError('');

    // Результаты сбрасываем и, если данные есть, сразу пересчитываем по новой версии
    if (registryText.trim() && fullReportText.trim()) {
      setSubmitted({ registryText, fullReportText, isVersionTwo: next });
    } else {
      setSubmitted(null);
    }
  };

  // Очистка реестра
  const clearRegistry = () => {
    setRegistryText('');
    localStorage.removeItem(getStorageKey('registryText'));
    if (!fullReportText.trim()) {
      setSubmitted(null);
    }
  };

  // Очистка полного свода
  const clearFullReport = () => {
    setFullReportText('');
    localStorage.removeItem(getStorageKey('fullReportText'));
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

  // Функция для экспорта данных в Excel
  const exportToExcel = () => {
    try {
      // Формируем данные для Excel из строк, видимых при текущих фильтрах
      const excelData = visibleRows.map(row => ({
        'ФИО': row.ФИО,
        'Разница': row.Разница,
        'Статус': row.Статус as string
      }));

      // Добавляем итоговую строку
      excelData.push({
        'ФИО': 'Итоговая сумма разницы:',
        'Разница': parseFloat(sumDifferences(visibleRows)),
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

  return (
    <div className="container py-4">
      <h1 className="mb-4">Сравнение Проверки расчетов НДФЛ и Полного свода</h1>

      {error && (
        <div className="alert alert-danger mb-4" role="alert">
          {error}
        </div>
      )}

      <div className="mb-4">
        <button
          className="btn btn-outline-secondary mb-2"
          onClick={handleVersionChange}
        >
          Переключить на {isVersionTwo ? 'Версия 1 (Реестр: ФИО + 8 колонок, Сумма в 9-й)' : 'Версия 2 (Реестр: ФИО в 1-й, Сумма в 8-й колонке)'}
        </button>
      </div>

      <div className="row mb-4">
        <div className="col-md-6">
          <div className="form-group">
            <label className="mb-2">Реестр:</label>
            <div className="d-flex mb-2">
              <button
                className="btn btn-outline-secondary btn-sm me-2"
                onClick={clearRegistry}
              >
                Очистить реестр
              </button>
            </div>
            <textarea
              className="form-control"
              rows={6}
              placeholder={`Вставьте текст Реестра (${isVersionTwo ? 'ФИО[Tab]...[Tab]Сумма (всего от 8 колонок, ФИО - 1-я, Сумма - 8-я)' : 'ФИО[Tab]...[Tab]Сумма (всего 9 колонок, ФИО - 1-я, Сумма - 9-я)'})`}
              value={registryText}
              onChange={(e) => setRegistryText(e.target.value)}
            />
            <small className="form-text text-muted">
              Формат: {isVersionTwo ? 'Для версии 2: ФИО - 1-я колонка, Сумма - 8-я колонка. Минимум 8 колонок.' : 'Для версии 1: ФИО - 1-я колонка, Сумма - 9-я колонка. Всего 9 колонок.'}
            </small>
          </div>
        </div>

        <div className="col-md-6">
          <div className="form-group">
            <label className="mb-2">Полный свод:</label>
            <div className="d-flex mb-2">
              <button
                className="btn btn-outline-secondary btn-sm me-2"
                onClick={clearFullReport}
              >
                Очистить полный свод
              </button>
            </div>
            <textarea
              className="form-control"
              rows={6}
              placeholder="Вставьте текст Полного свода (ФИО[Tab]Сумма)"
              value={fullReportText}
              onChange={(e) => setFullReportText(e.target.value)}
            />
            <small className="form-text text-muted">
              Формат: ФИО[Tab]Сумма
            </small>
          </div>
        </div>
      </div>

      <div className="mb-4 d-flex flex-wrap">
        <button
          className="btn btn-primary me-2 mb-2"
          onClick={runCompare}
          disabled={!registryText.trim() || !fullReportText.trim()}
        >
          Сравнить данные
        </button>

        <button
          className="btn btn-outline-danger me-2 mb-2"
          onClick={clearAll}
        >
          Очистить все
        </button>

        <button
          className="btn btn-outline-info me-2 mb-2"
          onClick={createNewSession}
          title="Создать новую сессию для работы с другими данными"
        >
          Новая сессия
        </button>

        {/* Новая кнопка для экспорта в Excel */}
        <button
          className="btn btn-success mb-2"
          onClick={exportToExcel}
          disabled={differences.length === 0}
          title="Сохранить результаты в Excel файл"
        >
          <i className="bi bi-file-earmark-excel me-1"></i>
          Экспорт в Excel
        </button>
      </div>

      <div className="mb-4">
        <button
          className="btn btn-secondary me-2 mb-2"
          onClick={() => setFilterMatches(!filterMatches)}
        >
          {filterMatches ? 'Показать совпадения' : 'Скрыть совпадения'}
        </button>
        <button
          className="btn btn-danger mb-2"
          onClick={() => setFilterTerminated(!filterTerminated)}
        >
          {filterTerminated ? 'Показать отсутствующие' : 'Скрыть отсутствующие'}
        </button>
      </div>

      {differences.length > 0 && (
        <div className="table-responsive">
          <table className="table table-striped table-bordered">
            <thead className="table-dark">
              <tr>
                <th>ФИО</th>
                <th>Разница</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr
                  key={index}
                  className={row.Статус === 'Нет в Реестре' || row.Статус === 'Нет в Своде' ? 'table-danger' : row.Разница === 0 ? 'table-success' : 'table-warning'}
                >
                  <td>
                    <input
                      type="text"
                      value={row.ФИО}
                      readOnly
                      className="form-control"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.Разница.toFixed(2)}
                      readOnly
                      className="form-control"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                  </td>
                  <td>{row.Статус}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="table-info">
                <td>
                  <strong>Всего записей:</strong>
                </td>
                <td colSpan={2}>
                  {visibleRows.length}
                </td>
              </tr>
              <tr className="table-danger">
                <td>
                  <strong>Итоговая сумма разницы:</strong>
                </td>
                <td colSpan={2}>
                  {sumDifferences(visibleRows)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default CompareTables;
