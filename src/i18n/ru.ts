// Every Russian string used by the app. Ported from reference/testtime.py so
// operator-facing wording matches the original tool. Arrays are indexed by
// intervalIndex (0..3).
//
// Grammar notes — Russian requires different ordinal forms depending on case:
//   - nominative ("1-ый") appears on interval buttons and in warnings
//   - genitive ("1-го")  appears in the "Воспроизведение X-го интервала..." status
// Both forms are seeded here so callers pick the correct one.
//
// One known "typo" from the Python is preserved verbatim in settingsIntervalRow
// (all entries end in "-й"). The customer has signed off on the current output,
// so we match it intentionally — see the behavioral-fixes discussion in the
// plan.

export const ru = {
  // ---- App chrome ----------------------------------------------------------
  appTitle: 'τ-тест хронометр',
  scaffoldPlaceholder:
    'Каркас приложения готов. Функциональность добавляется по фазам.',

  // ---- Ordinals (testtime.py:69, 198, 214, 293-298) ------------------------
  ordinalsNominative: ['1-ый', '2-ой', '3-ий', '4-ый'],
  ordinalsGenitive: ['1-го', '2-го', '3-го', '4-го'],

  // ---- Name entry (testtime.py:40, 53, 151) --------------------------------
  nameEntryInstruction: 'Для начала работы введите фамилию и подтвердите',
  nameEntryConfirm: 'Подтвердить',
  nameEntryError: 'Введите фамилию',

  // ---- Interval buttons (testtime.py:69) -----------------------------------
  intervalButtons: [
    'Запустить 1-ый интервал',
    'Запустить 2-ой интервал',
    'Запустить 3-ий интервал',
    'Запустить 4-ый интервал',
  ],

  // ---- Start / Stop (testtime.py:84, 177, 242, 263, 286) -------------------
  startButton: 'Пуск',
  stopButton: 'Стоп',

  // ---- Bottom-bar actions (testtime.py:96, 103) ----------------------------
  showResultsButton: 'Экспортировать результаты',
  showIntervalsButton: 'Отобразить интервалы',

  // ---- Settings dialog (testtime.py:109-146) -------------------------------
  settingsTitle: 'Настройка интервалов',
  settingsPrompt: 'Длительность интервалов (секунды):',
  // Preserved verbatim from testtime.py:124 — all four rows use "-й" in the
  // Python. Kept here so the web output matches the operator's expectations.
  settingsIntervalRow: [
    '1-й интервал:',
    '2-й интервал:',
    '3-й интервал:',
    '4-й интервал:',
  ],
  settingsUnitSeconds: 'сек.',
  settingsSave: 'Сохранить',
  settingsCancel: 'Отменить', // web-only (Python had no Cancel button)
  settingsError: 'Введите корректные положительные числа',

  // ---- Status line (testtime.py:168, 215, 234, 244, 266, 299, 306) --------
  statusChooseInterval: 'Выберите интервал для тестирования',
  // testtime.py:215 — f"Воспроизведение {genitive} интервала..."
  statusPlayingIntervalPrefix: 'Воспроизведение',
  statusPlayingIntervalSuffix: 'интервала...',
  statusReproduceInterval: 'Теперь попробуйте воспроизвести этот интервал',
  statusTimerStarted: 'Отсчет времени запущен',
  // testtime.py:266 — originally "Результат записан. (Тест {n}/20)"; the
  // trial counter is hidden so the test subject can't track progress.
  statusResultRecorded: 'Результат записан.',
  // testtime.py:299 — f"Выберите следующий интервал. Доступны: {list}"
  statusChooseNextPrefix: 'Выберите следующий интервал. Доступны:',
  statusAllComplete: 'Тест завершен! Все 20 интервалов пройдены.',

  // ---- Warnings / errors / info (testtime.py:143, 151, 199, 316-318, 373, 520)
  errorTitle: 'Ошибка',
  warningTitle: 'Предупреждение',
  infoTitle: 'Информация',
  completionTitle: 'Тест завершен',
  // testtime.py:199 — f"{nominative} интервал уже использован 5 раз"
  warningIntervalExhaustedSuffix: 'интервал уже использован 5 раз',
  completionMessage:
    'Вы прошли все 20 интервалов!\nНажмите «Экспортировать результаты» для просмотра.',
  infoNoResultsYet: 'Пока нет результатов для отображения',
  // testtime.py:520 — f"Не удалось сохранить файл: {e}"
  errorFileSavePrefix: 'Не удалось сохранить файл:',

  // ---- Web-only strings (not present in testtime.py) -----------------------
  newSessionButton: 'Новая сессия',
  reMeasureCancel: 'Отменить',
  reMeasureBanner: 'Идёт повторное измерение',
  reMeasureTooltip: 'Повторить измерение',
  partialExportConfirm: 'Экспортировать частичные результаты?',
  tooltipExportNoTrials: 'Экспорт доступен после первого измерения',
  tooltipIntervalExhausted: 'Этот интервал уже использован 5 раз',
  audioUnlockError: 'Не удалось инициализировать звук. Попробуйте ещё раз.',
  visibilityAbortError:
    'Измерение прервано: вкладка была свёрнута. Повторите попытку.',
  dismiss: 'Закрыть',
  errorBoundaryTitle: 'Произошла ошибка',
  errorBoundaryMessage:
    'Приложение столкнулось с непредвиденной ошибкой. Перезагрузите страницу, чтобы продолжить.',
  errorBoundaryReload: 'Перезагрузить страницу',
  errorBoundaryDetailsLabel: 'Подробности',
  gridEmptyCell: '—',
  statsMeanTauLabel: 'Среднее τ',
  statsSigmaLabel: 'σ',
  cyclesColumnCycle: 'Цикл',
  cyclesColumnValue: 'Значение',
  cyclesColumnAge: 'Возраст',
  noStatsYet: 'Статистика появится после первого измерения',

  // ---- Excel export (testtime.py:379, 388, 395, 412, 434, 449, 461, 470-471)
  excelSheetTitle: 'Результаты',
  excelHeaders: [
    'Интервал',
    'Попытка 1',
    'Попытка 2',
    'Попытка 3',
    'Попытка 4',
    'Попытка 5',
    'Сумма',
    'Тау (т)',
  ],
  excelIntervalRowLabels: [
    '2 секунды',
    '3 секунды',
    '4 секунды',
    '5 секунд',
  ],
  excelEmptyCell: '-',
  excelTotalRowLabel: 'Общее',
  excelStdDevRowLabel: 'Квадр. откл.',
  excelCyclesSectionHeader: 'Циклы (возраст)',
  excelCyclesColumnCycle: 'Цикл',
  excelCyclesColumnValues: 'Значения',
} as const;

export type RuStrings = typeof ru;
