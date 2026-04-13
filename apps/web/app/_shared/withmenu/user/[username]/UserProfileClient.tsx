'use client';

import {
  Award,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Globe,
  GraduationCap,
  Laptop2,
  Lightbulb,
  Link as LinkIcon,
  Loader2,
  MapPin,
  Users,
  X,
} from 'lucide-react';
import { useUserCourses } from '@/features/users/hooks/useUsers';
import CourseThumbnail from '@components/Objects/Thumbnails/CourseThumbnail';
import { getUserAvatarMediaDirectory } from '@services/media/media';
import UserAvatar from '@components/Objects/UserAvatar';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { FC } from 'react';
import Image from 'next/image';

interface UserProfileClientProps {
  userData: any;
  profile: any;
}

const ICON_MAP = {
  'briefcase': Briefcase,
  'graduation-cap': GraduationCap,
  'map-pin': MapPin,
  'building-2': Building2,
  'speciality': Lightbulb,
  'globe': Globe,
  'laptop-2': Laptop2,
  'award': Award,
  'book-open': BookOpen,
  'link': LinkIcon,
  'users': Users,
  'calendar': Calendar,
} as const;

const IconComponent = ({ iconName }: { iconName: string }) => {
  const IconElement = ICON_MAP[iconName as keyof typeof ICON_MAP];
  if (!IconElement) return null;
  return <IconElement className="text-muted-foreground h-4 w-4" />;
};

const ImageModal: FC<{
  image: { url: string; caption?: string };
  onClose: () => void;
}> = ({ image, onClose }) => {
  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl">
        <button
          onClick={onClose}
          className="text-foreground hover:text-muted-foreground absolute -top-10 right-0 transition-colors"
        >
          <X className="h-6 w-6" />
        </button>
        <Image
          src={image.url}
          alt={image.caption || ''}
          width={800}
          height={600}
          className="h-auto w-full rounded-lg"
        />
        {image.caption ? <p className="text-foreground mt-4 text-center text-lg">{image.caption}</p> : null}
      </div>
    </div>
  );
};

const UserProfileClient = ({ userData, profile }: UserProfileClientProps) => {
  const t = useTranslations('UserProfilePage');
  const [selectedImage, setSelectedImage] = useState<{
    url: string;
    caption?: string;
  } | null>(null);
  const userCoursesQuery = useUserCourses(userData.id, { enabled: Boolean(userData.id) });
  const userCourses = userCoursesQuery.data ?? [];
  const isLoadingCourses = userCoursesQuery.isPending;
  const error = userCoursesQuery.isError;

  return (
    <div className="text-foreground container mx-auto py-8">
      {/* Banner */}
      <div className="bg-muted relative mb-0 h-48 w-full overflow-hidden rounded-t-xl">
        {/* Optional banner content */}
      </div>
      {/* Profile Content */}
      <div className="soft-shadow border-border bg-card text-card-foreground relative rounded-b-xl border p-8 shadow-sm">
        {/* Avatar Positioned on the banner */}
        <div className="absolute -top-24 left-12">
          <div className="border-background overflow-hidden rounded-full border-4 shadow-lg">
            <UserAvatar
              size="3xl"
              avatar_url={
                userData.avatar_image ? getUserAvatarMediaDirectory(userData.user_uuid, userData.avatar_image) : ''
              }
              {...(!userData.avatar_image && { predefined_avatar: 'empty' })}
              userId={userData.id}
              showProfilePopup
            />
          </div>
        </div>

        {/* Affiliation Logos */}
        <div className="absolute -top-12 right-8 flex items-center gap-4">
          {profile.sections?.map(
            (section: any) =>
              section.type === 'affiliation' &&
              section.affiliations?.map(
                (affiliation: any, index: number) =>
                  affiliation.logoUrl && (
                    <div
                      key={index}
                      className="border-background bg-card rounded-lg border-2 p-2 shadow-lg"
                    >
                      <Image
                        src={affiliation.logoUrl}
                        alt={affiliation.name}
                        width={64}
                        height={64}
                        className="h-16 w-16 object-contain"
                        title={affiliation.name}
                      />
                    </div>
                  ),
              ),
          )}
        </div>

        {/* Profile Content with right padding to avoid overlap */}
        <div className="mt-20 md:mt-14">
          <div className="flex flex-col gap-12 md:flex-row">
            {/* Left column with details - aligned with avatar */}
            <div className="w-full pl-2 md:w-1/6">
              {/* Name */}
              <h1 className="text-foreground mb-8 text-[32px] font-bold">
                {[userData.first_name, userData.middle_name, userData.last_name].filter(Boolean).join(' ')}
              </h1>

              {/* Details */}
              <div className="flex flex-col space-y-3">
                {userData.details
                  ? Object.values(userData.details).map((detail: any) => (
                      <div
                        key={detail.id}
                        className="flex items-center gap-4"
                      >
                        <div className="shrink-0">
                          <IconComponent iconName={detail.icon} />
                        </div>
                        <span className="text-muted-foreground text-[15px] font-medium">{detail.text}</span>
                      </div>
                    ))
                  : null}
              </div>
            </div>

            {/* Right column with about and related content */}
            <div className="w-full md:w-4/6">
              <div className="mb-8">
                <h2 className="mb-4 text-xl font-semibold">{t('aboutTitle')}</h2>
                {userData.bio ? (
                  <p className="text-muted-foreground">{userData.bio}</p>
                ) : (
                  <p className="text-muted-foreground italic">{t('noBiography')}</p>
                )}
              </div>

              {/* Profile sections from profile builder */}
              {profile.sections && profile.sections.length > 0 ? (
                <div>
                  {profile.sections.map((section: any, index: number) => (
                    <div
                      key={index}
                      className="mb-8"
                    >
                      <h2 className="mb-4 text-xl font-semibold">{section.title}</h2>

                      {/* Add Image Gallery section */}
                      {section.type === 'image-gallery' && (
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                          {section.images.map((image: any, imageIndex: number) => (
                            <div
                              key={imageIndex}
                              className="group relative cursor-pointer"
                              onClick={() => {
                                setSelectedImage(image);
                              }}
                            >
                              <Image
                                src={image.url}
                                alt={image.caption || ''}
                                width={300}
                                height={192}
                                className="h-48 w-full rounded-lg object-cover"
                              />
                              {image.caption ? (
                                <div className="bg-background/70 absolute inset-0 flex items-center justify-center rounded-lg p-4 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
                                  <p className="text-foreground text-center text-sm">{image.caption}</p>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}

                      {section.type === 'text' && <div className="prose max-w-none">{section.content}</div>}

                      {section.type === 'links' && (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          {section.links.map((link: any, linkIndex: number) => (
                            <a
                              key={linkIndex}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:text-primary/80 flex items-center gap-2"
                            >
                              <LinkIcon className="h-4 w-4" />
                              <span>{link.title}</span>
                            </a>
                          ))}
                        </div>
                      )}

                      {section.type === 'skills' && (
                        <div className="flex flex-wrap gap-2">
                          {section.skills.map((skill: any, skillIndex: number) => (
                            <span
                              key={skillIndex}
                              className="bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-sm"
                            >
                              {skill.name}
                              {skill.level ? ` • ${skill.level}` : null}
                            </span>
                          ))}
                        </div>
                      )}

                      {section.type === 'experience' && (
                        <div className="space-y-4">
                          {section.experiences.map((exp: any, expIndex: number) => (
                            <div
                              key={expIndex}
                              className="border-border border-l-2 pl-4"
                            >
                              <h3 className="font-medium">{exp.title}</h3>
                              <p className="text-muted-foreground">{exp.organization}</p>
                              <p className="text-muted-foreground text-sm">
                                {exp.startDate} - {exp.current ? 'Present' : exp.endDate}
                              </p>
                              {exp.description ? <p className="text-muted-foreground mt-2">{exp.description}</p> : null}
                            </div>
                          ))}
                        </div>
                      )}

                      {section.type === 'education' && (
                        <div className="space-y-4">
                          {section.education.map((edu: any, eduIndex: number) => (
                            <div
                              key={eduIndex}
                              className="border-border border-l-2 pl-4"
                            >
                              <h3 className="font-medium">{edu.institution}</h3>
                              <p className="text-muted-foreground">
                                {edu.degree} {t('in')} {edu.field}
                              </p>
                              <p className="text-muted-foreground text-sm">
                                {edu.startDate} - {edu.current ? 'Present' : edu.endDate}
                              </p>
                              {edu.description ? <p className="text-muted-foreground mt-2">{edu.description}</p> : null}
                            </div>
                          ))}
                        </div>
                      )}

                      {section.type === 'affiliation' && (
                        <div className="space-y-4">
                          {section.affiliations.map((affiliation: any, affIndex: number) => (
                            <div
                              key={affIndex}
                              className="border-border border-l-2 pl-4"
                            >
                              <div className="flex items-start gap-4">
                                {affiliation.logoUrl ? (
                                  <Image
                                    src={affiliation.logoUrl}
                                    alt={affiliation.name}
                                    width={48}
                                    height={48}
                                    className="h-12 w-12 object-contain"
                                  />
                                ) : null}
                                <div>
                                  <h3 className="font-medium">{affiliation.name}</h3>
                                  {affiliation.description ? (
                                    <p className="text-muted-foreground mt-2">{affiliation.description}</p>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {section.type === 'courses' && (
                        <div>
                          {isLoadingCourses ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-8 w-8 animate-spin" />
                            </div>
                          ) : userCourses.length > 0 ? (
                            <div className="grid w-full grid-cols-1 gap-6 pb-8 sm:grid-cols-1 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
                              {userCourses.map((course) => (
                                <div
                                  key={course.id}
                                  className="mx-auto w-full max-w-[300px]"
                                >
                                  <CourseThumbnail
                                    course={{
                                      ...course,
                                      authors: course.authors?.map((author) => ({
                                        authorship: author.authorship,
                                        authorship_status: author.authorship_status,
                                        user: {
                                          id: author.user.id,
                                          user_uuid: author.user.user_uuid,
                                          avatar_image: author.user.avatar_image ?? '',
                                          first_name: author.user.first_name,
                                          middle_name: author.user.middle_name ?? undefined,
                                          last_name: author.user.last_name,
                                          username: author.user.username,
                                        },
                                      })),
                                      description: course.description ?? '',
                                      thumbnail_image: course.thumbnail_image ?? '',
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-muted-foreground py-8 text-center">
                              {t('courseSection.noCoursesFound')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}

              {error ? <div className="text-destructive">{t('courseSection.errorLoadingCourses')}</div> : null}
            </div>
          </div>
        </div>
      </div>
      {/* Image Modal */}
      {selectedImage ? (
        <ImageModal
          image={selectedImage}
          onClose={() => {
            setSelectedImage(null);
          }}
        />
      ) : null}
    </div>
  );
};

export default UserProfileClient;
