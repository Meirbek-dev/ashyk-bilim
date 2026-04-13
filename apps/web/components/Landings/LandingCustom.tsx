'use client';

import type { LandingSection } from '@/components/Dashboard/Pages/Platform/EditLanding/landing_types';
import { LoginBonusHandler } from '@/app/_shared/withmenu/_components/LoginBonusHandler';
import { GamificationProvider } from '@/components/Contexts/GamificationContext';
import { usePlatformCourses } from '@/features/platform/hooks/usePlatform';
import CourseThumbnail from '@components/Objects/Thumbnails/CourseThumbnail';
import type { DashboardData } from '@/types/gamification';
import UserAvatar from '@components/Objects/UserAvatar';
import NextImage from '@components/ui/NextImage';
import { useTranslations } from 'next-intl';

interface LandingCustomProps {
  landing: {
    sections: LandingSection[];
    enabled: boolean;
  };
  gamificationData?: DashboardData | null;
}

const LandingCustom = ({ landing, gamificationData }: LandingCustomProps) => {
  const t = useTranslations('LandingCustom');

  // Fetch all courses for the platform
  const { data: coursesData } = usePlatformCourses();
  const allCourses = coursesData?.courses;

  const renderSection = (section: LandingSection) => {
    switch (section.type) {
      case 'hero': {
        return (
          <div
            key={`hero-${section.title}`}
            className="mx-2 mt-[20px] flex min-h-[400px] w-full items-center justify-center rounded-xl border border-gray-100 sm:mx-4 sm:mt-[40px] sm:min-h-[500px] lg:mx-16"
            style={{
              background:
                section.background.type === 'solid'
                  ? section.background.color
                  : section.background.type === 'gradient'
                    ? `linear-gradient(${section.background.direction || '45deg'}, ${section.background.colors?.join(', ')})`
                    : `url(${section.background.image}) center/cover`,
            }}
          >
            <div
              className={`flex size-full flex-col sm:flex-row ${
                section.illustration?.position === 'right' ? 'sm:flex-row-reverse' : 'sm:flex-row'
              } items-stretch`}
            >
              {/* Logo */}
              {section.illustration?.image.url && section.illustration.image.url.trim() !== '' ? (
                <div
                  className={`items- flex${section.illustration.verticalAlign} w-full p-6 ${
                    section.illustration.size === 'small'
                      ? 'sm:w-1/4'
                      : section.illustration.size === 'medium'
                        ? 'sm:w-1/3'
                        : 'sm:w-2/5'
                  }`}
                >
                  <div className="relative h-full w-full">
                    <NextImage
                      src={section.illustration.image.url}
                      alt={section.illustration.image.alt ?? ''}
                      fill
                      className="object-contain"
                      sizes="100vw"
                    />
                  </div>
                </div>
              ) : null}

              {/* Content */}
              <div
                className={`flex flex-1 items-center ${
                  section.contentAlign === 'left'
                    ? 'justify-start text-left'
                    : section.contentAlign === 'right'
                      ? 'justify-end text-right'
                      : 'justify-center text-center'
                } p-6`}
              >
                <div className="max-w-2xl">
                  <h1
                    className="mb-2 text-xl font-bold sm:mb-4 sm:text-2xl md:text-3xl"
                    style={{ color: section.heading.color }}
                  >
                    {section.heading.text}
                  </h1>
                  <h2
                    className="mb-4 text-sm font-medium sm:mb-6 sm:text-base md:mb-8 md:text-lg"
                    style={{ color: section.subheading.color }}
                  >
                    {section.subheading.text}
                  </h2>
                  <div
                    className={`flex flex-col gap-3 sm:flex-row sm:gap-4 ${
                      section.contentAlign === 'left'
                        ? 'justify-start'
                        : section.contentAlign === 'right'
                          ? 'justify-end'
                          : 'justify-center'
                    } items-center`}
                  >
                    {section.buttons.map((button, index) => (
                      <a
                        key={index}
                        href={button.link}
                        className="w-full rounded-lg px-6 py-2.5 text-sm font-extrabold shadow-sm transition-transform hover:scale-105 sm:w-auto"
                        style={{
                          backgroundColor: button.background,
                          color: button.color,
                        }}
                      >
                        {button.text}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      }
      case 'text-and-image': {
        return (
          <div
            key={`text-image-${section.title}`}
            className="mx-2 w-full py-16 sm:mx-4 lg:mx-16"
          >
            <div
              className={`soft-shadow bg-card flex flex-col items-center gap-8 rounded-xl p-6 md:flex-row md:gap-12 md:p-8 lg:p-12 ${
                section.flow === 'right' ? 'md:flex-row-reverse' : ''
              }`}
            >
              <div className="w-full max-w-2xl flex-1">
                <h2 className="text-foreground mb-4 text-2xl font-bold tracking-tight md:text-3xl">{section.title}</h2>
                <div className="prose prose-lg prose-gray max-w-none">
                  <p className="text-base leading-relaxed whitespace-pre-line text-gray-600 md:text-lg">
                    {section.text}
                  </p>
                </div>
                <div className="mt-8 flex flex-wrap gap-4">
                  {section.buttons.map((button, index) => (
                    <a
                      key={index}
                      href={button.link}
                      className="rounded-xl px-6 py-3 font-medium shadow-xs transition-all duration-200 hover:scale-105"
                      style={{
                        backgroundColor: button.background,
                        color: button.color,
                      }}
                    >
                      {button.text}
                    </a>
                  ))}
                </div>
              </div>
              <div className="w-full flex-1 md:w-auto">
                <div className="relative mx-auto w-full max-w-[500px] px-4 md:px-8">
                  <div className="relative aspect-4/3 w-full">
                    {section.image.url && section.image.url.trim() !== '' ? (
                      <img
                        src={section.image.url}
                        alt={section.image.alt}
                        className="h-full w-full rounded-lg object-contain"
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      }
      case 'logos': {
        return (
          <div
            key={`logos-${section.type}`}
            className="mx-2 w-full py-16 sm:mx-4 lg:mx-16"
          >
            {section.title ? (
              <h2 className="text-foreground mb-16 text-left text-2xl font-bold md:text-3xl">{section.title}</h2>
            ) : null}
            <div className="flex w-full justify-center">
              <div className="flex max-w-7xl flex-wrap justify-center gap-16">
                {section.logos.map((logo, index) => (
                  <div
                    key={index}
                    className="flex h-[120px] w-[220px] items-center justify-center"
                  >
                    {logo.url && logo.url.trim() !== '' ? (
                      <img
                        src={logo.url}
                        alt={logo.alt}
                        className="max-h-24 max-w-[200px] object-contain transition-opacity hover:opacity-80"
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }
      case 'people': {
        return (
          <div
            key={`people-${section.title}`}
            className="mx-2 w-full py-16 sm:mx-4 lg:mx-16"
          >
            <h2 className="text-foreground mb-10 text-left text-2xl font-bold md:text-3xl">{section.title}</h2>
            <div className="flex flex-wrap justify-center gap-x-20 gap-y-8">
              {section.people.map((person, index) => (
                <div
                  key={index}
                  className="flex w-[140px] flex-col items-center"
                >
                  <div className="mb-4 h-24 w-24">
                    {person.username ? (
                      <UserAvatar
                        username={person.username}
                        size="2xl"
                        variant="outline"
                        showProfilePopup
                      />
                    ) : person.image_url && person.image_url.trim() !== '' ? (
                      <img
                        src={person.image_url}
                        alt={person.name}
                        className="soft-shadow h-full w-full rounded-full border-4 border-white object-cover"
                      />
                    ) : (
                      <div className="soft-shadow flex h-full w-full items-center justify-center rounded-full border-4 border-white bg-gray-200">
                        <span className="text-xs text-gray-400">{t('noImage')}</span>
                      </div>
                    )}
                  </div>
                  <h3 className="text-foreground text-center text-lg font-semibold">{person.name}</h3>
                  <p className="mt-1 text-center text-sm text-gray-600">{person.description}</p>
                </div>
              ))}
            </div>
          </div>
        );
      }
      case 'featured-courses': {
        if (!allCourses) {
          return (
            <div
              key={`featured-courses-${section.title}`}
              className="mx-2 w-full py-16 sm:mx-4 lg:mx-16"
            >
              <h2 className="text-foreground mb-6 text-left text-2xl font-bold md:text-3xl">{section.title}</h2>
              <div className="text-muted-foreground py-6 text-center">{t('loadingCourses')}</div>
            </div>
          );
        }

        const featuredCourses = allCourses.filter((course: any) => section.courses.includes(course.course_uuid));

        return (
          <div
            key={`featured-courses-${section.title}`}
            className="mx-2 w-full py-16 sm:mx-4 lg:mx-16"
          >
            <h2 className="text-foreground mb-6 text-left text-2xl font-bold md:text-3xl">{section.title}</h2>
            <div className="grid w-full grid-cols-1 gap-6 pb-12 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {featuredCourses.map((course: any) => (
                <div
                  key={course.course_uuid}
                  className="mx-auto w-full max-w-[300px]"
                >
                  <CourseThumbnail course={course} />
                </div>
              ))}
              {featuredCourses.length === 0 && (
                <div className="text-muted-foreground col-span-full py-6 text-center">{t('noFeaturedCourses')}</div>
              )}
            </div>
          </div>
        );
      }
      default: {
        return null;
      }
    }
  };

  return (
    <GamificationProvider initialData={{ dashboard: gamificationData }}>
      <LoginBonusHandler />
      <div className="mx-auto flex h-full w-full max-w-(--breakpoint-2xl) flex-col items-center justify-between px-4 sm:px-6 lg:px-16">
        {landing.sections.map((section) => renderSection(section))}
      </div>
    </GamificationProvider>
  );
};

export default LandingCustom;
