'use client'

import type { ButtonHTMLAttributes, FC, HTMLAttributes, ReactNode } from 'react'
import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Upload } from 'lucide-react'

import { cn } from '@/lib/utils'

interface FileUploadBlockInputProps {
  /** MIME allowlist (`accept`); a dropped file outside it is ignored. */
  accept: string
  onFileSelect: (file: File | null) => void
  /** The chosen file, echoed back in the zone. */
  file: File | null
  /** Format/size hint under the prompt. */
  hint: string
  ariaLabel?: string
}

/**
 * UX-147: the same dropzone as the image block — a hidden native input
 * behind a click/drop area with localized copy (the bare `<input type=file>`
 * showed «Choose File / No file chosen» in the browser language).
 */
const FileUploadBlockInput: FC<FileUploadBlockInputProps> = ({ accept, onFileSelect, file, hint, ariaLabel }) => {
  const t = useTranslations('DashPage.Editor.FileUploadBlock')
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const allowed = accept.split(',')
  const select = (candidate: File | null | undefined) => {
    onFileSelect(candidate && allowed.includes(candidate.type) ? candidate : null)
  }
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel || t('selectFile')}
      onClick={() => inputRef.current?.click()}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
      }}
      onDrop={e => {
        e.preventDefault()
        setIsDragOver(false)
        select(e.dataTransfer.files[0])
      }}
      onDragOver={e => {
        e.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      className={cn(
        'flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-6 py-4 text-center transition-colors',
        isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={e => select(e.target.files?.[0])}
        className="hidden"
      />
      <p className="text-sm font-medium text-gray-700">{file ? file.name : t('dropOrClick')}</p>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  )
}

const FileUploadBlockButton: FC<ButtonHTMLAttributes<HTMLButtonElement>> = ({ onClick, className, ...props }) => {
  const t = useTranslations('DashPage.Editor.FileUploadBlock')
  return (
    <button
      className={cn(
        'flex items-center space-x-2 rounded-lg bg-gray-200 p-2 px-3 text-gray-500 transition enabled:hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      onClick={onClick}
      {...props}
    >
      <Upload />
      <p>{t('submit')}</p>
    </button>
  )
}

type UploadBlockComponentProps = {
  isLoading: boolean
  isEditable: boolean
  isEmpty: boolean
  Icon: AppIcon
  children: ReactNode
} & HTMLAttributes<HTMLDivElement>

function FileUploadBlock({ isLoading, isEditable, isEmpty, Icon, children }: UploadBlockComponentProps) {
  const t = useTranslations('DashPage.Editor.FileUploadBlock')

  if (isLoading) {
    return <Loader2 className="animate-spin text-gray-200" size={50} />
  }

  if (!isEditable && isEmpty) {
    return (
      <div className="flex items-center gap-5">
        <Icon className="text-gray-200" size={50} />
        <p>{t('noFilePreview')}</p>
      </div>
    )
  }

  return (
    <>
      <Icon className="text-gray-200" size={50} />
      {children}
    </>
  )
}

function FileUploadBlockWrapper({ children, isEmpty, ...props }: UploadBlockComponentProps) {
  return (
    isEmpty && (
      <div
        className="border-gray-150 flex items-center justify-center space-x-3 rounded-xl border-2 border-dashed bg-gray-50 px-3 py-7 text-sm text-gray-900"
        contentEditable={false}
      >
        <FileUploadBlock isEmpty {...props}>
          {children}
        </FileUploadBlock>
      </div>
    )
  )
}

export { FileUploadBlockWrapper as FileUploadBlock, FileUploadBlockButton, FileUploadBlockInput }
