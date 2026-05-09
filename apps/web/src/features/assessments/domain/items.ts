export type UnifiedItemKind = 'CHOICE' | 'OPEN_TEXT' | 'FILE_UPLOAD' | 'FORM' | 'CODE' | 'MATCHING';

export interface ChoiceOption {
  id: string;
  text: string;
  is_correct: boolean;
}

export interface MatchPair {
  left: string;
  right: string;
}

export interface FormField {
  id: string;
  label: string;
  field_type: 'text' | 'textarea' | 'number' | 'date';
  required: boolean;
}

export interface CodeTestCase {
  id: string;
  input: string;
  expected_output: string;
  is_visible: boolean;
  weight: number;
  description?: string | null;
}

export type ItemBody =
  | {
      kind: 'CHOICE';
      prompt: string;
      options: ChoiceOption[];
      multiple: boolean;
      variant?: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | null;
      explanation?: string | null;
    }
  | { kind: 'OPEN_TEXT'; prompt: string; min_words?: number | null; rubric?: string | null }
  | { kind: 'FILE_UPLOAD'; prompt: string; max_files: number; max_mb?: number | null; mimes: string[] }
  | { kind: 'FORM'; prompt: string; fields: FormField[] }
  | {
      kind: 'CODE';
      prompt: string;
      languages: number[];
      starter_code: Record<string, string>;
      tests: CodeTestCase[];
      time_limit_seconds?: number | null;
      memory_limit_mb?: number | null;
    }
  | { kind: 'MATCHING'; prompt: string; pairs: MatchPair[]; explanation?: string | null };

export type ItemAnswer =
  | { kind: 'CHOICE'; selected: string[] }
  | { kind: 'OPEN_TEXT'; text: string }
  | { kind: 'FILE_UPLOAD'; uploads: { upload_uuid: string; filename?: string }[] }
  | { kind: 'FORM'; values: Record<string, string> }
  | { kind: 'CODE'; language: number; source: string; latest_run?: { passed: number; total: number; score?: number } }
  | { kind: 'MATCHING'; matches: MatchPair[] };

export interface AssessmentItem {
  id: number;
  item_uuid: string;
  order: number;
  kind: UnifiedItemKind;
  title: string;
  body: ItemBody;
  max_score: number;
  created_at: string;
  updated_at: string;
}

export function isAnswered(answer: ItemAnswer | null | undefined): boolean {
  if (!answer) return false;
  switch (answer.kind) {
    case 'CHOICE': {
      return answer.selected.length > 0;
    }
    case 'OPEN_TEXT': {
      return answer.text.trim().length > 0;
    }
    case 'FILE_UPLOAD': {
      return answer.uploads.length > 0;
    }
    case 'FORM': {
      return Object.values(answer.values).some((value) => value.trim().length > 0);
    }
    case 'CODE': {
      return answer.source.trim().length > 0;
    }
    case 'MATCHING': {
      return answer.matches.length > 0;
    }
  }
}
