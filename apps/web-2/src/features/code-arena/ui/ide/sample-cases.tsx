import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CodeTestCase } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'

import { Io } from '../io'

/** The visible tests in the console (B-COD-29): one at a time, picked by its number, input over expected output. */
export function SampleCases({ samples }: { samples: CodeTestCase[] }) {
  const [picked, setPicked] = useState(0)
  const sample = samples[Math.min(picked, samples.length - 1)]
  if (!sample) return <p className="text-sm text-muted-foreground">{m.code_samples_none()}</p>
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <fieldset className="flex flex-wrap gap-1">
        <legend className="sr-only">{m.code_samples()}</legend>
        {samples.map((test, index) => (
          <Button
            key={test.id}
            size="sm"
            variant={test === sample ? 'secondary' : 'ghost'}
            aria-pressed={test === sample}
            onClick={() => setPicked(index)}
          >
            {test.description || m.code_sample({ number: index + 1 })}
          </Button>
        ))}
      </fieldset>
      <Io label={m.code_io_input()} text={sample.input ?? ''} />
      <Io label={m.code_io_expected()} text={sample.expected_output ?? ''} />
    </div>
  )
}
