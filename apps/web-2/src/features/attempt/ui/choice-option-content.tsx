import { m } from '#/paraglide/messages'
import type { ChoiceOption } from '#/shared/api/gen/types.gen'
import { ItemMedia } from '#/shared/components/item-media'

type OptionProps = { option: ChoiceOption; number: number; src: (uploadId: string) => string }

/**
 * An option's text as typed (options are never markdown): a multi-line one is code from a spreadsheet and keeps its
 * lines in a monospace block. Its picture below; without its own alt text it says which option it is.
 */
export function ChoiceOptionContent({ option, number, src }: OptionProps) {
  const text = option.text ?? ''
  const media = option.media ? [{ ...option.media, alt: option.media.alt || m.attempt_option_image({ number }) }] : []
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {text ? (
        <span
          className={
            text.includes('\n')
              ? 'font-mono text-sm wrap-anywhere whitespace-pre-wrap'
              : 'wrap-anywhere whitespace-pre-wrap'
          }
        >
          {text}
        </span>
      ) : null}
      {/* Inside the option's label: no zoom button there (a second control of the label). */}
      <ItemMedia media={media} src={src} zoom={false} />
    </div>
  )
}
