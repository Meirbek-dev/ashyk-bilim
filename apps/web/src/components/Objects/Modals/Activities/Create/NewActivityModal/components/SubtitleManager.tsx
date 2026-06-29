import { useState, useId } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { CheckCircle2, ChevronDown, Info, Languages, Loader2, Plus, Trash2, UploadCloud } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { cn, generateUUID } from '@/lib/utils'
import { constructAcceptValue } from '@/lib/constants'
import { toast } from 'sonner'

const SUPPORTED_SUBTITLE_FILES = constructAcceptValue(['srt', 'vtt'])

export interface SubtitleFile {
  id: string
  file: File
  language: string
  label: string
}

interface SubtitleManagerProps {
  subtitles: SubtitleFile[]
  setSubtitles: (subtitles: SubtitleFile[]) => void
  t: AppTranslator
}

const getLocalizedLanguageOptions = (t: AppTranslator) => [
  { code: 'en', label: t('languageEnglish'), flag: '🇺🇸' },
  { code: 'ru', label: t('languageRussian'), flag: '🇷🇺' },
  { code: 'kz', label: t('languageKazakh'), flag: '🇰🇿' },
  { code: 'fr', label: t('languageFrench'), flag: '🇫🇷' },
  { code: 'es', label: t('languageSpanish'), flag: '🇪🇸' },
  { code: 'de', label: t('languageGerman'), flag: '🇩🇪' },
]

export function SubtitleManager({ subtitles, setSubtitles, t }: SubtitleManagerProps) {
  const [dragOver, setDragOver] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([])

  function validateSubtitleFile(file: File): { valid: boolean; error?: string } {
    if (!(file.name.toLowerCase().endsWith('.srt') || file.name.toLowerCase().endsWith('.vtt'))) {
      return { valid: false, error: t('errorSubtitleFileType') }
    }
    if (file.size > 5 * 1024 * 1024) {
      return { valid: false, error: t('errorSubtitleFileSize') }
    }
    const fileName = file.name.toLowerCase()
    const potentialLang = fileName.split('.').slice(-2, -1)[0]
    const existingLang = subtitles.find(s => s.language === potentialLang || s.file.name.toLowerCase() === fileName)
    if (existingLang) {
      return {
        valid: false,
        error: t('errorSubtitleLanguageExists', { language: potentialLang ?? fileName }),
      }
    }
    return { valid: true }
  }

  async function addSubtitle(file: File, language: string, label: string) {
    const validation = validateSubtitleFile(file)
    if (!validation.valid) {
      toast.error(validation.error || t('errorInvalidSubtitleFile'))
      return
    }
    const fileId = generateUUID()
    setUploadingFiles(prev => [...prev, fileId])
    try {
      setSubtitles([...subtitles, { id: fileId, file, language, label }])
      toast.success(t('successSubtitleAdded', { label }))
    } catch {
      toast.error(t('errorFailedToAddSubtitle'))
    } finally {
      setUploadingFiles(prev => prev.filter(id => id !== fileId))
    }
  }

  function removeSubtitle(id: string) {
    const subtitleToRemove = subtitles.find(s => s.id === id)
    setSubtitles(subtitles.filter(subtitle => subtitle.id !== id))
    if (subtitleToRemove) {
      toast.success(t('successSubtitleRemoved', { label: subtitleToRemove.label }))
    }
  }

  function updateSubtitle(id: string, language: string, label: string) {
    setSubtitles(subtitles.map(s => (s.id === id ? { ...s, language, label } : s)))
    toast.success(t('successSubtitleLanguageUpdated'))
  }

  function handleSubtitleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files || [])]
    if (files.length === 0) return
    files.forEach(file => {
      const fileName = file.name.toLowerCase()
      const parts = fileName.split('.')
      const potentialLang = parts.length > 2 ? parts[parts.length - 2] : ''
      const detectedLang = getLocalizedLanguageOptions(t).find(
        lang => lang.code === potentialLang || fileName.includes(lang.code),
      )
      addSubtitle(file, detectedLang?.code ?? 'en', detectedLang?.label ?? t('languageEnglish'))
    })
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragOver(false)
    const files = [...event.dataTransfer.files]
    const subtitleFiles = files.filter(
      file => file.name.toLowerCase().endsWith('.srt') || file.name.toLowerCase().endsWith('.vtt'),
    )
    if (subtitleFiles.length === 0) {
      toast.error(t('errorDropSubtitleFilesOnly'))
      return
    }
    if (subtitleFiles.length > 5) {
      toast.error(t('errorMaxSubtitleFiles'))
      return
    }
    subtitleFiles.forEach(file => {
      const fileName = file.name.toLowerCase()
      const parts = fileName.split('.')
      const potentialLang = parts.length > 2 ? parts[parts.length - 2] : ''
      const detectedLang = getLocalizedLanguageOptions(t).find(
        lang => lang.code === potentialLang || fileName.includes(lang.code),
      )
      addSubtitle(file, detectedLang?.code ?? 'en', detectedLang?.label ?? t('languageEnglish'))
    })
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragOver(false)
  }

  const fileInputId = `subtitle-upload-${useId()}`

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">{t('subtitles')}</span>
          {subtitles.length > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-100 px-1.5 text-xs font-medium text-gray-600">
              {subtitles.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {subtitles.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSubtitles([])
                toast.success(t('successAllSubtitlesRemoved'))
              }}
              className="h-7 px-2 text-xs text-gray-400 hover:text-red-500"
            >
              {t('clearAll')}
            </Button>
          )}
          <input
            type="file"
            accept={SUPPORTED_SUBTITLE_FILES}
            onChange={handleSubtitleUpload}
            className="hidden"
            id={fileInputId}
            multiple
            aria-label={t('ariaUploadSubtitleFile')}
          />
          <Label
            htmlFor={fileInputId}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Plus size={13} />
            {t('addSubtitle')}
          </Label>
        </div>
      </div>

      {/* Drop Zone */}
      <div
        className={cn(
          'relative rounded-lg border-2 border-dashed transition-colors duration-150',
          dragOver
            ? 'border-blue-300 bg-blue-50/40'
            : subtitles.length === 0
              ? 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
              : 'border-gray-200 hover:border-gray-300',
          subtitles.length === 0 ? 'p-8' : 'p-3',
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {dragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-blue-50/80">
            <p className="text-sm font-medium text-blue-600">{t('dropSubtitleFilesHere')}</p>
          </div>
        )}

        {subtitles.length === 0 ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <UploadCloud size={20} className="text-gray-300" />
            <p className="text-sm text-gray-500">{t('noSubtitlesYet')}</p>
            <p className="text-xs text-gray-400">{t('dragDropSubtitlesInstruction')}</p>
            <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <CheckCircle2 size={11} />
                {t('subtitleFormatsSupported')}
              </span>
              <span className="flex items-center gap-1">
                <Info size={11} />
                {t('subtitleFileSizeLimit')}
              </span>
            </div>
          </div>
        ) : (
          <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <UploadCloud size={12} />
            {t('dragAdditionalSubtitles')}
          </p>
        )}
      </div>

      {/* Processing indicator */}
      <AnimatePresence>
        {uploadingFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 text-xs text-gray-500"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>{t('processingFiles', { count: uploadingFiles.length })}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtitle List */}
      <AnimatePresence>
        {subtitles.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white"
          >
            {subtitles.map(subtitle => (
              <motion.div
                key={subtitle.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="group flex items-center gap-3 px-3 py-2.5"
              >
                <Languages size={14} className="shrink-0 text-gray-300" />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-700" title={subtitle.file.name}>
                  {subtitle.file.name}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="outline" size="sm" className="h-6 gap-1 border-gray-200 px-2 text-xs">
                        <span>
                          {getLocalizedLanguageOptions(t).find(lang => lang.code === subtitle.language)?.flag}
                        </span>
                        {subtitle.label}
                        <ChevronDown size={10} className="opacity-40" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-44">
                    {getLocalizedLanguageOptions(t).map(lang => (
                      <DropdownMenuItem
                        key={lang.code}
                        onClick={() => updateSubtitle(subtitle.id, lang.code, lang.label)}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span>{lang.flag}</span>
                        {lang.label}
                        {subtitle.language === lang.code && (
                          <CheckCircle2 size={13} className="ml-auto text-blue-600" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <span className="text-xs text-gray-400 tabular-nums">{(subtitle.file.size / 1024).toFixed(0)} KB</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSubtitle(subtitle.id)}
                  className="h-6 w-6 p-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                  aria-label={t('removeSubtitleAriaLabel', {
                    filename: subtitle.file.name,
                  })}
                >
                  <Trash2 size={13} />
                </Button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
