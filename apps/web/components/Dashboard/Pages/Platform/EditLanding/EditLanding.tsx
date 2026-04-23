'use client';

import {
  Award,
  BookOpen,
  Edit,
  GripVertical,
  ImageIcon,
  LayoutTemplate,
  Link,
  MousePointerClick,
  Plus,
  Save,
  TextIcon,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select';
import { updateLanding, uploadLandingContent } from '@/services/platform/platform';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { createElement, useEffect, useState, useTransition } from 'react';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { getLandingMediaDirectory } from '@services/media/media';
import { usePlatformCourses } from '@/features/platform/hooks/usePlatform';
import { Textarea } from '@components/ui/textarea';
import NextImage from '@components/ui/NextImage';

import { Switch } from '@components/ui/switch';
import { Button } from '@components/ui/button';
import { Label } from '@components/ui/label';
import { Input } from '@components/ui/input';
import type { ChangeEvent, FC } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type {
  LandingButton,
  LandingFeaturedCourses,
  LandingHeroSection,
  LandingImage,
  LandingLogos,
  LandingObject,
  LandingPeople,
  LandingSection,
  LandingTextAndImageSection,
} from './landing_types';

const SECTION_TYPES = {
  'hero': {
    icon: LayoutTemplate,
    label: 'Hero',
    description: 'Add a hero section with heading and call-to-action',
  },
  'text-and-image': {
    icon: ImageIcon,
    label: 'Text & Image',
    description: 'Add a section with text and an image',
  },
  'logos': {
    icon: Award,
    label: 'Logos',
    description: 'Add a section to showcase logos',
  },
  'people': {
    icon: Users,
    label: 'People',
    description: 'Add a section to highlight team members',
  },
  'featured-courses': {
    icon: BookOpen,
    label: 'Courses',
    description: 'Add a section to showcase selected courses',
  },
} as const;

const PREDEFINED_GRADIENTS = {
  'sunrise': {
    colors: ['#fef9f3', '#ffecd2'] as string[],
    direction: '45deg',
  },
  'mint-breeze': {
    colors: ['#f0fff4', '#dcfce7'] as string[],
    direction: '45deg',
  },
  'deep-ocean': {
    colors: ['#0f172a', '#1e3a8a'] as string[],
    direction: '135deg',
  },
  'sunset-blaze': {
    colors: ['#7f1d1d', '#ea580c'] as string[],
    direction: '45deg',
  },
  'midnight-purple': {
    colors: ['#581c87', '#7e22ce'] as string[],
    direction: '90deg',
  },
  'forest-depths': {
    colors: ['#064e3b', '#059669'] as string[],
    direction: '225deg',
  },
  'berry-fusion': {
    colors: ['#831843', '#be185d'] as string[],
    direction: '135deg',
  },
  'cosmic-night': {
    colors: ['#1e1b4b', '#4338ca'] as string[],
    direction: '45deg',
  },
  'autumn-fire': {
    colors: ['#7c2d12', '#c2410c'] as string[],
    direction: '90deg',
  },
  'emerald-depths': {
    colors: ['#064e3b', '#10b981'] as string[],
    direction: '135deg',
  },
  'royal-navy': {
    colors: ['#1e3a8a', '#3b82f6'] as string[],
    direction: '225deg',
  },
  'volcanic': {
    colors: ['#991b1b', '#f97316'] as string[],
    direction: '315deg',
  },
  'arctic-night': {
    colors: ['#0f172a', '#475569'] as string[],
    direction: '90deg',
  },
  'grape-punch': {
    colors: ['#6b21a8', '#d946ef'] as string[],
    direction: '135deg',
  },
  'marine-blue': {
    colors: ['#0c4a6e', '#0ea5e9'] as string[],
    direction: '45deg',
  },
} as const;

const _GRADIENT_DIRECTIONS = {
  '45deg': '↗️ Top Right',
  '90deg': '⬆️ Top',
  '135deg': '↖️ Top Left',
  '180deg': '⬅️ Left',
  '225deg': '↙️ Bottom Left',
  '270deg': '⬇️ Bottom',
  '315deg': '↘️ Bottom Right',
  '0deg': '➡️ Right',
} as const;

// Map section type keys to translation keys
const SECTION_TYPE_KEYS: Record<LandingSection['type'], string> = {
  'hero': 'hero',
  'text-and-image': 'textAndImage',
  'logos': 'logos',
  'people': 'people',
  'featured-courses': 'featuredCourses',
};

// Function to get translated section types
const getSectionTypes = (t: Function) => ({
  'hero': {
    icon: LayoutTemplate,
    label: t('SectionTypes.hero.label'),
    description: t('SectionTypes.hero.description'),
  },
  'text-and-image': {
    icon: ImageIcon,
    label: t('SectionTypes.textAndImage.label'),
    description: t('SectionTypes.textAndImage.description'),
  },
  'logos': {
    icon: Award,
    label: t('SectionTypes.logos.label'),
    description: t('SectionTypes.logos.description'),
  },
  'people': {
    icon: Users,
    label: t('SectionTypes.people.label'),
    description: t('SectionTypes.people.description'),
  },
  'featured-courses': {
    icon: BookOpen,
    label: t('SectionTypes.featuredCourses.label'),
    description: t('SectionTypes.featuredCourses.description'),
  },
});

// Map gradient direction keys to translation keys
const GRADIENT_DIRECTION_KEYS: Record<string, string> = {
  '45deg': 'topRight',
  '90deg': 'top',
  '135deg': 'topLeft',
  '180deg': 'left',
  '225deg': 'bottomLeft',
  '270deg': 'bottom',
  '315deg': 'bottomRight',
  '0deg': 'right',
};

// Function to get translated gradient directions
const getGradientDirections = (t: Function) => {
  return Object.entries(GRADIENT_DIRECTION_KEYS).reduce<Record<string, string>>((acc, [key, tKey]) => {
    acc[key] = t(`GradientDirections.${tKey}`);
    return acc;
  }, {});
};

// Function to get translated gradient preset names
const getGradientPresetName = (t: Function, name: string) => {
  // Assumes keys like GradientPresets.sunrise, GradientPresets.mintBreeze etc.
  return t(`GradientPresets.${name.replace('-', '_')}`);
};

// Function to get translated section display name
const getSectionDisplayName = (t: Function, section: LandingSection) => {
  const sectionTypeKey = SECTION_TYPE_KEYS[section.type];
  return t(`SectionTypes.${sectionTypeKey}.label`);
};

const createEmptySection = (t: Function, type: keyof typeof SECTION_TYPE_KEYS): LandingSection => {
  switch (type) {
    case 'hero': {
      return {
        type: 'hero',
        title: t('EmptySections.hero.title'),
        background: {
          type: 'solid',
          color: '#ffffff',
        },
        heading: {
          text: t('EmptySections.hero.heading'),
          color: '#000000',
          size: 'large',
        },
        subheading: {
          text: t('EmptySections.hero.subheading'),
          color: '#666666',
          size: 'medium',
        },
        buttons: [],
        illustration: undefined,
        contentAlign: 'center',
      };
    }
    case 'text-and-image': {
      return {
        type: 'text-and-image',
        title: t('EmptySections.textAndImage.title'),
        text: t('EmptySections.textAndImage.text'),
        flow: 'left',
        image: {
          url: '',
          alt: '',
        },
        buttons: [],
      };
    }
    case 'logos': {
      return {
        type: 'logos',
        title: t('EmptySections.logos.title'),
        logos: [],
      };
    }
    case 'people': {
      return {
        type: 'people',
        title: t('EmptySections.people.title'),
        people: [],
      };
    }
    case 'featured-courses': {
      return {
        type: 'featured-courses',
        title: t('EmptySections.featuredCourses.title'),
        courses: [],
      };
    }
    default: {
      throw new Error(t('Errors.invalidSectionType'));
    }
  }
};

// Helper factories that produce item lists (use t at call site)
const makeBackgroundTypeItems = (t: Function) => [
  { value: 'solid', label: t('HeroEditor.Background.solid') },
  { value: 'gradient', label: t('HeroEditor.Background.gradient') },
  { value: 'image', label: t('HeroEditor.Background.image') },
];

const makeGradientTypeItems = (t: Function) => [
  { value: 'preset', label: t('HeroEditor.Background.presetGradients') },
  { value: 'custom', label: t('HeroEditor.Background.customGradient') },
];

const makeIllustrationPositionItems = (t: Function) => [
  { value: 'left', label: t('HeroEditor.Illustration.positionLeft') },
  { value: 'right', label: t('HeroEditor.Illustration.positionRight') },
];

const makeIllustrationSizeItems = (t: Function) => [
  { value: 'small', label: t('HeroEditor.Illustration.sizeSmall') },
  { value: 'medium', label: t('HeroEditor.Illustration.sizeMedium') },
  { value: 'large', label: t('HeroEditor.Illustration.sizeLarge') },
];

const makeFlowItems = (t: Function) => [
  { value: 'left', label: t('TextAndImageEditor.positionLeft') },
  { value: 'right', label: t('TextAndImageEditor.positionRight') },
];

const makeSectionTypeItems = (t: Function) =>
  Object.entries(getSectionTypes(t)).map(([type, conf]) => ({
    value: type,
    label: createElement(
      'div',
      { className: 'flex items-center space-x-3 py-1' },
      createElement(
        'div',
        { className: 'rounded-md bg-muted p-1.5' },
        createElement(conf.icon as any, { size: 16, className: 'text-muted-foreground' }),
      ),
      createElement(
        'div',
        { className: 'flex-1' },
        createElement('div', { className: 'text-sm font-medium text-foreground' }, conf.label),
        createElement('div', { className: 'text-xs text-muted-foreground' }, conf.description),
      ),
    ) as any,
  }));

const makeGradientPresetItems = (t: Function) =>
  Object.entries(PREDEFINED_GRADIENTS).map(([name]) => ({
    value: name,
    label: (
      <div className="flex items-center space-x-1">
        <div
          className="h-8 w-8 rounded-md"
          style={{
            background: `linear-gradient(${PREDEFINED_GRADIENTS[name as keyof typeof PREDEFINED_GRADIENTS].direction}, ${PREDEFINED_GRADIENTS[name as keyof typeof PREDEFINED_GRADIENTS].colors.join(', ')})`,
          }}
        />
        <span className="capitalize">{getGradientPresetName(t, name)}</span>
      </div>
    ) as any,
  }));

const makeGradientDirectionItems = (t: Function) =>
  Object.entries(getGradientDirections(t)).map(([value, label]) => ({ value, label }));

const EditLanding = () => {
  const platform = usePlatform() as any;
  const [isLandingEnabled, setIsLandingEnabled] = useState(false);
  const tNotify = useTranslations('DashPage.Notifications');
  const t = useTranslations('DashPage.PlatformSettings.Landing');

  // Precompute section type items for `Select` usage
  const sectionTypeItems = makeSectionTypeItems(t);

  const [landingData, setLandingData] = useState<LandingObject>({
    sections: [],
    enabled: false,
  });
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Initialize landing data from platform config
  useEffect(() => {
    if (platform?.landing) {
      const landingConfig = platform.landing;
      setLandingData({
        sections: landingConfig.sections || [],
        enabled: Boolean(landingConfig.enabled),
      });
      // Coerce to boolean to avoid switching between controlled/uncontrolled
      // states for the `Switch` component (React warns when checked changes
      // between `undefined` and boolean during the component lifecycle).
      setIsLandingEnabled(Boolean(landingConfig.enabled));
    }
  }, [platform]);

  const addSection = (type: string) => {
    const newSection: LandingSection = createEmptySection(t, type as keyof typeof SECTION_TYPE_KEYS);
    setLandingData((prev: LandingObject) => ({
      ...prev,
      sections: [...prev.sections, newSection],
    }));
  };

  const updateSection = (index: number, updatedSection: LandingSection) => {
    const newSections = [...landingData.sections];
    newSections[index] = updatedSection;
    setLandingData((prev: LandingObject) => ({
      ...prev,
      sections: newSections,
    }));
  };

  const deleteSection = (index: number) => {
    setLandingData((prev: LandingObject) => ({
      ...prev,
      sections: prev.sections.filter((_: LandingSection, i: number) => i !== index),
    }));
    setSelectedSection(null);
  };

  const onDragEnd = (result: any) => {
    if (!result.destination) return;

    const items = [...landingData.sections];
    const [reorderedItem] = items.splice(result.source.index, 1);
    if (reorderedItem) {
      items.splice(result.destination.index, 0, reorderedItem);
    }

    setLandingData((prev: LandingObject) => ({
      ...prev,
      sections: items,
    }));
    setSelectedSection(result.destination.index);
  };

  const handleSave = async () => {
    startTransition(() => setIsSaving(true));
    const loadingToast = toast.loading(tNotify('savingLandingPage'));
    try {
      const res = await updateLanding({
        sections: landingData.sections,
        enabled: isLandingEnabled,
      });

      if (res.status === 200) {
        toast.success(tNotify('landingPageSavedSuccess'), { id: loadingToast });
      } else {
        toast.error(tNotify('landingPageSaveError'), { id: loadingToast });
      }
    } catch (error) {
      toast.error(tNotify('landingPageSaveError'), { id: loadingToast });
      console.error('Error saving landing page:', error);
    } finally {
      startTransition(() => setIsSaving(false));
    }
  };

  return (
    <div className="bg-background mx-0 rounded-xl shadow-sm sm:mx-10">
      <div className="space-y-6 p-6">
        {/* Enable/Disable Landing Page */}
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h2 className="flex items-center text-xl font-semibold">{t('title')}</h2>
            <p className="text-muted-foreground">{t('description')}</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Switch
                checked={isLandingEnabled}
                onCheckedChange={setIsLandingEnabled}
                className="h-6 w-11 [&>span]:h-5 [&>span]:w-5 [&>span]:data-[state=checked]:translate-x-5.5"
              />
            </div>
            <Button
              variant="default"
              onClick={handleSave}
              disabled={isSaving || isPending}
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving || isPending ? t('savingButton') : t('saveButton')}
            </Button>
          </div>
        </div>

        {isLandingEnabled ? (
          <>
            {/* Section List */}
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
                        {landingData.sections.map((section: LandingSection, index: number) => (
                          <Draggable
                            key={`section-${index}`}
                            draggableId={`section-${index}`}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                onClick={() => {
                                  setSelectedSection(index);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setSelectedSection(index);
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                                className={`bg-background/80 cursor-pointer rounded-lg border p-4 backdrop-blur-xs ${
                                  selectedSection === index
                                    ? 'border-primary bg-primary/10 ring-primary/20 shadow-xs ring-2'
                                    : 'border-border hover:border-border hover:bg-muted/50 hover:shadow-xs'
                                } ${snapshot.isDragging ? 'ring-primary/20 rotate-2 shadow-lg ring-2' : ''}`}
                              >
                                <div className="group flex items-center justify-between">
                                  <div className="flex items-center space-x-3">
                                    <div
                                      {...provided.dragHandleProps}
                                      className={`rounded-md p-1.5 transition-colors duration-200 ${
                                        selectedSection === index
                                          ? 'bg-primary/20/50 text-primary'
                                          : 'text-muted-foreground hover:bg-muted hover:text-muted-foreground'
                                      }`}
                                    >
                                      <GripVertical size={16} />
                                    </div>
                                    <div
                                      className={`rounded-md p-1.5 ${
                                        selectedSection === index
                                          ? 'bg-primary/20/50 text-primary'
                                          : 'bg-muted/50 text-muted-foreground'
                                      }`}
                                    >
                                      {createElement(SECTION_TYPES[section.type].icon, {
                                        size: 16,
                                      })}
                                    </div>
                                    <span
                                      className={`truncate text-sm font-medium capitalize ${
                                        selectedSection === index ? 'text-primary' : 'text-foreground'
                                      }`}
                                    >
                                      {getSectionDisplayName(t, section)}
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
                                          ? 'text-primary hover:bg-primary/20'
                                          : 'text-muted-foreground hover:bg-muted hover:text-muted-foreground'
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
                    onValueChange={(value: string | null) => {
                      if (value) {
                        addSection(value);
                      }
                    }}
                    items={sectionTypeItems}
                  >
                    <SelectTrigger
                      className="bg-primary hover:bg-primary/90 w-full border-0 p-0"
                      withChevron={false}
                    >
                      <div className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap text-white transition-all outline-none">
                        <Plus
                          size={14}
                          color="white"
                        />
                        {t('SectionsPanel.addSectionButton')}
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {sectionTypeItems.map((item) => (
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
                </div>
              </div>

              {/* Editor Panel */}
              <div className="col-span-3">
                {selectedSection !== null && landingData.sections[selectedSection] ? (
                  <SectionEditor
                    t={t}
                    section={landingData.sections[selectedSection]}
                    onChange={(updatedSection) => {
                      updateSection(selectedSection, updatedSection);
                    }}
                  />
                ) : (
                  <div className="text-muted-foreground flex h-full items-center justify-center">
                    {t('EditorPanel.emptyState')}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

interface SectionEditorProps {
  t: Function;
  section: LandingSection;
  onChange: (section: LandingSection) => void;
}

const SectionEditor: FC<SectionEditorProps> = ({ t, section, onChange }) => {
  switch (section.type) {
    case 'hero': {
      return (
        <HeroSectionEditor
          t={t}
          section={section}
          onChange={onChange}
        />
      );
    }
    case 'text-and-image': {
      return (
        <TextAndImageSectionEditor
          t={t}
          section={section}
          onChange={onChange}
        />
      );
    }
    case 'logos': {
      return (
        <LogosSectionEditor
          t={t}
          section={section}
          onChange={onChange}
        />
      );
    }
    case 'people': {
      return (
        <PeopleSectionEditor
          t={t}
          section={section}
          onChange={onChange}
        />
      );
    }
    case 'featured-courses': {
      return (
        <FeaturedCoursesEditor
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

const HeroSectionEditor: FC<{
  t: Function;
  section: LandingHeroSection;
  onChange: (section: LandingHeroSection) => void;
}> = ({ t, section, onChange }) => {
  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onChange({
          ...section,
          background: {
            type: 'image',
            image: reader.result as string,
          },
        });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="bg-background space-y-6 rounded-lg p-6 shadow-sm">
      <div className="flex items-center space-x-1">
        <LayoutTemplate className="text-muted-foreground h-5 w-5" />
        <h3 className="text-lg font-medium">
          {t('SectionTypes.hero.label')} {t('Editor.titleSuffix')}
        </h3>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <Label htmlFor="title">{t('Editor.sectionTitleLabel')}</Label>
          <Input
            id="title"
            value={section.title}
            onChange={(e) => {
              onChange({ ...section, title: e.target.value });
            }}
            placeholder={t('Editor.sectionTitlePlaceholder')}
          />
        </div>

        <Tabs
          defaultValue="content"
          className="w-full"
        >
          <TabsList className="bg-muted grid w-full grid-cols-4 rounded-lg p-1">
            <TabsTrigger
              value="content"
              className="flex items-center space-x-1"
            >
              <TextIcon className="h-4 w-4" />
              <span>{t('HeroEditor.Tabs.content')}</span>
            </TabsTrigger>
            <TabsTrigger
              value="background"
              className="flex items-center"
            >
              <LayoutTemplate className="h-4 w-4" />
              <span>{t('HeroEditor.Tabs.background')}</span>
            </TabsTrigger>
            <TabsTrigger
              value="buttons"
              className="flex items-center space-x-1"
            >
              <MousePointerClick className="h-4 w-4" />
              <span>{t('HeroEditor.Tabs.buttons')}</span>
            </TabsTrigger>
            <TabsTrigger
              value="illustration"
              className="flex items-center space-x-1"
            >
              <ImageIcon className="h-4 w-4" />
              <span>{t('HeroEditor.Tabs.illustration')}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="content"
            className="mt-4 space-y-4"
          >
            {/* Heading */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="heading">{t('HeroEditor.Content.headingLabel')}</Label>
                <Input
                  id="heading"
                  value={section.heading.text}
                  onChange={(e) => {
                    onChange({
                      ...section,
                      heading: { ...section.heading, text: e.target.value },
                    });
                  }}
                  placeholder={t('HeroEditor.Content.headingPlaceholder')}
                />
              </div>
              <div>
                <Label htmlFor="headingColor">{t('HeroEditor.Content.headingColorLabel')}</Label>
                <div className="flex items-center space-x-1">
                  <Input
                    id="headingColor"
                    type="color"
                    value={section.heading.color}
                    onChange={(e) => {
                      onChange({
                        ...section,
                        heading: { ...section.heading, color: e.target.value },
                      });
                    }}
                    className="h-10 w-20 p-1"
                  />
                  <Input
                    value={section.heading.color}
                    onChange={(e) => {
                      onChange({
                        ...section,
                        heading: { ...section.heading, color: e.target.value },
                      });
                    }}
                    placeholder="#000000"
                    className="font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Subheading */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="subheading">{t('HeroEditor.Content.subheadingLabel')}</Label>
                <Input
                  id="subheading"
                  value={section.subheading.text}
                  onChange={(e) => {
                    onChange({
                      ...section,
                      subheading: {
                        ...section.subheading,
                        text: e.target.value,
                      },
                    });
                  }}
                  placeholder={t('HeroEditor.Content.subheadingPlaceholder')}
                />
              </div>
              <div>
                <Label htmlFor="subheadingColor">{t('HeroEditor.Content.subheadingColorLabel')}</Label>
                <div className="flex items-center space-x-1">
                  <Input
                    id="subheadingColor"
                    type="color"
                    value={section.subheading.color}
                    onChange={(e) => {
                      onChange({
                        ...section,
                        subheading: {
                          ...section.subheading,
                          color: e.target.value,
                        },
                      });
                    }}
                    className="h-10 w-20 p-1"
                  />
                  <Input
                    value={section.subheading.color}
                    onChange={(e) => {
                      onChange({
                        ...section,
                        subheading: {
                          ...section.subheading,
                          color: e.target.value,
                        },
                      });
                    }}
                    placeholder="#666666"
                    className="font-mono"
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="background"
            className="mt-4 space-y-4"
          >
            <div>
              <Label htmlFor="background">{t('HeroEditor.Background.typeLabel')}</Label>
              <Select
                value={section.background.type}
                onValueChange={(selectedType) => {
                  const normalizedType = selectedType ?? 'solid';
                  onChange({
                    ...section,
                    background: {
                      type: normalizedType,
                      color: normalizedType === 'solid' ? '#ffffff' : undefined,
                      colors: normalizedType === 'gradient' ? PREDEFINED_GRADIENTS.sunrise.colors : undefined,
                      image: normalizedType === 'image' ? '' : undefined,
                    },
                  });
                }}
                items={makeBackgroundTypeItems(t)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('HeroEditor.Background.typePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {makeBackgroundTypeItems(t).map((item) => (
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
            </div>

            {section.background.type === 'solid' && (
              <div>
                <Label htmlFor="backgroundColor">{t('HeroEditor.Background.colorLabel')}</Label>
                <div className="flex items-center space-x-1">
                  <Input
                    id="backgroundColor"
                    type="color"
                    value={section.background.color || '#ffffff'}
                    onChange={(e) => {
                      onChange({
                        ...section,
                        background: {
                          ...section.background,
                          color: e.target.value,
                        },
                      });
                    }}
                    className="h-10 w-20 p-1"
                  />
                  <Input
                    value={section.background.color || '#ffffff'}
                    onChange={(e) => {
                      onChange({
                        ...section,
                        background: {
                          ...section.background,
                          color: e.target.value,
                        },
                      });
                    }}
                    placeholder="#ffffff"
                    className="font-mono"
                  />
                </div>
              </div>
            )}

            {section.background.type === 'gradient' && (
              <div className="space-y-4">
                <div>
                  <Label>{t('HeroEditor.Background.gradientTypeLabel')}</Label>
                  {/* use factory for consistency */}
                  <Select
                    value={
                      Object.values(PREDEFINED_GRADIENTS).some(
                        (preset) =>
                          preset.colors[0] === section.background.colors?.[0] &&
                          preset.colors[1] === section.background.colors?.[1],
                      )
                        ? 'preset'
                        : 'custom'
                    }
                    onValueChange={(value) => {
                      if (value === 'custom') {
                        onChange({
                          ...section,
                          background: {
                            type: 'gradient',
                            colors: ['#ffffff', '#f0f0f0'],
                            direction: section.background.direction || '45deg',
                          },
                        });
                      } else {
                        onChange({
                          ...section,
                          background: {
                            type: 'gradient',
                            colors: PREDEFINED_GRADIENTS.sunrise.colors,
                            direction: PREDEFINED_GRADIENTS.sunrise.direction,
                          },
                        });
                      }
                    }}
                    items={makeGradientTypeItems(t)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('HeroEditor.Background.gradientTypePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {makeGradientTypeItems(t).map((item) => (
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
                </div>

                {!Object.values(PREDEFINED_GRADIENTS).some(
                  (preset) =>
                    preset.colors[0] === section.background.colors?.[0] &&
                    preset.colors[1] === section.background.colors?.[1],
                ) ? (
                  <div className="space-y-4">
                    <div>
                      <Label>{t('HeroEditor.Background.startColorLabel')}</Label>
                      <div className="flex items-center space-x-1">
                        <Input
                          type="color"
                          onChange={(e) => {
                            onChange({
                              ...section,
                              background: {
                                ...section.background,
                                colors: [e.target.value, section.background.colors?.[1] || '#f0f0f0'],
                              },
                            });
                          }}
                          className="h-10 w-20 p-1"
                        />
                        <Input
                          value={section.background.colors?.[0] || '#ffffff'}
                          onChange={(e) => {
                            onChange({
                              ...section,
                              background: {
                                ...section.background,
                                colors: [e.target.value, section.background.colors?.[1] || '#f0f0f0'],
                              },
                            });
                          }}
                          placeholder="#ffffff"
                          className="font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <Label>{t('HeroEditor.Background.endColorLabel')}</Label>
                      <div className="flex items-center space-x-1">
                        <Input
                          type="color"
                          value={section.background.colors?.[1] || '#f0f0f0'}
                          onChange={(e) => {
                            onChange({
                              ...section,
                              background: {
                                ...section.background,
                                colors: [section.background.colors?.[0] || '#ffffff', e.target.value],
                              },
                            });
                          }}
                          className="h-10 w-20 p-1"
                        />
                        <Input
                          value={section.background.colors?.[1] || '#f0f0f0'}
                          onChange={(e) => {
                            onChange({
                              ...section,
                              background: {
                                ...section.background,
                                colors: [section.background.colors?.[0] || '#ffffff', e.target.value],
                              },
                            });
                          }}
                          placeholder="#f0f0f0"
                          className="font-mono"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label>{t('HeroEditor.Background.gradientPresetLabel')}</Label>
                    <Select
                      value={
                        Object.entries(PREDEFINED_GRADIENTS).find(
                          ([_, gradient]) =>
                            gradient.colors[0] === section.background.colors?.[0] &&
                            gradient.colors[1] === section.background.colors?.[1],
                        )?.[0] || 'sunrise'
                      }
                      onValueChange={(value) => {
                        onChange({
                          ...section,
                          background: {
                            ...section.background,
                            colors: PREDEFINED_GRADIENTS[value as keyof typeof PREDEFINED_GRADIENTS].colors,
                            direction: PREDEFINED_GRADIENTS[value as keyof typeof PREDEFINED_GRADIENTS].direction,
                          },
                        });
                      }}
                      items={makeGradientPresetItems(t)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('HeroEditor.Background.gradientPresetPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {makeGradientPresetItems(t).map((item) => (
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
                  </div>
                )}

                <div>
                  <Label>{t('HeroEditor.Background.gradientDirectionLabel')}</Label>
                  <Select
                    value={section.background.direction || '45deg'}
                    onValueChange={(value) => {
                      if (value) {
                        onChange({
                          ...section,
                          background: { ...section.background, direction: value },
                        });
                      }
                    }}
                    items={makeGradientDirectionItems(t)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('HeroEditor.Background.gradientDirectionPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {makeGradientDirectionItems(t).map((item) => (
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
                </div>

                <div className="mt-2">
                  <div
                    className="h-20 w-full rounded-lg"
                    style={{
                      background: `linear-gradient(${section.background.direction}, ${section.background.colors?.join(', ')})`,
                    }}
                  />
                </div>
              </div>
            )}

            {section.background.type === 'image' && (
              <div className="space-y-4">
                <div>
                  <Label>{t('HeroEditor.Background.imageLabel')}</Label>
                  <div className="mt-2 flex items-center space-x-4">
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById('imageUpload')?.click()}
                      className="w-full"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {t('HeroEditor.Background.uploadImageButton')}
                    </Button>
                    <input
                      id="imageUpload"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                      onChange={handleImageUpload}
                      className="hidden"
                      aria-label={t('ImageUploader.ariaLabel')}
                      title={t('ImageUploader.selectFile')}
                    />
                  </div>
                  {section.background.image ? (
                    <div className="relative mt-4 h-40 w-full overflow-hidden rounded-lg">
                      <NextImage
                        src={section.background.image}
                        alt={t('HeroEditor.Background.imagePreviewAlt')}
                        fill
                        className="object-cover"
                        sizes="100vw"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="buttons"
            className="mt-4 space-y-4"
          >
            <div className="space-y-3">
              {section.buttons.map((button: LandingButton, index: number) => (
                <div
                  key={index}
                  className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-lg border p-4"
                >
                  <div className="space-y-2">
                    <Label>{t('HeroEditor.Buttons.textAndColorsLabel')}</Label>
                    <Input
                      value={button.text}
                      onChange={(e) => {
                        const newButtons = [...section.buttons];
                        newButtons[index] = { ...button, text: e.target.value };
                        onChange({ ...section, buttons: newButtons });
                      }}
                      placeholder={t('HeroEditor.Buttons.textPlaceholder')}
                    />
                    <div className="flex items-center space-x-1">
                      <div className="space-y-1">
                        <Label className="text-xs">{t('HeroEditor.Buttons.textColorLabel')}</Label>
                        <Input
                          type="color"
                          value={button.color}
                          onChange={(e) => {
                            const newButtons = [...section.buttons];
                            newButtons[index] = {
                              ...button,
                              color: e.target.value,
                            };
                            onChange({ ...section, buttons: newButtons });
                          }}
                          className="h-8 w-full p-1"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('HeroEditor.Buttons.bgColorLabel')}</Label>
                        <Input
                          type="color"
                          value={button.background}
                          onChange={(e) => {
                            const newButtons = [...section.buttons];
                            newButtons[index] = {
                              ...button,
                              background: e.target.value,
                            };
                            onChange({ ...section, buttons: newButtons });
                          }}
                          className="h-8 w-full p-1"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('HeroEditor.Buttons.linkLabel')}</Label>
                    <div className="flex items-center space-x-1">
                      <Link className="text-muted-foreground h-4 w-4" />
                      <Input
                        value={button.link}
                        onChange={(e) => {
                          const newButtons = [...section.buttons];
                          newButtons[index] = {
                            ...button,
                            link: e.target.value,
                          };
                          onChange({ ...section, buttons: newButtons });
                        }}
                        placeholder={t('HeroEditor.Buttons.linkPlaceholder')}
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      const newButtons = section.buttons.filter((_: LandingButton, i: number) => i !== index);
                      onChange({ ...section, buttons: newButtons });
                    }}
                    className="mt-8 self-start text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                  </Button>
                </div>
              ))}
              {section.buttons.length < 2 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const newButton: LandingButton = {
                      text: t('HeroEditor.Buttons.newButtonDefaultText'),
                      link: '#',
                      color: '#ffffff',
                      background: '#000000',
                    };
                    onChange({
                      ...section,
                      buttons: [...section.buttons, newButton],
                    });
                  }}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t('HeroEditor.Buttons.addButton')}
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent
            value="illustration"
            className="mt-4 space-y-4"
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('HeroEditor.Illustration.imageLabel')}</Label>
                <Input
                  value={section.illustration?.image.url || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      onChange({
                        ...section,
                        illustration: {
                          image: {
                            url: e.target.value,
                            alt: section.illustration?.image.alt || '',
                          },
                          position: 'left',
                          verticalAlign: 'center',
                          size: 'medium',
                        },
                      });
                    }
                  }}
                  placeholder={t('HeroEditor.Illustration.imageUrlPlaceholder')}
                />
                <Input
                  value={section.illustration?.image.alt || ''}
                  onChange={(e) => {
                    if (section.illustration?.image.url) {
                      onChange({
                        ...section,
                        illustration: {
                          ...section.illustration,
                          image: {
                            ...section.illustration.image,
                            alt: e.target.value,
                          },
                        },
                      });
                    }
                  }}
                  placeholder={t('HeroEditor.Illustration.imageAltPlaceholder')}
                />
                <ImageUploader
                  id="hero-illustration"
                  onImageUploaded={(url) => {
                    onChange({
                      ...section,
                      illustration: {
                        image: {
                          url,
                          alt: section.illustration?.image.alt || '',
                        },
                        position: 'left',
                        verticalAlign: 'center',
                        size: 'medium',
                      },
                    });
                  }}
                  buttonText={t('HeroEditor.Illustration.uploadButton')}
                  t={t}
                />
                {section.illustration?.image.url ? (
                  <div className="relative h-12 w-full">
                    <NextImage
                      src={section.illustration?.image.url}
                      alt={t('HeroEditor.Illustration.imagePreviewAlt')}
                      fill
                      className="object-contain"
                      sizes="100vw"
                    />
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('HeroEditor.Illustration.positionLabel')}</Label>
                  <Select
                    value={section.illustration?.position || 'left'}
                    onValueChange={(value: 'left' | 'right' | null) => {
                      if (!value) return;
                      onChange({
                        ...section,
                        illustration: {
                          ...section.illustration,
                          position: value,
                          image: section.illustration?.image || {
                            url: '',
                            alt: '',
                          },
                          size: section.illustration?.size || 'medium',
                          verticalAlign: section.illustration?.verticalAlign || 'center',
                        },
                      });
                    }}
                    items={makeIllustrationPositionItems(t)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('HeroEditor.Illustration.positionPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {makeIllustrationPositionItems(t).map((item) => (
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
                </div>

                <div className="space-y-2">
                  <Label>{t('HeroEditor.Illustration.sizeLabel')}</Label>
                  <Select
                    value={section.illustration?.size || 'medium'}
                    onValueChange={(value: 'small' | 'medium' | 'large' | null) => {
                      if (!value) return;
                      onChange({
                        ...section,
                        illustration: {
                          ...section.illustration,
                          size: value,
                          image: section.illustration?.image || {
                            url: '',
                            alt: '',
                          },
                          position: section.illustration?.position || 'left',
                          verticalAlign: section.illustration?.verticalAlign || 'center',
                        },
                      });
                    }}
                    items={makeIllustrationSizeItems(t)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('HeroEditor.Illustration.sizePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {makeIllustrationSizeItems(t).map((item) => (
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
                </div>
              </div>

              {section.illustration?.image.url ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    onChange({
                      ...section,
                      illustration: undefined,
                    });
                  }}
                  className="w-full text-red-500 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

interface ImageUploaderProps {
  t: Function;
  onImageUploaded: (imageUrl: string) => void;
  className?: string;
  buttonText?: string;
  id: string;
}

const ImageUploader: FC<ImageUploaderProps> = ({ t, onImageUploaded, className, buttonText, id }) => {
  const [isUploading, setIsUploading] = useState(false);
  const tNotify = useTranslations('DashPage.Notifications');
  const inputId = `imageUpload-${id}`;

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file using reusable utility
    const { validateFile } = await import('@/lib/file-validation');
    const validation = validateFile(file, ['image']);

    if (!validation.valid) {
      toast.error(validation.error);
      e.target.value = ''; // Clear the input
      return;
    }

    setIsUploading(true);
    const loadingToast = toast.loading(tNotify('uploadingImage'));
    try {
      const response = await uploadLandingContent(file);
      if (response.status === 200 && response.data?.filename) {
        const imageUrl = getLandingMediaDirectory(response.data.filename);
        onImageUploaded(imageUrl);
        toast.success(tNotify('imageUploadSuccess'), { id: loadingToast });
      } else {
        toast.error(tNotify('imageUploadFailed'), { id: loadingToast });
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error(tNotify('imageUploadFailed'), { id: loadingToast });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={className}>
      <Button
        variant="outline"
        onClick={() => document.getElementById(inputId)?.click()}
        disabled={isUploading}
        className="w-full"
      >
        <Upload className="mr-2 h-4 w-4" />
        {isUploading ? t('ImageUploader.uploading') : buttonText}
      </Button>
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
        onChange={handleFileChange}
        className="hidden"
        aria-label={t('ImageUploader.ariaLabel')}
        title={t('ImageUploader.selectFile')}
      />
    </div>
  );
};

const TextAndImageSectionEditor: FC<{
  t: Function;
  section: LandingTextAndImageSection;
  onChange: (section: LandingTextAndImageSection) => void;
}> = ({ t, section, onChange }) => {
  return (
    <div className="bg-background space-y-6 rounded-lg p-6 shadow-sm">
      <div className="flex items-center space-x-1">
        <ImageIcon className="text-muted-foreground h-5 w-5" />
        <h3 className="text-lg font-medium">
          {t('SectionTypes.textAndImage.label')} {t('Editor.titleSuffix')}
        </h3>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <Label htmlFor="title">{t('Editor.sectionTitleLabel')}</Label>
          <Input
            id="title"
            value={section.title}
            onChange={(e) => {
              onChange({ ...section, title: e.target.value });
            }}
            placeholder={t('Editor.sectionTitlePlaceholder')}
          />
        </div>

        {/* Text */}
        <div>
          <Label htmlFor="content">{t('TextAndImageEditor.contentLabel')}</Label>
          <Textarea
            id="content"
            value={section.text}
            onChange={(e) => {
              onChange({ ...section, text: e.target.value });
            }}
            placeholder={t('TextAndImageEditor.contentPlaceholder')}
            className="min-h-[100px]"
          />
        </div>

        {/* Flow */}
        <div>
          <Label htmlFor="flow">{t('TextAndImageEditor.imagePositionLabel')}</Label>
          <Select
            value={section.flow}
            onValueChange={(value) => {
              onChange({ ...section, flow: value || section.flow });
            }}
            items={makeFlowItems(t)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('TextAndImageEditor.imagePositionPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {makeFlowItems(t).map((item) => (
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
        </div>

        {/* Image */}
        <div>
          <Label>{t('TextAndImageEditor.imageLabel')}</Label>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Input
                value={section.image.url}
                onChange={(e) => {
                  onChange({
                    ...section,
                    image: { ...section.image, url: e.target.value },
                  });
                }}
                placeholder={t('TextAndImageEditor.imageUrlPlaceholder')}
              />
              <ImageUploader
                id="text-image-section"
                onImageUploaded={(url) => {
                  onChange({
                    ...section,
                    image: { ...section.image, url },
                  });
                }}
                buttonText={t('TextAndImageEditor.uploadImageButton')}
                t={t}
              />
            </div>
            <div>
              <Input
                value={section.image.alt}
                onChange={(e) => {
                  onChange({
                    ...section,
                    image: { ...section.image, alt: e.target.value },
                  });
                }}
                placeholder={t('TextAndImageEditor.imageAltPlaceholder')}
              />
            </div>
          </div>
          {section.image.url ? (
            <div className="relative mt-4 h-40 w-full overflow-hidden rounded-lg">
              <NextImage
                src={section.image.url}
                alt={section.image.alt}
                fill
                className="object-cover"
                sizes="100vw"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const LogosSectionEditor: FC<{
  t: Function;
  section: LandingLogos;
  onChange: (section: LandingLogos) => void;
}> = ({ t, section, onChange }) => {
  return (
    <div className="bg-background space-y-6 rounded-lg p-6 shadow-sm">
      <div className="flex items-center space-x-1">
        <Award className="text-muted-foreground h-5 w-5" />
        <h3 className="text-lg font-medium">
          {t('SectionTypes.logos.label')} {t('Editor.titleSuffix')}
        </h3>
      </div>

      <div>
        <Label>{t('LogosEditor.logosLabel')}</Label>
        <div className="mt-2 space-y-3">
          {/* Title */}
          <div>
            <Label htmlFor="title">{t('Editor.sectionTitleLabel')}</Label>
            <Input
              id="title"
              value={section.title}
              onChange={(e) => {
                onChange({ ...section, title: e.target.value });
              }}
              placeholder={t('Editor.sectionTitlePlaceholder')}
            />
          </div>

          {section.logos.map((logo: LandingImage, index: number) => (
            <div
              key={index}
              className="grid grid-cols-[1fr_1fr_auto] gap-2"
            >
              <div className="space-y-2">
                <Input
                  value={logo.url}
                  onChange={(e) => {
                    const newLogos = [...section.logos];
                    newLogos[index] = { ...logo, url: e.target.value };
                    onChange({ ...section, logos: newLogos });
                  }}
                  placeholder={t('LogosEditor.logoUrlPlaceholder')}
                />
                <ImageUploader
                  id={`logo-${index}`}
                  onImageUploaded={(url) => {
                    const newLogos = [...section.logos];
                    const existingLogo = section.logos[index];
                    newLogos[index] = { ...existingLogo, url, alt: existingLogo?.alt || '' };
                    onChange({ ...section, logos: newLogos });
                  }}
                  buttonText={t('LogosEditor.uploadButton')}
                  t={t}
                />
              </div>
              <div className="space-y-2">
                <Input
                  value={logo.alt}
                  onChange={(e) => {
                    const newLogos = [...section.logos];
                    newLogos[index] = { ...logo, alt: e.target.value };
                    onChange({ ...section, logos: newLogos });
                  }}
                  placeholder={t('LogosEditor.logoAltPlaceholder')}
                />
                {logo.url ? (
                  <div className="relative h-10 w-24 overflow-hidden">
                    <NextImage
                      src={logo.url}
                      alt={logo.alt}
                      fill
                      className="object-contain"
                      sizes="100vw"
                    />
                  </div>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  const newLogos = section.logos.filter((_: LandingImage, i: number) => i !== index);
                  onChange({ ...section, logos: newLogos });
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
              const newLogo: LandingImage = {
                url: '',
                alt: '',
              };
              onChange({
                ...section,
                logos: [...section.logos, newLogo],
              });
            }}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('LogosEditor.addButton')}
          </Button>
        </div>
      </div>
    </div>
  );
};

const PeopleSectionEditor: FC<{
  t: Function;
  section: LandingPeople;
  onChange: (section: LandingPeople) => void;
}> = ({ t, section, onChange }) => {
  return (
    <div className="bg-background space-y-6 rounded-lg p-6 shadow-sm">
      <div className="flex items-center space-x-1">
        <Users className="text-muted-foreground h-5 w-5" />
        <h3 className="text-lg font-medium">
          {t('SectionTypes.people.label')} {t('Editor.titleSuffix')}
        </h3>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <Label htmlFor="title">{t('Editor.sectionTitleLabel')}</Label>
          <Input
            id="title"
            value={section.title}
            onChange={(e) => {
              onChange({ ...section, title: e.target.value });
            }}
            placeholder={t('Editor.sectionTitlePlaceholder')}
          />
        </div>

        {/* People List */}
        <div>
          <Label>{t('PeopleEditor.peopleLabel')}</Label>
          <div className="mt-2 space-y-4">
            {section.people.map((person: any, index: number) => (
              <div
                key={index}
                className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-4 rounded-lg border p-4"
              >
                <div className="space-y-2">
                  <Label>{t('PeopleEditor.nameLabel')}</Label>
                  <Input
                    value={person.name}
                    onChange={(e) => {
                      const newPeople = [...section.people];
                      newPeople[index] = { ...person, name: e.target.value };
                      onChange({ ...section, people: newPeople });
                    }}
                    placeholder={t('PeopleEditor.namePlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('PeopleEditor.usernameLabel')}</Label>
                  <Input
                    value={person.username || ''}
                    onChange={(e) => {
                      const newPeople = [...section.people];
                      newPeople[index] = {
                        ...person,
                        username: e.target.value,
                      };
                      onChange({ ...section, people: newPeople });
                    }}
                    placeholder={t('PeopleEditor.usernamePlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('PeopleEditor.imageLabel')}</Label>
                  <div className="space-y-2">
                    <Input
                      value={person.image_url}
                      onChange={(e) => {
                        const newPeople = [...section.people];
                        newPeople[index] = {
                          ...person,
                          image_url: e.target.value,
                        };
                        onChange({ ...section, people: newPeople });
                      }}
                      placeholder={t('PeopleEditor.imageUrlPlaceholder')}
                    />
                    <ImageUploader
                      id={`person-${index}`}
                      onImageUploaded={(url) => {
                        const newPeople = [...section.people];
                        const existingPerson = section.people[index];
                        newPeople[index] = {
                          ...existingPerson,
                          image_url: url,
                          user_uuid: existingPerson?.user_uuid || '',
                          name: existingPerson?.name || '',
                          description: existingPerson?.description || '',
                          username: existingPerson?.username || '',
                        };
                        onChange({ ...section, people: newPeople });
                      }}
                      buttonText={t('PeopleEditor.uploadAvatarButton')}
                      t={t}
                    />
                    {person.image_url ? (
                      <div className="relative h-12 w-12 overflow-hidden rounded-full">
                        <NextImage
                          src={person.image_url}
                          alt={person.name}
                          fill
                          className="object-cover"
                          sizes="100vw"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t('PeopleEditor.descriptionLabel')}</Label>
                  <Input
                    value={person.description}
                    onChange={(e) => {
                      const newPeople = [...section.people];
                      newPeople[index] = {
                        ...person,
                        description: e.target.value,
                      };
                      onChange({ ...section, people: newPeople });
                    }}
                    placeholder={t('PeopleEditor.descriptionPlaceholder')}
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      const newPeople = section.people.filter((_: any, i: number) => i !== index);
                      onChange({ ...section, people: newPeople });
                    }}
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                const newPerson = {
                  user_uuid: '',
                  name: '',
                  description: '',
                  image_url: '',
                  username: '',
                };
                onChange({
                  ...section,
                  people: [...section.people, newPerson],
                });
              }}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('PeopleEditor.addButton')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const FeaturedCoursesEditor: FC<{
  t: Function;
  section: LandingFeaturedCourses;
  onChange: (section: LandingFeaturedCourses) => void;
}> = ({ t, section, onChange }) => {
  const { data: coursesData } = usePlatformCourses();
  const courses = coursesData?.courses;

  return (
    <div className="bg-background space-y-6 rounded-lg p-6 shadow-sm">
      <div className="flex items-center space-x-1">
        <BookOpen className="text-muted-foreground h-5 w-5" />
        <h3 className="text-lg font-medium">
          {t('SectionTypes.featuredCourses.label')} {t('Editor.titleSuffix')}
        </h3>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <Label htmlFor="title">{t('Editor.sectionTitleLabel')}</Label>
          <Input
            id="title"
            value={section.title}
            onChange={(e) => {
              onChange({ ...section, title: e.target.value });
            }}
            placeholder={t('Editor.sectionTitlePlaceholder')}
          />
        </div>

        {/* Course Selection */}
        <div>
          <Label>{t('FeaturedCoursesEditor.selectCoursesLabel')}</Label>
          <div className="mt-2 space-y-4">
            {courses ? (
              <div className="grid gap-4">
                {courses.map((course: any) => (
                  <div
                    key={course.course_uuid}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="bg-muted relative h-12 w-12 overflow-hidden rounded-md">
                        {course.course_thumbnail ? (
                          <NextImage
                            src={course.course_thumbnail}
                            alt={course.name}
                            fill
                            className="h-full w-full object-cover"
                            sizes="100vw"
                          />
                        ) : null}
                      </div>
                      <div>
                        <h4 className="font-medium">{course.name}</h4>
                        <p className="text-muted-foreground text-sm">{course.description}</p>
                      </div>
                    </div>
                    <Button
                      variant={section.courses.includes(course.course_uuid) ? 'default' : 'outline'}
                      onClick={() => {
                        const newCourses = section.courses.includes(course.course_uuid)
                          ? section.courses.filter((id) => id !== course.course_uuid)
                          : [...section.courses, course.course_uuid];
                        onChange({ ...section, courses: newCourses });
                      }}
                    >
                      {section.courses.includes(course.course_uuid)
                        ? t('FeaturedCoursesEditor.selectedButton')
                        : t('FeaturedCoursesEditor.selectButton')}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground py-8 text-center">{t('FeaturedCoursesEditor.loadingCourses')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditLanding;
