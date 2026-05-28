interface QuestionLike {
  id: string | number
  question_uuid: string
  order_index?: number
}

/**
 * Returns questions reordered according to `orderedIds`.
 *
 * Matching strategy (first match wins):
 *  1. Numeric id equality (converts string ids like '20' to match numeric id 20)
 *  2. String equality between orderedId and question.id
 *  3. Exact question_uuid match
 *  4. question_uuid with 'question_' prefix stripped matches orderedId (or vice-versa)
 *
 * Fallback: when `orderedIds` is null or no questions are matched,
 * questions are returned sorted by `order_index` (ascending).
 * When `orderedIds` is null, original array order is preserved.
 */
export function getOrderedExamQuestions<T extends QuestionLike>(
  questions: T[],
  orderedIds: (string | number)[] | null,
): T[] {
  const sortedByOrderIndex = (): T[] =>
    [...questions].toSorted((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

  if (orderedIds === null) {
    return [...questions]
  }

  if (orderedIds.length === 0) {
    return sortedByOrderIndex()
  }

  const findQuestion = (id: string | number): T | undefined => {
    const idStr = String(id)
    const idNum = Number(id)
    const normalizedId = idStr.replace(/^question_/, '')

    return questions.find(q => {
      if (!Number.isNaN(idNum) && idNum === Number(q.id)) return true
      if (idStr === String(q.id)) return true
      if (idStr === q.question_uuid) return true
      if (q.question_uuid.replace(/^question_/, '') === normalizedId) return true
      return false
    })
  }

  const seen = new Set<T>()
  const ordered: T[] = []

  for (const id of orderedIds) {
    const question = findQuestion(id)
    if (question && !seen.has(question)) {
      seen.add(question)
      ordered.push(question)
    }
  }

  if (ordered.length === 0) {
    return sortedByOrderIndex()
  }

  return ordered
}
