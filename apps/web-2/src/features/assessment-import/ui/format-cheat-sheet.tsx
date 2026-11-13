import { m } from '#/paraglide/messages'

const rowOne = [
  m.assessment_import_format_a1,
  m.assessment_import_format_c1,
  m.assessment_import_format_d1,
  m.assessment_import_format_e1,
  m.assessment_import_format_f1,
]
const questionRows = [
  m.assessment_import_format_a,
  m.assessment_import_format_b,
  m.assessment_import_format_c,
  m.assessment_import_format_d,
  m.assessment_import_format_e,
]

/** The format in short (docs/XLSX-TEST-IMPORT.md 4.1, 4.2), folded: most teachers bring a DOT file that already fits. */
export function FormatCheatSheet() {
  return (
    <details className="rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">{m.assessment_import_format_title()}</summary>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-medium">{m.assessment_import_format_row1()}</p>
          <ul className="flex list-disc flex-col gap-0.5 pl-5">
            {rowOne.map(line => (
              <li key={line()}>{line()}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1">
          <p className="font-medium">{m.assessment_import_format_rows()}</p>
          <ul className="flex list-disc flex-col gap-0.5 pl-5">
            {questionRows.map(line => (
              <li key={line()}>{line()}</li>
            ))}
          </ul>
        </div>
        <p className="text-muted-foreground">{m.assessment_import_format_bold()}</p>
      </div>
    </details>
  )
}
