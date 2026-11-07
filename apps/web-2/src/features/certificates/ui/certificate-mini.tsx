import { paper } from './certificate-paper'

/** The sheet in miniature, where a list of certificates names them: a thing to recognise, with no words on it. */
export function CertificateMini({ className }: { className?: string }) {
  return (
    <div aria-hidden data-dye="sheet" className={`${paper} aspect-4/3 ${className ?? ''}`}>
      <div data-dye="ink" className="ab-dye h-1/4" />
      <div className="flex flex-1 flex-col items-center justify-center gap-[8cqw]">
        <span className="h-[5cqw] w-1/2 bg-current" />
        <span className="h-[2.5cqw] w-2/3 bg-current opacity-40" />
        <span className="h-[2.5cqw] w-2/5 bg-current opacity-40" />
      </div>
    </div>
  )
}
