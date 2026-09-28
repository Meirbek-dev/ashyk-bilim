'use client'

import { Loader2, Plus } from 'lucide-react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@components/ui/select'
import { updateProfile } from '@/lib/users/client'
import { useMemo, useState } from 'react'
import { useSession } from '@/hooks/useSession'
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

import { createEmptySection, getSectionTypesConfig } from './types'
import type { ProfileData, ProfileSection, SectionKind } from './types'
import { createProfileSchema } from './schema'
import { SortableProfileSection } from './components/SortableProfileSection'
import { SectionEditor } from './components/SectionEditor'

/**
 * The legacy profile builder (BUG-361): sections are edited locally and
 * saved as one `PATCH /users/me { profile }`; the public profile page renders
 * the stored document.
 */
function UserProfileBuilder() {
  const router = useRouter()
  const { user: me } = useSession()
  const tNotify = useTranslations('DashPage.Notifications')
  const t = useTranslations('DashPage.UserProfileBuilder')
  const { toastApiError } = useApiError()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const [profileData, setProfileData] = useState<ProfileData>(() => ({ sections: me?.profile?.sections ?? [] }))
  const [selectedSection, setSelectedSection] = useState<number | null>(null)

  const sectionIds = useMemo(() => profileData.sections.map(s => s.id), [profileData.sections])
  const announcements = useDndAnnouncements(sectionIds)

  const save = useMutation({
    mutationFn: (profile: ProfileData) => updateProfile({ profile }),
    onSuccess: () => {
      router.refresh()
      toast.success(tNotify('profileUpdateSuccess'))
    },
    onError: error => {
      toastApiError(error, { fallback: tNotify('profileUpdateError') })
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
      toast.error(issue.message)
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
