'use client'

import { Loader2, Plus } from 'lucide-react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@components/ui/select'
import { saveProfileDocument } from '@/lib/users/client'
import { useMemo, useState } from 'react'
import { hasErrorCode, isApiError } from '@/lib/api/assertSuccess'
import { useApiError } from '@/hooks/useApiError'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDndAnnouncements } from '@/hooks/useDndAnnouncements'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useMutation } from '@tanstack/react-query'
import * as v from 'valibot'
import { Button } from '@components/ui/button'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'

import { createEmptySection, getSectionTypesConfig, sectionMeta } from './types'
import type { ProfileData, ProfileSection, SectionKind } from './types'
import { createProfileSchema } from './schema'
import { SortableProfileSection } from './components/SortableProfileSection'
import { SectionEditor } from './components/SectionEditor'

/** One toast slot for save outcomes: a later success replaces a standing error (UX-269). */
const SAVE_TOAST_ID = 'profile-builder-save'
/** `profile.sections[3].links[0].url` → section 3. */
const SECTION_FIELD = /^profile\.sections\[(\d+)\]\./u
/** Characters of a section title a toast quotes (UX-305). */
const SECTION_NAME_MAX = 40

interface UserProfileBuilderProps {
  initialProfile: ProfileData
  /** `profile_version` from the read that produced `initialProfile` (BUG-367). */
  initialVersion: number | null
}

/**
 * The legacy profile builder (BUG-361): sections are edited locally and
 * saved as one `PATCH /users/me { profile }` under `If-Match`; the public
 * profile page renders the stored document.
 */
function UserProfileBuilder({ initialProfile, initialVersion }: UserProfileBuilderProps) {
  const router = useRouter()
  const tNotify = useTranslations('DashPage.Notifications')
  const t = useTranslations('DashPage.UserProfileBuilder')
  const tErrors = useTranslations('Errors')
  const { toastApiError } = useApiError()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const [profileData, setProfileData] = useState<ProfileData>(initialProfile)
  const [version, setVersion] = useState(initialVersion)
  const [selectedSection, setSelectedSection] = useState<number | null>(null)

  const sectionIds = useMemo(() => profileData.sections.map(s => s.id), [profileData.sections])
  const announcements = useDndAnnouncements(sectionIds)

  /**
   * UX-305: the toast wraps the name in «Раздел «…»», which a default title
   * («Раздел «Ссылки»») already is — name that one by its kind — and a long
   * title is clipped so the toast stays one line.
   */
  const sectionName = (section: ProfileSection) => {
    const kind = sectionMeta(t, section.type).label
    const title = section.title.trim()
    if (!title || title === t('EmptySections.defaultTitle', { sectionName: kind })) return kind
    const chars = [...title]
    if (chars.length <= SECTION_NAME_MAX) return title
    return `${chars
      .slice(0, SECTION_NAME_MAX - 1)
      .join('')
      .trimEnd()}…`
  }

  const save = useMutation({
    mutationFn: (profile: ProfileData) => saveProfileDocument(profile, version),
    onSuccess: newVersion => {
      setVersion(newVersion)
      router.refresh()
      toast.success(tNotify('profileUpdateSuccess'), { id: SAVE_TOAST_ID })
    },
    onError: error => {
      if (hasErrorCode(error, 'precondition-failed')) {
        toast.error(tNotify('profileStaleError'), { id: SAVE_TOAST_ID })
        return
      }
      // UX-269: a rule only the server checks names its field — open that section.
      const fieldError = isApiError(error) ? error.fieldErrors.find(e => SECTION_FIELD.test(e.field)) : undefined
      const index = Number(SECTION_FIELD.exec(fieldError?.field ?? '')?.[1])
      const section = profileData.sections[index]
      if (!fieldError || !section) {
        toastApiError(error, { fallback: tNotify('profileUpdateError'), toastId: SAVE_TOAST_ID })
        return
      }
      setSelectedSection(index)
      const message =
        fieldError.code === 'invalid' && /url$/iu.test(fieldError.field)
          ? tNotify('Form.invalidUrl')
          : tErrors.has(`fields.${fieldError.code}`)
            ? tErrors(`fields.${fieldError.code}`)
            : fieldError.message
      toast.error(t('Errors.sectionField', { section: sectionName(section), message }), {
        id: SAVE_TOAST_ID,
      })
    },
  })

  const addSection = (type: SectionKind) => {
    setProfileData(prev => {
      const sections = [...prev.sections, createEmptySection(t, type)]
      setSelectedSection(sections.length - 1)
      return { sections }
    })
  }

  const updateSection = (index: number, updated: ProfileSection) => {
    setProfileData(prev => ({ sections: prev.sections.map((s, i) => (i === index ? updated : s)) }))
  }

  const deleteSection = (index: number) => {
    setProfileData(prev => ({ sections: prev.sections.filter((_, i) => i !== index) }))
    setSelectedSection(null)
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const oldIndex = profileData.sections.findIndex(item => item.id === active.id)
    const newIndex = profileData.sections.findIndex(item => item.id === over.id)
    setProfileData(prev => ({ sections: arrayMove(prev.sections, oldIndex, newIndex) }))
    setSelectedSection(newIndex)
  }

  const handleSave = () => {
    const result = v.safeParse(createProfileSchema(tNotify), profileData)
    if (!result.success) {
      const issue = result.issues[0]
      const sectionIndex = issue.path?.[1]?.key
      if (typeof sectionIndex === 'number') setSelectedSection(sectionIndex)
      toast.error(issue.message, { id: SAVE_TOAST_ID })
      return
    }
    save.mutate(profileData)
  }

  const sectionTypes = getSectionTypesConfig(t)
  const selected = selectedSection === null ? undefined : profileData.sections[selectedSection]

  return (
    <Card className="mx-0 sm:mx-10">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h2 className="flex items-center text-xl font-semibold">{t('title')}</h2>
            <p className="text-muted-foreground">{t('description')}</p>
          </div>
          <Button variant="default" onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('savingButton')}
              </>
            ) : (
              t('saveButton')
            )}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <div className="col-span-1 border-r pr-4 max-lg:border-r-0 max-lg:border-b max-lg:pr-0 max-lg:pb-6">
            <h3 className="mb-4 font-medium">{t('SectionsPanel.title')}</h3>
            <DndContext
              id="profile-builder-sections"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
              accessibility={{ announcements }}
            >
              <div className="space-y-2">
                <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
                  {profileData.sections.map((section, index) => (
                    <SortableProfileSection
                      key={section.id}
                      section={section}
                      index={index}
                      t={t}
                      selectedSection={selectedSection}
                      setSelectedSection={setSelectedSection}
                      deleteSection={deleteSection}
                    />
                  ))}
                </SortableContext>
              </div>
            </DndContext>

            <div className="pt-4">
              <Select
                onValueChange={value => {
                  if (value) addSection(value as SectionKind)
                }}
                items={Object.entries(sectionTypes).map(([type, { label }]) => ({ value: type, label }))}
              >
                <SelectTrigger className="bg-primary hover:bg-primary/90 w-full border-0" withChevron={false}>
                  <div className="text-primary-foreground inline-flex items-center justify-center gap-2">
                    <Plus size={16} />
                    {t('SectionsPanel.addSectionButton')}
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(sectionTypes).map(([type, { icon: Icon, label, description }]) => (
                      <SelectItem key={type} value={type}>
                        <div className="flex items-center space-x-3 py-1">
                          <div className="bg-muted rounded-md p-1.5">
                            <Icon size={16} className="text-muted-foreground" />
                          </div>
                          <div className="flex-1">
                            <div className="text-foreground text-sm font-medium">{label}</div>
                            <div className="text-muted-foreground text-xs">{description}</div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="col-span-1 lg:col-span-3">
            {selectedSection !== null && selected ? (
              <SectionEditor
                t={t}
                section={selected}
                onChange={updated => {
                  updateSection(selectedSection, updated)
                }}
              />
            ) : (
              <div className="text-muted-foreground flex h-full items-center justify-center italic">
                {t('EmptyEditor.message')}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

export default UserProfileBuilder
