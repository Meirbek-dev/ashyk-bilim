import { Download } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { m } from '#/paraglide/messages'
import { FileButton } from '#/shared/components/file-button'
import { decodeCsv } from '#/shared/lib/csv-text'
import { Button } from '#/shared/ui/button'

import type { TestForm } from '../model/body-form'
import { parseTestsFile, testsToCsv, testsToJson } from '../model/test-files'

const save = (text: string, type: string, name: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

type TestFilesBarProps = {
  tests: readonly TestForm[]
  onImport?: (tests: TestForm[]) => void
  /** A button that leads the row («Добавить пример»), so the case actions sit on one line. */
  lead?: ReactNode
}

/**
 * The cases to a JSON or CSV file and back (B-COD-25): imported cases join the list, saved with the item. Without
 * `onImport` (a locked challenge) only the exports.
 */
export function TestFilesBar({ tests, onImport, lead }: TestFilesBarProps) {
  const [error, setError] = useState<string | null>(null)
  const read = async (file: File) => {
    // A Russian Excel saves a plain «CSV» in Windows-1251: read the bytes as the class-list import does.
    const imported = parseTestsFile(file.name, decodeCsv(await file.arrayBuffer()))
    if (!imported?.length) return setError(m.code_cases_import_bad())
    setError(null)
    onImport?.(imported)
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        {lead}
        {onImport ? (
          <FileButton
            label={m.code_cases_import()}
            accept=".json,.csv,application/json,text/csv"
            onFile={file => void read(file)}
          />
        ) : null}
        {tests.length > 0 ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => save(testsToJson(tests), 'application/json', 'tests.json')}
            >
              <Download aria-hidden data-icon="inline-start" />
              {m.code_cases_export_json()}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => save(testsToCsv(tests), 'text/csv;charset=utf-8', 'tests.csv')}
            >
              <Download aria-hidden data-icon="inline-start" />
              {m.code_cases_export_csv()}
            </Button>
          </>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
