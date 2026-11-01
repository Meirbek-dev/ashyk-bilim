import { m } from '#/paraglide/messages'

/** CodeMirror's own words (search panel, folds, completions) in the page's language (B-COD-33). */
export const phrases = (): Record<string, string> => ({
  Find: m.code_cm_find(),
  Replace: m.code_cm_replace(),
  next: m.code_cm_next(),
  previous: m.code_cm_previous(),
  all: m.code_cm_all(),
  'match case': m.code_cm_match_case(),
  regexp: m.code_cm_regexp(),
  'by word': m.code_cm_by_word(),
  replace: m.code_cm_replace_one(),
  'replace all': m.code_cm_replace_all(),
  close: m.code_cm_close(),
  'Go to line': m.code_cm_go_to_line(),
  go: m.code_cm_go(),
  'Fold line': m.code_cm_fold(),
  'Unfold line': m.code_cm_unfold(),
  'folded code': m.code_cm_folded(),
  unfold: m.code_cm_unfold(),
  Completions: m.code_cm_completions(),
})
