type QuestionIdentifier = number | string;

interface OrderableQuestion {
  id?: number | string | null;
  question_uuid?: string | null;
  order_index?: number | null;
}

function normalizeIdentifier(value: QuestionIdentifier | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim();
  if (!normalized) return null;

  return normalized;
}

function questionKeys(question: OrderableQuestion): string[] {
  const keys = [normalizeIdentifier(question.id), normalizeIdentifier(question.question_uuid)];
  const uuid = normalizeIdentifier(question.question_uuid);

  if (uuid?.startsWith('question_')) {
    keys.push(uuid.slice('question_'.length));
  }

  return keys.filter((key): key is string => Boolean(key));
}

function compareByOrderIndex<T extends OrderableQuestion>(a: T, b: T): number {
  const aOrder = typeof a.order_index === 'number' ? a.order_index : Number.MAX_SAFE_INTEGER;
  const bOrder = typeof b.order_index === 'number' ? b.order_index : Number.MAX_SAFE_INTEGER;

  if (aOrder !== bOrder) return aOrder - bOrder;

  const aId = typeof a.id === 'number' ? a.id : Number.MAX_SAFE_INTEGER;
  const bId = typeof b.id === 'number' ? b.id : Number.MAX_SAFE_INTEGER;
  return aId - bId;
}

export function getOrderedExamQuestions<T extends OrderableQuestion>(
  questions: readonly T[] | null | undefined,
  questionOrder: readonly QuestionIdentifier[] | null | undefined,
): T[] {
  const availableQuestions = Array.isArray(questions) ? questions : [];
  if (availableQuestions.length === 0) return [];

  const questionsByKey = new Map<string, T>();
  for (const question of availableQuestions) {
    for (const key of questionKeys(question)) {
      if (!questionsByKey.has(key)) {
        questionsByKey.set(key, question);
      }
    }
  }

  const orderedQuestions: T[] = [];
  const seen = new Set<T>();

  for (const rawId of questionOrder ?? []) {
    const key = normalizeIdentifier(rawId);
    if (!key) continue;

    const question = questionsByKey.get(key);
    if (question && !seen.has(question)) {
      orderedQuestions.push(question);
      seen.add(question);
    }
  }

  if (orderedQuestions.length > 0) {
    return orderedQuestions;
  }

  return [...availableQuestions].sort(compareByOrderIndex);
}
