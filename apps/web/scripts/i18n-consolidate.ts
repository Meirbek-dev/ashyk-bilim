import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type LocaleCode = 'en-US' | 'kk-KZ' | 'ru-RU';
type LocaleConcept = 'submit' | 'saveDraft' | 'submitAgain' | 'awaitingGrade' | 'graded' | 'released';
type JsonRecord = Record<string, unknown>;

const root = process.cwd();
const messagesDir = join(root, 'messages');

const localeTargets: Record<LocaleCode, Record<string, string>> = {
  'en-US': {
    submit: 'Submit',
    saveDraft: 'Save draft',
    submitAgain: 'Submit again',
    awaitingGrade: 'Awaiting grade',
    graded: 'Graded',
    released: 'Released',
  },
  'kk-KZ': {
    submit: 'Жіберу',
    saveDraft: 'Нобайды сақтау',
    submitAgain: 'Қайта жіберу',
    awaitingGrade: 'Бағалауды күтуде',
    graded: 'Бағаланды',
    released: 'Жарияланды',
  },
  'ru-RU': {
    submit: 'Отправить',
    saveDraft: 'Сохранить черновик',
    submitAgain: 'Отправить снова',
    awaitingGrade: 'Ожидает оценки',
    graded: 'Оценено',
    released: 'Опубликовано',
  },
};

const valueGroups: Record<LocaleConcept, string[]> = {
  submit: ['Submit', 'Submit Assignment', 'Submit for grading', 'Confirm & Submit', 'Hand in'],
  saveDraft: ['Save', 'Save draft', 'Save progress'],
  submitAgain: ['Re-submit', 'Resubmit', 'Submit again'],
  awaitingGrade: ['Pending', 'Submitted', 'Awaiting', 'Awaiting grade'],
  graded: ['Graded', 'Marked'],
  released: ['Published', 'Released'],
};

const orphanKeys = new Set(['statusAwaitingPublication']);

function consolidateValue(value: string, locale: LocaleCode): string {
  const target = localeTargets[locale];
  const groups = Object.entries(valueGroups) as [LocaleConcept, string[]][];
  for (const [concept, variants] of groups) {
    if (variants.includes(value)) {
      const replacement = target[concept];
      if (replacement) return replacement;
    }
  }
  return value;
}

function walk(value: unknown, locale: LocaleCode): unknown {
  if (typeof value === 'string') return consolidateValue(value, locale);
  if (Array.isArray(value)) return value.map((item) => walk(item, locale));
  if (!value || typeof value !== 'object') return value;

  const next: JsonRecord = {};
  for (const [key, child] of Object.entries(value as JsonRecord)) {
    if (orphanKeys.has(key)) continue;
    next[key] = walk(child, locale);
  }
  return next;
}

function setCanonicalGradingTableLabels(messages: JsonRecord, locale: LocaleCode): void {
  const grading = messages.Grading;
  if (!grading || typeof grading !== 'object') return;
  const table = (grading as JsonRecord).Table;
  if (!table || typeof table !== 'object') return;

  const labels = localeTargets[locale];
  Object.assign(table as JsonRecord, {
    statusPending: labels.awaitingGrade,
    statusGraded: labels.graded,
    statusPublished: labels.released,
  });
}

for (const locale of Object.keys(localeTargets) as LocaleCode[]) {
  const filePath = join(messagesDir, `${locale}.json`);
  const messages = JSON.parse(readFileSync(filePath, 'utf8')) as JsonRecord;
  const consolidated = walk(messages, locale) as JsonRecord;
  setCanonicalGradingTableLabels(consolidated, locale);
  writeFileSync(filePath, `${JSON.stringify(consolidated, null, 2)}\n`);
}
