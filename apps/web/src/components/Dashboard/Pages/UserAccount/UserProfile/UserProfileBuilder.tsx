'use client'

import { Loader2, Plus } from 'lucide-react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@components/ui/select'
import { updateProfile } from '@/lib/users/client'
import { useMemo, useState } from 'react'
import { useSession } from '@/hooks/useSession'
import type { SessionUser } from '@/lib/auth/types'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDndAnnouncements } from '@/hooks/useDndAnnouncements'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@components/ui/button'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'

import { getSectionTypesConfig } from './types'
import type { SECTION_TYPE_KEYS, ProfileData, ProfileSection } from './types'
import { SortableProfileSection } from './components/SortableProfileSection'
import { SectionEditor } from './components/SectionEditor'

const UserProfileBuilder = () => {
  const router = useRouter()
  const { user: currentUser } = useSession()
  const me = currentUser
  const tNotify = useTranslations('DashPage.Notifications')
  const t = useTranslations('DashPage.UserProfileBuilder')

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor),
  )

  const [profileData, setProfileData] = useState<ProfileData>({
    sections: [],
  })
  const [selectedSection, setSelectedSection] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const sectionIds = useMemo(() => profileData.sections.map(s => s.id), [profileData.sections])
  const announcements = useDndAnnouncements(sectionIds)

  // Track the user we have initialized from.
  const [prevMe, setPrevMe] = useState<SessionUser | null>(null)

  if (me && me !== prevMe) {
    setPrevMe(me)
    if (me.profile) {
      try {
        const profileSections = typeof me.profile === 'string' ? JSON.parse(me.profile).sections : me.profile.sections

        setProfileData({
          sections: profileSections || [],
        })
      } catch (error) {
        console.error('Error parsing profile data:', error)
        setProfileData({ sections: [] })
      }
    } else {
      setProfileData({ sections: [] })
    }
    setIsLoading(false)
  }

  const createEmptySection = (translateFn: AppTranslator, type: keyof typeof SECTION_TYPE_KEYS): ProfileSection => {
    const sectionTypesConfig = getSectionTypesConfig(translateFn)
    const baseSection = {
      id: `section-${Date.now()}`,
      type,
      title: t('EmptySections.defaultTitle', {
        sectionName: sectionTypesConfig[type].label,
      }),
    }

    switch (type) {
      case 'image-gallery': {
        return {
          ...baseSection,
          type: 'image-gallery',
          images: [],
        }
      }
      case 'text': {
        return {
          ...baseSection,
          type: 'text',
          content: '',
        }
      }
      case 'links': {
        return {
          ...baseSection,
          type: 'links',
          links: [],
        }
      }
      case 'skills': {
        return {
          ...baseSection,
          type: 'skills',
          skills: [],
        }
      }
      case 'experience': {
        return {
          ...baseSection,
          type: 'experience',
          experiences: [],
        }
      }
      case 'education': {
        return {
          ...baseSection,
          type: 'education',
          education: [],
        }
      }
      case 'affiliation': {
        return {
          ...baseSection,
          type: 'affiliation',
          affiliations: [],
        }
      }
      case 'courses': {
        return {
          ...baseSection,
          type: 'courses',
        }
      }
      case 'gamification': {
        return {
          ...baseSection,
          type: 'gamification',
          settings: {
            showLevel: true,
            showXP: true,
            showStreaks: true,
            showLeaderboard: false,
          },
        }
      }
    }
  }

  const addSection = (type: keyof typeof SECTION_TYPE_KEYS) => {
    setProfileData(prev => {
      const newSection = createEmptySection(t, type)
      const newSections = [...prev.sections, newSection]
      setSelectedSection(newSections.length - 1)
      return {
        ...prev,
        sections: newSections,
      }
    })
  }

  const updateSection = (index: number, updatedSection: ProfileSection) => {
    const newSections = [...profileData.sections]
    newSections[index] = updatedSection
    setProfileData(prev => ({
      ...prev,
      sections: newSections,
    }))
  }

  const deleteSection = (index: number) => {
    setProfileData(prev => ({
      ...prev,
      sections: prev.sections.filter((_, i) => i !== index),
    }))
    setSelectedSection(null)
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const items = [...profileData.sections]
    const oldIndex = items.findIndex(item => item.id === active.id)
    const newIndex = items.findIndex(item => item.id === over.id)

    const reorderedItems = arrayMove(items, oldIndex, newIndex)

    setProfileData(prev => ({
      ...prev,
      sections: reorderedItems,
    }))
    setSelectedSection(newIndex)
  }

  const handleSave = async () => {
    setIsSaving(true)
    const loadingToast = toast.loading(tNotify('savingProfile'))

    try {
      if (!currentUser?.id) {
        throw new Error('User not found')
      }

      // Update only the profile field
      const userData = {
        ...me,
        profile: profileData,
      }

      const res = await updateProfile(userData, currentUser.id)

      if (res.status === 200) {
        router.refresh()
        toast.success(tNotify('profileUpdateSuccess'), { id: loadingToast })
      } else {
        toast.error(tNotify('profileUpdateFailed'), { id: loadingToast })
      }
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error(tNotify('profileUpdateFailed'), { id: loadingToast })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <Card className="mx-0 sm:mx-10">
        <div className="flex min-h-[400px] items-center justify-center p-6">
          <Loader2 className="text-primary h-8 w-8 animate-spin" />
        </div>
      </Card>
    )
  }

  return (
    <Card className="mx-0 sm:mx-10">
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h2 className="flex items-center text-xl font-semibold">{t('title')} </h2>
            <p className="text-muted-foreground">{t('description')}</p>
          </div>
          <Button variant="default" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('savingButton')}
              </>
            ) : (
              t('saveButton')
            )}
          </Button>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Sections Panel */}
          <div className="col-span-1 border-r pr-4 max-lg:border-r-0 max-lg:border-b max-lg:pr-0 max-lg:pb-6">
            <h3 className="mb-4 font-medium">{t('SectionsPanel.title')}</h3>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
              accessibility={{ announcements }}
            >
              <div className="space-y-2">
                <SortableContext
                  items={profileData.sections.map(section => section.id)}
                  strategy={verticalListSortingStrategy}
                >
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
                  if (value) {
                    addSection(value as keyof typeof SECTION_TYPE_KEYS)
                  }
                }}
                items={Object.entries(getSectionTypesConfig(t)).map(([type, { label }]) => ({
                  value: type,
                  label,
                }))}
              >
                <SelectTrigger className="bg-primary hover:bg-primary/90 w-full border-0" withChevron={false}>
                  <div className="text-primary-foreground inline-flex items-center justify-center gap-2">
                    <Plus size={16} />
                    {t('SectionsPanel.addSectionButton')}
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(getSectionTypesConfig(t)).map(([type, { icon: Icon, label, description }]) => (
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

          {/* Editor Panel */}
          <div className="col-span-1 lg:col-span-3">
            {selectedSection !== null && profileData.sections[selectedSection] ? (
              <SectionEditor
                t={t}
                section={profileData.sections[selectedSection]}
                onChange={updatedSection => {
                  updateSection(selectedSection, updatedSection)
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
