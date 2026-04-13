'use client';

import {
  Award,
  BookOpen,
  Briefcase,
  CalendarIcon,
  Edit,
  GraduationCap,
  GripVertical,
  ImageIcon,
  Link as LinkIcon,
  Loader2,
  MapPin,
  Plus,
  TextIcon,
  Trash2,
  Trophy,
} from 'lucide-react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { updateProfile } from '@/lib/users/client';
import { createElement, useEffect, useEffectEvent, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { de, enUS, es, fr, ru } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Textarea } from '@components/ui/textarea';
import { Checkbox } from '@components/ui/checkbox';
import { Calendar } from '@components/ui/calendar';
import { Button } from '@components/ui/button';
import { Label } from '@components/ui/label';
import { Input } from '@components/ui/input';
import type { Locale } from 'date-fns';
import { format } from 'date-fns';
import type { FC } from 'react';
import { toast } from 'sonner';

// Define section type keys
const SECTION_TYPE_KEYS = {
  'image-gallery': 'imageGallery',
  'text': 'text',
  'links': 'links',
  'skills': 'skills',
  'experience': 'experience',
  'education': 'education',
  'affiliation': 'affiliation',
  'courses': 'courses',
  'gamification': 'gamification',
} as const;

// Function to get translated section types configuration
const getSectionTypesConfig = (t: Function) => ({
  'image-gallery': {
    icon: ImageIcon,
    label: t('SectionTypes.imageGallery.label'),
    description: t('SectionTypes.imageGallery.description'),
  },
  'text': {
    icon: TextIcon,
    label: t('SectionTypes.text.label'),
    description: t('SectionTypes.text.description'),
  },
  'links': {
    icon: LinkIcon,
    label: t('SectionTypes.links.label'),
    description: t('SectionTypes.links.description'),
  },
  'skills': {
    icon: Award,
    label: t('SectionTypes.skills.label'),
    description: t('SectionTypes.skills.description'),
  },
  'experience': {
    icon: Briefcase,
    label: t('SectionTypes.experience.label'),
    description: t('SectionTypes.experience.description'),
  },
  'education': {
    icon: GraduationCap,
    label: t('SectionTypes.education.label'),
    description: t('SectionTypes.education.description'),
  },
  'affiliation': {
    icon: MapPin,
    label: t('SectionTypes.affiliation.label'),
    description: t('SectionTypes.affiliation.description'),
  },
  'courses': {
    icon: BookOpen,
    label: t('SectionTypes.courses.label'),
    description: t('SectionTypes.courses.description'),
  },
  'gamification': {
    icon: Trophy,
    label: t('SectionTypes.gamification.label'),
    description: t('SectionTypes.gamification.description'),
  },
});

// Skill level items helper
const skillLevelItems = (t: Function) => [
  { value: 'beginner', label: t('SkillsEditor.levelBeginner') },
  { value: 'intermediate', label: t('SkillsEditor.levelIntermediate') },
  { value: 'advanced', label: t('SkillsEditor.levelAdvanced') },
  { value: 'expert', label: t('SkillsEditor.levelExpert') },
];

// Type definitions
interface ProfileImage {
  url: string;
  caption?: string;
}

interface ProfileLink {
  title: string;
  url: string;
  icon?: string;
}

interface ProfileSkill {
  name: string;
  level?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  category?: string;
}

interface ProfileExperience {
  title: string;
  organization: string;
  startDate: string;
  endDate?: string;
  current: boolean;
  description: string;
}

interface ProfileEducation {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate?: string;
  current: boolean;
  description?: string;
}

interface ProfileAffiliation {
  name: string;
  description: string;
  logoUrl: string;
}

interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail?: string;
  status: string;
}

interface BaseSection {
  id: string;
  type: keyof typeof SECTION_TYPE_KEYS;
  title: string;
}

type ImageGallerySection = {
  type: 'image-gallery';
  images: ProfileImage[];
} & BaseSection;

type TextSection = {
  type: 'text';
  content: string;
} & BaseSection;

type LinksSection = {
  type: 'links';
  links: ProfileLink[];
} & BaseSection;

type SkillsSection = {
  type: 'skills';
  skills: ProfileSkill[];
} & BaseSection;

type ExperienceSection = {
  type: 'experience';
  experiences: ProfileExperience[];
} & BaseSection;

type EducationSection = {
  type: 'education';
  education: ProfileEducation[];
} & BaseSection;

type AffiliationSection = {
  type: 'affiliation';
  affiliations: ProfileAffiliation[];
} & BaseSection;

type CoursesSection = {
  type: 'courses';
  // No need to store courses as they will be fetched from API
} & BaseSection;

type GamificationSection = {
  type: 'gamification';
  settings: {
    showLevel: boolean;
    showXP: boolean;
    showStreaks: boolean;
    showLeaderboard: boolean;
  };
} & BaseSection;

type ProfileSection =
  | ImageGallerySection
  | TextSection
  | LinksSection
  | SkillsSection
  | ExperienceSection
  | EducationSection
  | AffiliationSection
  | CoursesSection
  | GamificationSection;

interface ProfileData {
  sections: ProfileSection[];
}

const UserProfileBuilder = () => {
  const router = useRouter();
  const { user: currentUser } = useSession();
  const me = currentUser;
  const tNotify = useTranslations('DashPage.Notifications');
  const t = useTranslations('DashPage.UserProfileBuilder');
  const [profileData, setProfileData] = useState<ProfileData>({
    sections: [],
  });
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize profile data from user data
  const fetchUserDataEvent = useEffectEvent(async () => {
    if (!me) {
      return;
    }

    try {
      setIsLoading(true);
      const userData = me;

      if (userData.profile) {
        try {
          const profileSections =
            typeof userData.profile === 'string' ? JSON.parse(userData.profile).sections : userData.profile.sections;

          setProfileData({
            sections: profileSections || [],
          });
        } catch (error) {
          console.error('Error parsing profile data:', error);
          setProfileData({ sections: [] });
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      toast.error(t('Errors.profileLoadFailed'));
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    fetchUserDataEvent();
  }, [me]);

  const createEmptySection = (t: Function, type: keyof typeof SECTION_TYPE_KEYS): ProfileSection => {
    const sectionTypesConfig = getSectionTypesConfig(t);
    const baseSection = {
      id: `section-${Date.now()}`,
      type,
      title: t('EmptySections.defaultTitle', {
        sectionName: sectionTypesConfig[type].label,
      }),
    };

    switch (type) {
      case 'image-gallery': {
        return {
          ...baseSection,
          type: 'image-gallery',
          images: [],
        };
      }
      case 'text': {
        return {
          ...baseSection,
          type: 'text',
          content: '',
        };
      }
      case 'links': {
        return {
          ...baseSection,
          type: 'links',
          links: [],
        };
      }
      case 'skills': {
        return {
          ...baseSection,
          type: 'skills',
          skills: [],
        };
      }
      case 'experience': {
        return {
          ...baseSection,
          type: 'experience',
          experiences: [],
        };
      }
      case 'education': {
        return {
          ...baseSection,
          type: 'education',
          education: [],
        };
      }
      case 'affiliation': {
        return {
          ...baseSection,
          type: 'affiliation',
          affiliations: [],
        };
      }
      case 'courses': {
        return {
          ...baseSection,
          type: 'courses',
        };
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
        };
      }
    }
  };

  const addSection = (type: keyof typeof SECTION_TYPE_KEYS) => {
    setProfileData((prev) => {
      const newSection = createEmptySection(t, type);
      const newSections = [...prev.sections, newSection];
      setSelectedSection(newSections.length - 1);
      return {
        ...prev,
        sections: newSections,
      };
    });
  };

  const updateSection = (index: number, updatedSection: ProfileSection) => {
    const newSections = [...profileData.sections];
    newSections[index] = updatedSection;
    setProfileData((prev) => ({
      ...prev,
      sections: newSections,
    }));
  };

  const deleteSection = (index: number) => {
    setProfileData((prev) => ({
      ...prev,
      sections: prev.sections.filter((_, i) => i !== index),
    }));
    setSelectedSection(null);
  };

  const onDragEnd = (result: any) => {
    if (!result.destination) return;

    const items = [...profileData.sections];
    const [reorderedItem] = items.splice(result.source.index, 1);
    if (reorderedItem) {
      items.splice(result.destination.index, 0, reorderedItem);
    }

    setProfileData((prev) => ({
      ...prev,
      sections: items,
    }));
    setSelectedSection(result.destination.index);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const loadingToast = toast.loading(tNotify('savingProfile'));

    try {
      if (!currentUser?.id) {
        throw new Error('User not found');
      }

      // Update only the profile field
      const userData = {
        ...me,
        profile: profileData,
      };

      const res = await updateProfile(userData, currentUser.id);

      if (res.status === 200) {
        router.refresh();
        toast.success(tNotify('profileUpdateSuccess'), { id: loadingToast });
      } else {
        toast.error(tNotify('profileUpdateFailed'), { id: loadingToast });
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error(tNotify('profileUpdateFailed'), { id: loadingToast });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="soft-shadow mx-0 rounded-xl bg-white p-6 sm:mx-10">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="soft-shadow mx-0 rounded-xl bg-white sm:mx-10">
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h2 className="flex items-center text-xl font-semibold">{t('title')} </h2>
            <p className="text-gray-600">{t('description')}</p>
          </div>
          <Button
            variant="default"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? t('savingButton') : t('saveButton')}
          </Button>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-4 gap-6">
          {/* Sections Panel */}
          <div className="col-span-1 border-r pr-4">
            <h3 className="mb-4 font-medium">{t('SectionsPanel.title')}</h3>
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="sections">
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="space-y-2"
                  >
                    {profileData.sections.map((section, index) => (
                      <Draggable
                        key={section.id}
                        draggableId={section.id}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            onClick={() => {
                              setSelectedSection(index);
                            }}
                            className={`cursor-pointer rounded-lg border bg-white/80 p-4 backdrop-blur-xs ${
                              selectedSection === index
                                ? 'border-blue-500 bg-blue-50 shadow-xs ring-2 ring-blue-500/20'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 hover:shadow-xs'
                            } ${snapshot.isDragging ? 'rotate-2 shadow-lg ring-2 ring-blue-500/20' : ''}`}
                          >
                            <div className="group flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div
                                  {...provided.dragHandleProps}
                                  className={`rounded-md p-1.5 transition-colors duration-200 ${
                                    selectedSection === index
                                      ? 'bg-blue-100/50 text-blue-500'
                                      : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                                  }`}
                                >
                                  <GripVertical size={16} />
                                </div>
                                <div
                                  className={`rounded-md p-1.5 ${
                                    selectedSection === index
                                      ? 'bg-blue-100/50 text-blue-600'
                                      : 'bg-gray-100/50 text-gray-600'
                                  }`}
                                >
                                  {createElement(getSectionTypesConfig(t)[section.type].icon, {
                                    size: 16,
                                  })}
                                </div>
                                <span
                                  className={`truncate text-sm font-medium ${
                                    selectedSection === index ? 'text-blue-700' : 'text-gray-700'
                                  }`}
                                >
                                  {section.title}
                                </span>
                              </div>
                              <div className="flex space-x-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedSection(index);
                                  }}
                                  className={`rounded-md p-1.5 transition-colors duration-200 ${
                                    selectedSection === index
                                      ? 'text-blue-500 hover:bg-blue-100'
                                      : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                                  }`}
                                >
                                  <Edit size={14} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteSection(index);
                                  }}
                                  className="rounded-md p-1.5 text-red-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-500"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            <div className="pt-4">
              <Select
                onValueChange={(value) => {
                  if (value) {
                    addSection(value as keyof typeof SECTION_TYPE_KEYS);
                  }
                }}
                items={Object.entries(getSectionTypesConfig(t)).map(([type, { label }]) => ({
                  value: type,
                  label,
                }))}
              >
                <SelectTrigger
                  className="bg-primary w-full border-0 p-0"
                  withChevron={false}
                >
                  <div className="text-primary-foreground inline-flex w-full items-center justify-center gap-2 rounded-md text-sm font-medium">
                    <Plus color="white" />
                    {t('SectionsPanel.addSectionButton')}
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(getSectionTypesConfig(t)).map(([type, { icon: Icon, label, description }]) => (
                      <SelectItem
                        key={type}
                        value={type}
                      >
                        <div className="flex items-center space-x-3 py-1">
                          <div className="rounded-md bg-gray-50 p-1.5">
                            <Icon
                              size={16}
                              className="text-gray-600"
                            />
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-700">{label}</div>
                            <div className="text-xs text-gray-500">{description}</div>
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
          <div className="col-span-3">
            {selectedSection !== null && profileData.sections[selectedSection] ? (
              <SectionEditor
                t={t}
                section={profileData.sections[selectedSection]}
                onChange={(updatedSection) => {
                  updateSection(selectedSection, updatedSection);
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-500">{t('EmptyEditor.message')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// DatePicker Component
const DatePicker: FC<{
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  disabled?: boolean;
  locale?: Locale;
}> = ({ value, onChange, placeholder = 'Pick a date', disabled = false, locale }) => {
  const [open, setOpen] = useState(false);
  const selectedDate = value ? new Date(value) : undefined;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={`w-full justify-start text-left font-normal ${!value && 'text-muted-foreground'}`}
            disabled={disabled}
          />
        }
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {value && selectedDate ? format(selectedDate, 'PPP', { locale }) : <span>{placeholder}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={selectedDate}
          onSelect={(date) => {
            if (date) {
              onChange(format(date, 'yyyy-MM-dd'));
              setOpen(false);
            }
          }}
          locale={locale}
        />
      </PopoverContent>
    </Popover>
  );
};

interface SectionEditorProps {
  t: Function;
  section: ProfileSection;
  onChange: (section: ProfileSection) => void;
}

const SectionEditor: FC<SectionEditorProps> = ({ t, section, onChange }) => {
  switch (section.type) {
    case 'image-gallery': {
      return (
        <ImageGalleryEditor
          t={t}
          section={section}
          onChange={onChange}
        />
      );
    }
    case 'text': {
      return (
        <TextEditor
          t={t}
          section={section}
          onChange={onChange}
        />
      );
    }
    case 'links': {
      return (
        <LinksEditor
          t={t}
          section={section}
          onChange={onChange}
        />
      );
    }
    case 'skills': {
      return (
        <SkillsEditor
          t={t}
          section={section}
          onChange={onChange}
        />
      );
    }
    case 'experience': {
      return (
        <ExperienceEditor
          t={t}
          section={section}
          onChange={onChange}
        />
      );
    }
    case 'education': {
      return (
        <EducationEditor
          t={t}
          section={section}
          onChange={onChange}
        />
      );
    }
    case 'affiliation': {
      return (
        <AffiliationEditor
          t={t}
          section={section}
          onChange={onChange}
        />
      );
    }
    case 'courses': {
      return (
        <CoursesEditor
          t={t}
          section={section}
          onChange={onChange}
        />
      );
    }
    default: {
      return <div>{t('Errors.unknownSectionType')}</div>;
    }
  }
};

const ImageGalleryEditor: FC<{
  t: Function;
  section: ImageGallerySection;
  onChange: (section: ImageGallerySection) => void;
}> = ({ t, section, onChange }) => {
  return (
    <div className="soft-shadow space-y-6 rounded-lg bg-white p-6">
      <div className="flex items-center space-x-2">
        <ImageIcon className="h-5 w-5 text-gray-500" />
        <h3 className="text-lg font-medium">{t('ImageGalleryEditor.title')}</h3>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <Label htmlFor="title">{t('Common.sectionTitle')}</Label>
          <Input
            id="title"
            value={section.title}
            onChange={(e) => {
              onChange({ ...section, title: e.target.value });
            }}
            placeholder={t('Common.enterSectionTitlePlaceholder')}
          />
        </div>

        {/* Images */}
        <div>
          <Label>{t('ImageGalleryEditor.imagesLabel')}</Label>
          <div className="mt-2 space-y-3">
            {section.images.map((image, index) => (
              <div
                key={index}
                className="grid grid-cols-[2fr_1fr_auto] gap-4 rounded-lg border p-4"
              >
                <div>
                  <Label>{t('ImageGalleryEditor.imageUrlLabel')}</Label>
                  <Input
                    value={image.url}
                    onChange={(e) => {
                      const newImages = [...section.images];
                      newImages[index] = { ...image, url: e.target.value };
                      onChange({ ...section, images: newImages });
                    }}
                    placeholder={t('ImageGalleryEditor.imageUrlPlaceholder')}
                  />
                </div>
                <div>
                  <Label>{t('ImageGalleryEditor.captionLabel')}</Label>
                  <Input
                    value={image.caption || ''}
                    onChange={(e) => {
                      const newImages = [...section.images];
                      newImages[index] = { ...image, caption: e.target.value };
                      onChange({ ...section, images: newImages });
                    }}
                    placeholder={t('ImageGalleryEditor.captionPlaceholder')}
                  />
                </div>
                <div className="flex flex-col justify-between">
                  <Label>&nbsp;</Label>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const newImages = section.images.filter((_, i) => i !== index);
                      onChange({ ...section, images: newImages });
                    }}
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {image.url ? (
                  <div className="col-span-3">
                    <img
                      src={image.url}
                      alt={image.caption || ''}
                      className="mt-2 max-h-32 rounded-lg object-cover"
                    />
                  </div>
                ) : null}
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                const newImage: ProfileImage = {
                  url: '',
                  caption: '',
                };
                onChange({
                  ...section,
                  images: [...section.images, newImage],
                });
              }}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('ImageGalleryEditor.addImageButton')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const TextEditor: FC<{
  t: Function;
  section: TextSection;
  onChange: (section: TextSection) => void;
}> = ({ t, section, onChange }) => {
  return (
    <div className="soft-shadow space-y-6 rounded-lg bg-white p-6">
      <div className="flex items-center space-x-2">
        <TextIcon className="h-5 w-5 text-gray-500" />
        <h3 className="text-lg font-medium">{t('TextEditor.title')}</h3>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <Label htmlFor="title">{t('Common.sectionTitle')}</Label>
          <Input
            id="title"
            value={section.title}
            onChange={(e) => {
              onChange({ ...section, title: e.target.value });
            }}
            placeholder={t('Common.enterSectionTitlePlaceholder')}
          />
        </div>

        {/* Content */}
        <div>
          <Label htmlFor="content">{t('TextEditor.contentLabel')}</Label>
          <Textarea
            id="content"
            value={section.content}
            onChange={(e) => {
              onChange({ ...section, content: e.target.value });
            }}
            placeholder={t('TextEditor.contentPlaceholder')}
            className="min-h-[200px]"
          />
        </div>
      </div>
    </div>
  );
};

const LinksEditor: FC<{
  t: Function;
  section: LinksSection;
  onChange: (section: LinksSection) => void;
}> = ({ t, section, onChange }) => {
  return (
    <div className="soft-shadow space-y-6 rounded-lg bg-white p-6">
      <div className="flex items-center space-x-2">
        <LinkIcon className="h-5 w-5 text-gray-500" />
        <h3 className="text-lg font-medium">{t('LinksEditor.title')}</h3>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <Label htmlFor="title">{t('Common.sectionTitle')}</Label>
          <Input
            id="title"
            value={section.title}
            onChange={(e) => {
              onChange({ ...section, title: e.target.value });
            }}
            placeholder={t('Common.enterSectionTitlePlaceholder')}
          />
        </div>

        {/* Links */}
        <div>
          <Label>{t('LinksEditor.linksLabel')}</Label>
          <div className="mt-2 space-y-3">
            {section.links.map((link, index) => (
              <div
                key={index}
                className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-lg border p-4"
              >
                <Input
                  value={link.title}
                  onChange={(e) => {
                    const newLinks = [...section.links];
                    newLinks[index] = { ...link, title: e.target.value };
                    onChange({ ...section, links: newLinks });
                  }}
                  placeholder={t('LinksEditor.linkTitlePlaceholder')}
                />
                <Input
                  value={link.url}
                  onChange={(e) => {
                    const newLinks = [...section.links];
                    newLinks[index] = { ...link, url: e.target.value };
                    onChange({ ...section, links: newLinks });
                  }}
                  placeholder={t('LinksEditor.urlPlaceholder')}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const newLinks = section.links.filter((_, i) => i !== index);
                    onChange({ ...section, links: newLinks });
                  }}
                  className="text-red-500 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                const newLink: ProfileLink = {
                  title: '',
                  url: '',
                };
                onChange({
                  ...section,
                  links: [...section.links, newLink],
                });
              }}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('LinksEditor.addLinkButton')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SkillsEditor: FC<{
  t: Function;
  section: SkillsSection;
  onChange: (section: SkillsSection) => void;
}> = ({ t, section, onChange }) => {
  return (
    <div className="soft-shadow space-y-6 rounded-lg bg-white p-6">
      <div className="flex items-center space-x-2">
        <Award className="h-5 w-5 text-gray-500" />
        <h3 className="text-lg font-medium">{t('SkillsEditor.title')}</h3>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <Label htmlFor="title">{t('Common.sectionTitle')}</Label>
          <Input
            id="title"
            value={section.title}
            onChange={(e) => {
              onChange({ ...section, title: e.target.value });
            }}
            placeholder={t('Common.enterSectionTitlePlaceholder')}
          />
        </div>

        {/* Skills */}
        <div>
          <Label>{t('SkillsEditor.skillsLabel')}</Label>
          <div className="mt-2 space-y-3">
            {section.skills.map((skill, index) => (
              <div
                key={index}
                className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 rounded-lg border p-4"
              >
                <Input
                  value={skill.name}
                  onChange={(e) => {
                    const newSkills = [...section.skills];
                    newSkills[index] = { ...skill, name: e.target.value };
                    onChange({ ...section, skills: newSkills });
                  }}
                  placeholder={t('SkillsEditor.skillNamePlaceholder')}
                />
                <Select
                  value={skill.level || 'intermediate'}
                  onValueChange={(value) => {
                    const newSkills = [...section.skills];
                    newSkills[index] = {
                      ...skill,
                      level: value as ProfileSkill['level'],
                    };
                    onChange({ ...section, skills: newSkills });
                  }}
                  items={skillLevelItems(t)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('SkillsEditor.selectLevelPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {skillLevelItems(t).map((item) => (
                        <SelectItem
                          key={item.value}
                          value={item.value}
                        >
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Input
                  value={skill.category || ''}
                  onChange={(e) => {
                    const newSkills = [...section.skills];
                    newSkills[index] = { ...skill, category: e.target.value };
                    onChange({ ...section, skills: newSkills });
                  }}
                  placeholder={t('SkillsEditor.categoryPlaceholder')}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const newSkills = section.skills.filter((_, i) => i !== index);
                    onChange({ ...section, skills: newSkills });
                  }}
                  className="text-red-500 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                const newSkill: ProfileSkill = {
                  name: '',
                  level: 'intermediate',
                };
                onChange({
                  ...section,
                  skills: [...section.skills, newSkill],
                });
              }}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('SkillsEditor.addSkillButton')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ExperienceEditor: FC<{
  t: Function;
  section: ExperienceSection;
  onChange: (section: ExperienceSection) => void;
}> = ({ t, section, onChange }) => {
  const fullLocale = useLocale();
  const locale = fullLocale.split('-')[0] ?? 'ru';
  const dateFnsLocale = (() => {
    const localeMap: Record<string, Locale> = {
      en: enUS,
      es,
      fr,
      de,
      ru,
    };
    return localeMap[locale] || enUS;
  })();

  return (
    <div className="soft-shadow space-y-6 rounded-lg bg-white p-6">
      <div className="flex items-center space-x-2">
        <Briefcase className="h-5 w-5 text-gray-500" />
        <h3 className="text-lg font-medium">{t('ExperienceEditor.title')}</h3>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <Label htmlFor="title">{t('Common.sectionTitle')}</Label>
          <Input
            id="title"
            value={section.title}
            onChange={(e) => {
              onChange({ ...section, title: e.target.value });
            }}
            placeholder={t('Common.enterSectionTitlePlaceholder')}
          />
        </div>

        {/* Experiences */}
        <div>
          <Label>{t('ExperienceEditor.experienceItemsLabel')}</Label>
          <div className="mt-2 space-y-4">
            {section.experiences.map((experience, index) => (
              <div
                key={index}
                className="space-y-4 rounded-lg border p-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('ExperienceEditor.titleLabel')}</Label>
                    <Input
                      value={experience.title}
                      onChange={(e) => {
                        const newExperiences = [...section.experiences];
                        newExperiences[index] = {
                          ...experience,
                          title: e.target.value,
                        };
                        onChange({ ...section, experiences: newExperiences });
                      }}
                      placeholder={t('ExperienceEditor.titlePlaceholder')}
                    />
                  </div>
                  <div>
                    <Label>{t('ExperienceEditor.organizationLabel')}</Label>
                    <Input
                      value={experience.organization}
                      onChange={(e) => {
                        const newExperiences = [...section.experiences];
                        newExperiences[index] = {
                          ...experience,
                          organization: e.target.value,
                        };
                        onChange({ ...section, experiences: newExperiences });
                      }}
                      placeholder={t('ExperienceEditor.organizationPlaceholder')}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_1fr_auto] gap-4">
                  <div>
                    <Label>{t('ExperienceEditor.startDateLabel')}</Label>
                    <DatePicker
                      value={experience.startDate}
                      onChange={(date) => {
                        const newExperiences = [...section.experiences];
                        newExperiences[index] = {
                          ...experience,
                          startDate: date,
                        };
                        onChange({ ...section, experiences: newExperiences });
                      }}
                      placeholder={t('ExperienceEditor.startDatePlaceholder') || 'Select start date'}
                      locale={dateFnsLocale}
                    />
                  </div>
                  <div>
                    <Label>{t('ExperienceEditor.endDateLabel')}</Label>
                    <DatePicker
                      value={experience.endDate || ''}
                      onChange={(date) => {
                        const newExperiences = [...section.experiences];
                        newExperiences[index] = {
                          ...experience,
                          endDate: date,
                        };
                        onChange({ ...section, experiences: newExperiences });
                      }}
                      placeholder={t('ExperienceEditor.endDatePlaceholder') || 'Select end date'}
                      disabled={experience.current}
                      locale={dateFnsLocale}
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`current-${index}`}
                        checked={experience.current}
                        onCheckedChange={(checked) => {
                          const newExperiences = [...section.experiences];
                          newExperiences[index] = {
                            ...experience,
                            current: checked,
                            endDate: checked ? undefined : experience.endDate,
                          };
                          onChange({ ...section, experiences: newExperiences });
                        }}
                      />
                      <Label htmlFor={`current-${index}`}>{t('ExperienceEditor.currentLabel')}</Label>
                    </div>
                  </div>
                </div>

                <div>
                  <Label>{t('ExperienceEditor.descriptionLabel')}</Label>
                  <Textarea
                    value={experience.description}
                    onChange={(e) => {
                      const newExperiences = [...section.experiences];
                      newExperiences[index] = {
                        ...experience,
                        description: e.target.value,
                      };
                      onChange({ ...section, experiences: newExperiences });
                    }}
                    placeholder={t('ExperienceEditor.descriptionPlaceholder')}
                    className="min-h-[100px]"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newExperiences = section.experiences.filter((_, i) => i !== index);
                      onChange({ ...section, experiences: newExperiences });
                    }}
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('ExperienceEditor.removeButton')}
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                const startDateStr = new Date().toISOString().split('T')[0];
                const newExperience: ProfileExperience = {
                  title: '',
                  organization: '',
                  startDate: startDateStr || '',
                  current: false,
                  description: '',
                };
                onChange({
                  ...section,
                  experiences: [...section.experiences, newExperience],
                });
              }}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('ExperienceEditor.addExperienceButton')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const EducationEditor: FC<{
  t: Function;
  section: EducationSection;
  onChange: (section: EducationSection) => void;
}> = ({ t, section, onChange }) => {
  const fullLocale = useLocale();
  const locale = fullLocale.split('-')[0] ?? 'ru';
  const dateFnsLocale = (() => {
    const localeMap: Record<string, Locale> = {
      en: enUS,
      es,
      fr,
      de,
      ru,
    };
    return localeMap[locale] || enUS;
  })();

  return (
    <div className="soft-shadow space-y-6 rounded-lg bg-white p-6">
      <div className="flex items-center space-x-2">
        <GraduationCap className="h-5 w-5 text-gray-500" />
        <h3 className="text-lg font-medium">{t('EducationEditor.title')}</h3>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <Label htmlFor="title">{t('Common.sectionTitle')}</Label>
          <Input
            id="title"
            value={section.title}
            onChange={(e) => {
              onChange({ ...section, title: e.target.value });
            }}
            placeholder={t('Common.enterSectionTitlePlaceholder')}
          />
        </div>

        {/* Education Items */}
        <div>
          <Label>{t('EducationEditor.educationItemsLabel')}</Label>
          <div className="mt-2 space-y-4">
            {section.education.map((edu, index) => (
              <div
                key={index}
                className="space-y-4 rounded-lg border p-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('EducationEditor.institutionLabel')}</Label>
                    <Input
                      value={edu.institution}
                      onChange={(e) => {
                        const newEducation = [...section.education];
                        newEducation[index] = {
                          ...edu,
                          institution: e.target.value,
                        };
                        onChange({ ...section, education: newEducation });
                      }}
                      placeholder={t('EducationEditor.institutionPlaceholder')}
                    />
                  </div>
                  <div>
                    <Label>{t('EducationEditor.degreeLabel')}</Label>
                    <Input
                      value={edu.degree}
                      onChange={(e) => {
                        const newEducation = [...section.education];
                        newEducation[index] = {
                          ...edu,
                          degree: e.target.value,
                        };
                        onChange({ ...section, education: newEducation });
                      }}
                      placeholder={t('EducationEditor.degreePlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <Label>{t('EducationEditor.fieldOfStudyLabel')}</Label>
                  <Input
                    value={edu.field}
                    onChange={(e) => {
                      const newEducation = [...section.education];
                      newEducation[index] = { ...edu, field: e.target.value };
                      onChange({ ...section, education: newEducation });
                    }}
                    placeholder={t('EducationEditor.fieldOfStudyPlaceholder')}
                  />
                </div>

                <div className="grid grid-cols-[1fr_1fr_auto] gap-4">
                  <div>
                    <Label>{t('EducationEditor.startDateLabel')}</Label>
                    <DatePicker
                      value={edu.startDate}
                      onChange={(date) => {
                        const newEducation = [...section.education];
                        newEducation[index] = {
                          ...edu,
                          startDate: date,
                        };
                        onChange({ ...section, education: newEducation });
                      }}
                      placeholder={t('EducationEditor.startDatePlaceholder') || 'Select start date'}
                      locale={dateFnsLocale}
                    />
                  </div>
                  <div>
                    <Label>{t('EducationEditor.endDateLabel')}</Label>
                    <DatePicker
                      value={edu.endDate || ''}
                      onChange={(date) => {
                        const newEducation = [...section.education];
                        newEducation[index] = {
                          ...edu,
                          endDate: date,
                        };
                        onChange({ ...section, education: newEducation });
                      }}
                      placeholder={t('EducationEditor.endDatePlaceholder') || 'Select end date'}
                      disabled={edu.current}
                      locale={dateFnsLocale}
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`current-edu-${index}`}
                        checked={edu.current}
                        onCheckedChange={(checked) => {
                          const newEducation = [...section.education];
                          newEducation[index] = {
                            ...edu,
                            current: checked,
                            endDate: checked ? undefined : edu.endDate,
                          };
                          onChange({ ...section, education: newEducation });
                        }}
                      />
                      <Label htmlFor={`current-edu-${index}`}>{t('EducationEditor.currentLabel')}</Label>
                    </div>
                  </div>
                </div>

                <div>
                  <Label>{t('EducationEditor.descriptionLabel')}</Label>
                  <Textarea
                    value={edu.description || ''}
                    onChange={(e) => {
                      const newEducation = [...section.education];
                      newEducation[index] = {
                        ...edu,
                        description: e.target.value,
                      };
                      onChange({ ...section, education: newEducation });
                    }}
                    placeholder={t('EducationEditor.descriptionPlaceholder')}
                    className="min-h-[100px]"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newEducation = section.education.filter((_, i) => i !== index);
                      onChange({ ...section, education: newEducation });
                    }}
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('EducationEditor.removeButton')}
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                const newEducation: ProfileEducation = {
                  institution: '',
                  degree: '',
                  field: '',
                  startDate: new Date().toISOString().split('T')[0] || '',
                  current: false,
                  description: '',
                };
                onChange({
                  ...section,
                  education: [...section.education, newEducation],
                });
              }}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('EducationEditor.addEducationButton')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AffiliationEditor: FC<{
  t: Function;
  section: AffiliationSection;
  onChange: (section: AffiliationSection) => void;
}> = ({ t, section, onChange }) => {
  return (
    <div className="soft-shadow space-y-6 rounded-lg bg-white p-6">
      <div className="flex items-center space-x-2">
        <MapPin className="h-5 w-5 text-gray-500" />
        <h3 className="text-lg font-medium">{t('AffiliationEditor.title')}</h3>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <Label htmlFor="title">{t('Common.sectionTitle')}</Label>
          <Input
            id="title"
            value={section.title}
            onChange={(e) => {
              onChange({ ...section, title: e.target.value });
            }}
            placeholder={t('Common.enterSectionTitlePlaceholder')}
          />
        </div>

        {/* Affiliations */}
        <div>
          <Label>{t('AffiliationEditor.affiliationsLabel')}</Label>
          <div className="mt-2 space-y-3">
            {section.affiliations.map((affiliation, index) => (
              <div
                key={index}
                className="space-y-4 rounded-lg border p-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('AffiliationEditor.nameLabel')}</Label>
                    <Input
                      value={affiliation.name}
                      onChange={(e) => {
                        const newAffiliations = [...section.affiliations];
                        newAffiliations[index] = {
                          ...affiliation,
                          name: e.target.value,
                        };
                        onChange({ ...section, affiliations: newAffiliations });
                      }}
                      placeholder={t('AffiliationEditor.namePlaceholder')}
                    />
                  </div>
                  <div>
                    <Label>{t('AffiliationEditor.logoUrlLabel')}</Label>
                    <Input
                      value={affiliation.logoUrl}
                      onChange={(e) => {
                        const newAffiliations = [...section.affiliations];
                        newAffiliations[index] = {
                          ...affiliation,
                          logoUrl: e.target.value,
                        };
                        onChange({ ...section, affiliations: newAffiliations });
                      }}
                      placeholder={t('AffiliationEditor.logoUrlPlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <Label>{t('AffiliationEditor.descriptionLabel')}</Label>
                  <Textarea
                    value={affiliation.description}
                    onChange={(e) => {
                      const newAffiliations = [...section.affiliations];
                      newAffiliations[index] = {
                        ...affiliation,
                        description: e.target.value,
                      };
                      onChange({ ...section, affiliations: newAffiliations });
                    }}
                    placeholder={t('AffiliationEditor.descriptionPlaceholder')}
                    className="min-h-[100px]"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const newAffiliations = section.affiliations.filter((_, i) => i !== index);
                      onChange({ ...section, affiliations: newAffiliations });
                    }}
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('AffiliationEditor.removeButton')}
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                const newAffiliation: ProfileAffiliation = {
                  name: '',
                  description: '',
                  logoUrl: '',
                };
                onChange({
                  ...section,
                  affiliations: [...section.affiliations, newAffiliation],
                });
              }}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('AffiliationEditor.addAffiliationButton')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const CoursesEditor: FC<{
  t: Function;
  section: CoursesSection;
  onChange: (section: CoursesSection) => void;
}> = ({ t, section, onChange }) => {
  return (
    <div className="soft-shadow space-y-6 rounded-lg bg-white p-6">
      <div className="flex items-center space-x-2">
        <BookOpen className="h-5 w-5 text-gray-500" />
        <h3 className="text-lg font-medium">{t('CoursesEditor.title')}</h3>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <Label htmlFor="title">{t('Common.sectionTitle')}</Label>
          <Input
            id="title"
            value={section.title}
            onChange={(e) => {
              onChange({ ...section, title: e.target.value });
            }}
            placeholder={t('Common.enterSectionTitlePlaceholder')}
          />
        </div>

        <div className="text-sm text-gray-500 italic">{t('CoursesEditor.autoDisplayMessage')}</div>
      </div>
    </div>
  );
};

export default UserProfileBuilder;
