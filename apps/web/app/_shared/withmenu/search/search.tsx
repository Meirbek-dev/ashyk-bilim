'use client';

import { getCourseThumbnailMediaDirectory, getUserAvatarMediaDirectory } from '@services/media/media';
import { removeCoursePrefix } from '@components/Objects/Thumbnails/CourseThumbnail';
import { Book, GraduationCap, Search, Users } from 'lucide-react';
import { useSearchContent } from '@/features/search/hooks/useSearch';
import { useRouter, useSearchParams } from 'next/navigation';
import { getAbsoluteUrl } from '@services/config/config';
import UserAvatar from '@components/Objects/UserAvatar';
import NextImage from '@components/ui/NextImage';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import Link from '@components/ui/AppLink';

// Types from SearchBar component
interface User {
  username: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  avatar_image: string;
  bio: string;
  details: Record<string, any>;
  profile: Record<string, any>;
  id: number;
  user_uuid: string;
}

interface Author {
  user: User;
  authorship: string;
  authorship_status: string;
  creation_date: string;
  update_date: string;
}

interface Course {
  name: string;
  description: string;
  about: string;
  learnings: string;
  tags: string;
  thumbnail_image: string;
  public: boolean;
  open_to_contributors: boolean;
  id: number;
  authors: Author[];
  course_uuid: string;
  creation_date: string;
  update_date: string;
}

interface Collection {
  name: string;
  public: boolean;
  description: string;
  id: number;
  courses: string[];
  collection_uuid: string;
  creation_date: string;
  update_date: string;
}

interface SearchResults {
  courses: Course[];
  collections: Collection[];
  users: User[];
  total_courses: number;
  total_collections: number;
  total_users: number;
}

type ContentType = 'all' | 'courses' | 'collections' | 'users';

const FilterButton = ({
  type,
  count,
  icon: Icon,
  selectedType,
  onTypeChange,
  t,
}: {
  type: ContentType;
  count: number;
  icon: any;
  selectedType: ContentType;
  onTypeChange: (type: ContentType) => void;
  t: (key: string) => string;
}) => (
  <button
    onClick={() => {
      onTypeChange(type);
    }}
    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors ${
      selectedType === type ? 'bg-black/10 font-medium text-black/80' : 'text-black/60 hover:bg-black/5'
    }`}
  >
    <Icon size={16} />
    <span>{t(`filter${type.charAt(0).toUpperCase() + type.slice(1)}`)}</span>
    <span className="text-black/40">({count})</span>
  </button>
);

const Pagination = ({
  totalPages,
  currentPage,
  onPageChange,
}: {
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}) => {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-8 flex justify-center gap-2">
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
        <button
          key={pageNum}
          onClick={() => {
            onPageChange(pageNum);
          }}
          className={`h-8 w-8 rounded-lg text-sm transition-colors ${
            currentPage === pageNum
              ? 'bg-primary text-primary-foreground font-medium'
              : 'text-muted-foreground hover:bg-primary/10 hover:text-foreground'
          }`}
        >
          {pageNum}
        </button>
      ))}
    </div>
  );
};

const LoadingState = () => (
  <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <div
        key={i}
        className="soft-shadow bg-card animate-pulse rounded-xl p-4"
      >
        <div className="bg-muted/40 mb-4 h-32 w-full rounded-lg" />
        <div className="space-y-2">
          <div className="bg-muted/40 h-4 w-3/4 rounded" />
          <div className="bg-muted/40 h-3 w-1/2 rounded" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = ({ query, t }: { query: string; t: (key: string, params?: any) => string }) => (
  <div className="text-muted-foreground flex flex-col items-center justify-center py-16 text-center">
    <div className="bg-primary/10 mb-4 rounded-full p-4">
      <Search className="text-primary h-8 w-8" />
    </div>
    <h3 className="text-foreground mb-2 text-lg font-medium">{t('noResultsTitle')}</h3>
    <p className="text-muted-foreground max-w-md text-sm">{t('noResultsMessage', { query })}</p>
  </div>
);

const SearchPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('SearchPage');

  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');

  // URL parameters
  const query = searchParams.get('q') || '';
  const page = Number.parseInt(searchParams.get('page') || '1', 10);
  const type = (searchParams.get('type') as ContentType) || 'all';
  const perPage = 9;
  const selectedType = type;
  const searchResultsQuery = useSearchContent(query, { page, limit: perPage });
  const rawSearchResults = searchResultsQuery.data?.data;
  const searchResults: SearchResults = query.trim()
    ? {
        courses: Array.isArray(rawSearchResults?.courses) ? rawSearchResults.courses : [],
        collections: Array.isArray(rawSearchResults?.collections) ? rawSearchResults.collections : [],
        users: Array.isArray(rawSearchResults?.users) ? rawSearchResults.users : [],
        total_courses: Array.isArray(rawSearchResults?.courses) ? rawSearchResults.courses.length : 0,
        total_collections: Array.isArray(rawSearchResults?.collections) ? rawSearchResults.collections.length : 0,
        total_users: Array.isArray(rawSearchResults?.users) ? rawSearchResults.users.length : 0,
      }
    : {
        courses: [],
        collections: [],
        users: [],
        total_courses: 0,
        total_collections: 0,
        total_users: 0,
      };
  const isLoading = query.trim().length > 0 && searchResultsQuery.isPending;

  const updateSearchParams = (updates: Record<string, string>) => {
    const current = new URLSearchParams([...searchParams.entries()]);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        current.set(key, value);
      } else {
        current.delete(key);
      }
    });
    router.push(`?${current.toString()}`);
  };

  const handleSearch = (formData: FormData) => {
    const submittedQuery = String(formData.get('q') ?? '').trim();

    if (submittedQuery) {
      updateSearchParams({ q: submittedQuery, page: '1' });
    }
  };

  useEffect(() => {
    setSearchQuery(query);
  }, [query]);

  const totalResults = searchResults.total_courses + searchResults.total_collections + searchResults.total_users;
  const totalPages = Math.ceil(totalResults / perPage);

  return (
    <div className="bg-background text-foreground min-h-screen">
      {/* Search Header */}
      <div className="border-border bg-card text-card-foreground border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-foreground mb-6 text-2xl font-semibold">{t('searchTitle')}</h1>

            {/* Search Input */}
            <form
              action={handleSearch}
              className="group relative mb-6"
            >
              <Input
                name="q"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                }}
                placeholder={t('searchInputPlaceholder')}
                className="soft-shadow border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20 h-12 w-full rounded-xl border pr-4 pl-12 text-sm transition-all focus:ring-1 focus:outline-none"
              />
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                <Search
                  className="text-muted-foreground group-focus-within:text-foreground transition-colors"
                  size={20}
                />
              </div>
              <button
                type="submit"
                className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex items-center px-4 text-sm"
              >
                {t('searchButton')}
              </button>
            </form>

            {/* Filters */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <FilterButton
                type="all"
                count={totalResults}
                icon={Search}
                selectedType={selectedType}
                onTypeChange={(type) => {
                  updateSearchParams({
                    type: type === 'all' ? '' : type,
                    page: '1',
                  });
                }}
                t={t}
              />
              <FilterButton
                type="courses"
                count={searchResults.total_courses}
                icon={GraduationCap}
                selectedType={selectedType}
                onTypeChange={(type) => {
                  updateSearchParams({
                    type: type === 'all' ? '' : type,
                    page: '1',
                  });
                }}
                t={t}
              />
              <FilterButton
                type="collections"
                count={searchResults.total_collections}
                icon={Book}
                selectedType={selectedType}
                onTypeChange={(type) => {
                  updateSearchParams({
                    type: type === 'all' ? '' : type,
                    page: '1',
                  });
                }}
                t={t}
              />
              <FilterButton
                type="users"
                count={searchResults.total_users}
                icon={Users}
                selectedType={selectedType}
                onTypeChange={(type) => {
                  updateSearchParams({
                    type: type === 'all' ? '' : type,
                    page: '1',
                  });
                }}
                t={t}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Search Results */}
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-7xl">
          {query ? (
            <div className="text-muted-foreground mb-6 text-sm">
              {t('resultsFound', { count: totalResults, query })}
            </div>
          ) : null}

          {isLoading ? (
            <LoadingState />
          ) : totalResults === 0 && query ? (
            <EmptyState
              query={query}
              t={t}
            />
          ) : (
            <div className="space-y-12">
              {/* Courses Grid */}
              {(selectedType === 'all' || selectedType === 'courses') && searchResults.courses.length > 0 && (
                <div>
                  <h2 className="text-foreground mb-4 flex items-center gap-2 text-lg font-medium">
                    <GraduationCap
                      size={20}
                      className="text-muted-foreground"
                    />
                    {t('courses')} ({searchResults.courses.length})
                  </h2>
                  <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4">
                    {searchResults.courses.map((course) => (
                      <Link
                        prefetch={false}
                        key={course.course_uuid}
                        href={getAbsoluteUrl(`/course/${removeCoursePrefix(course.course_uuid)}`)}
                        className="soft-shadow group border-border bg-card text-card-foreground overflow-hidden rounded-xl border transition-all hover:shadow-md"
                      >
                        <div className="relative aspect-video w-full overflow-hidden">
                          <NextImage
                            src={
                              course.thumbnail_image
                                ? getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)
                                : '/empty_thumbnail.avif'
                            }
                            alt={course.name}
                            fill
                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                            sizes="100vw"
                          />
                        </div>
                        <div className="p-4">
                          <h3 className="text-foreground mb-1 text-sm font-medium">{course.name}</h3>
                          <p className="text-muted-foreground line-clamp-2 text-xs">{course.description}</p>
                          {course.authors && course.authors.length > 0 && course.authors[0]?.user ? (
                            <div className="mt-3 flex items-center gap-2">
                              <UserAvatar
                                size="xs"
                                avatar_url={
                                  course.authors[0].user.avatar_image
                                    ? getUserAvatarMediaDirectory(
                                        course.authors[0].user.user_uuid,
                                        course.authors[0].user.avatar_image,
                                      )
                                    : ''
                                }
                                predefined_avatar={course.authors[0].user.avatar_image ? undefined : 'empty'}
                                userId={course.authors[0].user.id}
                                showProfilePopup={false}
                              />
                              <span className="text-muted-foreground text-xs">
                                {[
                                  course.authors[0].user.first_name,
                                  course.authors[0].user.middle_name,
                                  course.authors[0].user.last_name,
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Collections Grid */}
              {(selectedType === 'all' || selectedType === 'collections') && searchResults.collections.length > 0 && (
                <div>
                  <h2 className="text-foreground mb-4 flex items-center gap-2 text-lg font-medium">
                    <Book
                      size={20}
                      className="text-muted-foreground"
                    />
                    {t('collections')} ({searchResults.collections.length})
                  </h2>
                  <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
                    {searchResults.collections.map((collection) => (
                      <Link
                        prefetch={false}
                        key={collection.collection_uuid}
                        href={getAbsoluteUrl(`/collection/${collection.collection_uuid.replace('collection_', '')}`)}
                        className="soft-shadow border-border bg-card text-card-foreground flex items-start gap-4 rounded-xl border p-4 transition-all hover:shadow-md"
                      >
                        <div className="bg-muted/20 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg">
                          <Book
                            size={24}
                            className="text-muted-foreground"
                          />
                        </div>
                        <div>
                          <h3 className="text-foreground mb-1 text-sm font-medium">{collection.name}</h3>
                          <p className="text-muted-foreground line-clamp-2 text-xs">{collection.description}</p>
                          <p className="text-muted-foreground text-xs">
                            {t('coursesCount', { count: collection.courses.length })}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Users Grid */}
              {(selectedType === 'all' || selectedType === 'users') && searchResults.users.length > 0 && (
                <div>
                  <h2 className="text-foreground mb-4 flex items-center gap-2 text-lg font-medium">
                    <Users
                      size={20}
                      className="text-muted-foreground"
                    />
                    {t('users')} ({searchResults.users.length})
                  </h2>
                  <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
                    {searchResults.users.map((user) => (
                      <Link
                        prefetch={false}
                        key={user.user_uuid}
                        href={getAbsoluteUrl(`/user/${user.username}`)}
                        className="soft-shadow border-border bg-card text-card-foreground flex items-center gap-4 rounded-xl border p-4 transition-all hover:shadow-md"
                      >
                        <UserAvatar
                          size="lg"
                          avatar_url={
                            user.avatar_image ? getUserAvatarMediaDirectory(user.user_uuid, user.avatar_image) : ''
                          }
                          predefined_avatar={user.avatar_image ? undefined : 'empty'}
                          userId={user.id}
                          showProfilePopup
                        />
                        <div>
                          <h3 className="text-foreground text-sm font-medium">
                            {[user.first_name, user.middle_name, user.last_name].filter(Boolean).join(' ')}
                          </h3>
                          <p className="text-muted-foreground text-xs">@{user.username}</p>
                          {user.details?.title?.text ? (
                            <p className="text-muted-foreground mt-1 text-xs">{user.details.title.text}</p>
                          ) : null}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <Pagination
            totalPages={totalPages}
            currentPage={page}
            onPageChange={(pageNum) => {
              updateSearchParams({ page: pageNum.toString() });
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default SearchPage;
