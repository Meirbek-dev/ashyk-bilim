'use client';
import {
  ArrowRight,
  ArrowUpRight,
  Book,
  GraduationCap,
  ScanSearch,
  Search,
  Sparkles,
  TextSearch,
  Users,
} from 'lucide-react';
import { getCourseThumbnailMediaDirectory, getUserAvatarMediaDirectory } from '@services/media/media';
import { useSearchContent } from '@/features/search/hooks/useSearch';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { removeCoursePrefix } from '../Thumbnails/CourseThumbnail';
import type { ChangeEvent, FC, KeyboardEvent } from 'react';
import { getAbsoluteUrl } from '@services/config/config';
import { useDebouncedValue } from '@/hooks/useDebounce';
import NextImage from '@components/ui/NextImage';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import UserAvatar from '../UserAvatar';

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
}

interface SearchBarProps {
  className?: string;
  isMobile?: boolean;
  showSearchSuggestions?: boolean;
}

const CourseResultsSkeleton = () => (
  <div className="p-2">
    <div className="flex items-center gap-2 px-2 py-2">
      <div className="bg-muted h-4 w-4 animate-pulse rounded" />
      <div className="bg-muted h-4 w-20 animate-pulse rounded" />
    </div>
    {[1, 2].map((i) => (
      <div
        key={i}
        className="flex items-center gap-3 p-2"
      >
        <div className="bg-muted h-10 w-10 animate-pulse rounded-lg" />
        <div className="flex-1">
          <div className="bg-muted mb-2 h-4 w-48 animate-pulse rounded" />
          <div className="bg-muted h-3 w-32 animate-pulse rounded" />
        </div>
      </div>
    ))}
  </div>
);

export const SearchBar: FC<SearchBarProps> = ({ className = '', isMobile = false, showSearchSuggestions = false }) => {
  const t = useTranslations('Components.SearchBar');
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Debounce the search query value
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const searchQueryResult = useSearchContent(debouncedSearch, { page: 1, limit: 3 });
  const rawSearchResults = searchQueryResult.data?.data;
  const searchResults: SearchResults = {
    courses: Array.isArray(rawSearchResults?.courses) ? rawSearchResults.courses : [],
    collections: Array.isArray(rawSearchResults?.collections) ? rawSearchResults.collections : [],
    users: Array.isArray(rawSearchResults?.users) ? rawSearchResults.users : [],
  };
  const isLoading = debouncedSearch.trim().length > 0 && searchQueryResult.isPending;

  const handleClickOutside = useEffectEvent((event: MouseEvent) => {
    if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
      setShowResults(false);
    }
  });

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const MemoizedEmptyState = !searchQuery.trim() ? (
    <div className="px-4 py-8">
      <div className="flex flex-col items-center text-center">
        <div className="bg-muted mb-4 rounded-full p-3">
          <Sparkles className="text-muted-foreground h-6 w-6" />
        </div>
        <h3 className="text-foreground mb-1 text-sm font-medium">{t('discoverTitle')}</h3>
        <p className="text-muted-foreground max-w-[240px] text-xs">{t('discoverSubtitle')}</p>
      </div>
    </div>
  ) : null;

  // Calculate if we should show the dropdown

  const searchTerms = [
    {
      term: searchQuery,
      type: 'exact',
      icon: (
        <Search
          size={14}
          className="text-muted-foreground"
        />
      ),
    },
    {
      term: `${searchQuery} ${t('coursesSection').toLowerCase()}`,
      type: 'courses',
      icon: (
        <GraduationCap
          size={14}
          className="text-muted-foreground"
        />
      ),
    },
    {
      term: `${searchQuery} ${t('collectionsSection').toLowerCase()}`,
      type: 'collections',
      icon: (
        <Book
          size={14}
          className="text-muted-foreground"
        />
      ),
    },
  ];

  const MemoizedSearchSuggestions = searchQuery.trim() ? (
    <div className="p-2">
      <div className="text-muted-foreground flex items-center gap-2 px-2 py-2 text-sm">
        <ScanSearch size={16} />
        <span className="font-medium">{t('suggestionsTitle')}</span>
      </div>
      <div className="space-y-1">
        {searchTerms.map(({ term, type, icon }) => (
          <Link
            prefetch={false}
            key={`${term}-${type}`}
            href={getAbsoluteUrl(`/search?q=${encodeURIComponent(term)}`)}
            className="group hover:bg-accent flex items-center rounded-lg px-3 py-2 transition-colors"
          >
            <div className="flex flex-1 items-center gap-2">
              {icon}
              <span className="text-foreground text-sm">{term}</span>
            </div>
            <ArrowUpRight
              size={14}
              className="text-muted-foreground group-hover:text-foreground transition-colors"
            />
          </Link>
        ))}
      </div>
    </div>
  ) : null;

  const MemoizedQuickResults = (() => {
    const hasResults =
      searchResults.courses.length > 0 || searchResults.collections.length > 0 || searchResults.users.length > 0;

    if (!hasResults) return null;

    return (
      <div className="p-2">
        <div className="text-muted-foreground flex items-center gap-2 px-2 py-2 text-sm">
          <TextSearch size={16} />
          <span className="font-medium">{t('quickResultsTitle')}</span>
        </div>

        {searchResults.courses.length > 0 ? (
          <div className="mb-2">
            <div className="text-muted-foreground flex items-center gap-2 px-2 py-1 text-xs">
              <GraduationCap size={12} />
              <span>{t('coursesSection')}</span>
            </div>
            {searchResults.courses.map((course) => (
              <Link
                prefetch={false}
                key={course.course_uuid}
                href={getAbsoluteUrl(`/course/${removeCoursePrefix(course.course_uuid)}`)}
                className="hover:bg-accent flex items-center gap-3 rounded-lg p-2 transition-colors"
              >
                <div className="relative h-10 w-10">
                  {course.thumbnail_image ? (
                    <NextImage
                      src={getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)}
                      alt={course.name}
                      fill
                      className="rounded-lg object-cover"
                      sizes="100vw"
                    />
                  ) : (
                    <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
                      <Book
                        size={20}
                        className="text-muted-foreground"
                      />
                    </div>
                  )}
                  <div className="bg-background ring-border absolute -right-1 -bottom-1 rounded-full p-1 shadow-sm ring-1">
                    <GraduationCap
                      size={11}
                      className="text-muted-foreground"
                    />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-foreground truncate text-sm font-medium">{course.name}</h3>
                    <span className="text-muted-foreground text-[10px] font-medium tracking-wide whitespace-nowrap uppercase">
                      {t('courseType')}
                    </span>
                  </div>
                  <p className="text-muted-foreground truncate text-xs">{course.description}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : null}

        {searchResults.collections.length > 0 ? (
          <div className="mb-2">
            <div className="text-muted-foreground flex items-center gap-2 px-2 py-1 text-xs">
              <Book size={12} />
              <span>{t('collectionsSection')}</span>
            </div>
            {searchResults.collections.map((collection) => (
              <Link
                prefetch={false}
                key={collection.collection_uuid}
                href={getAbsoluteUrl(`/collection/${collection.collection_uuid}`)}
                className="hover:bg-accent flex items-center gap-3 rounded-lg p-2 transition-colors"
              >
                <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
                  <Book
                    size={20}
                    className="text-muted-foreground"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-foreground truncate text-sm font-medium">{collection.name}</h3>
                    <span className="text-muted-foreground text-[10px] font-medium tracking-wide whitespace-nowrap uppercase">
                      {t('collectionType')}
                    </span>
                  </div>
                  <p className="text-muted-foreground truncate text-xs">{collection.description}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : null}

        {searchResults.users.length > 0 ? (
          <div className="mb-2">
            <div className="text-muted-foreground flex items-center gap-2 px-2 py-1 text-xs">
              <Users size={12} />
              <span>{t('usersSection')}</span>
            </div>
            {searchResults.users.map((user) => (
              <Link
                prefetch={false}
                key={user.user_uuid}
                href={getAbsoluteUrl(`/user/${user.username}`)}
                className="hover:bg-accent flex items-center gap-3 rounded-lg p-2 transition-colors"
              >
                <UserAvatar
                  size="md"
                  avatar_url={user.avatar_image ? getUserAvatarMediaDirectory(user.user_uuid, user.avatar_image) : ''}
                  predefined_avatar={user.avatar_image ? undefined : 'empty'}
                  userId={user.id}
                  showProfilePopup
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-foreground truncate text-sm font-medium">
                      {[user.first_name, user.middle_name, user.last_name].filter(Boolean).join(' ')}
                    </h3>
                    <span className="text-muted-foreground text-[10px] font-medium tracking-wide whitespace-nowrap uppercase">
                      {t('userType')}
                    </span>
                  </div>
                  <p className="text-muted-foreground truncate text-xs">@{user.username}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    );
  })();

  function handleSearchChange(e: ChangeEvent<HTMLInputElement>) {
    setSearchQuery(e.target.value);
    setShowResults(true);
  }

  // handler for Enter key press
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && searchQuery.trim().length > 0) {
      globalThis.location.href = getAbsoluteUrl(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  }

  return (
    <div
      ref={searchRef}
      className={`relative ${className}`}
    >
      <div className="group relative">
        <Input
          type="search"
          className="peer ps-10 pe-2"
          value={searchQuery}
          onChange={handleSearchChange}
          onFocus={() => {
            setShowResults(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('placeholder')}
        />
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
          <Search
            className="text-muted-foreground group-focus-within:text-foreground transition-colors"
            size={16}
          />
        </div>
      </div>

      <div
        className={`soft-shadow divide-border border-border bg-card text-card-foreground absolute z-50 mt-2 max-h-[min(60vh,28rem)] w-full divide-y overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl border transition-all duration-200 ease-in-out ${showResults ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'} ${isMobile ? 'max-w-full' : 'min-w-[240px]'}`}
      >
        {showResults ? (
          !searchQuery.trim() ? (
            MemoizedEmptyState
          ) : (
            <>
              {showSearchSuggestions ? MemoizedSearchSuggestions : null}
              {isLoading ? (
                <CourseResultsSkeleton />
              ) : (
                <>
                  {MemoizedQuickResults}
                  {(searchResults.courses.length > 0 ||
                    searchResults.collections.length > 0 ||
                    searchResults.users.length > 0 ||
                    searchQuery.trim()) && (
                    <Link
                      prefetch={false}
                      href={getAbsoluteUrl(`/search?q=${encodeURIComponent(searchQuery)}`)}
                      className="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center justify-between px-4 py-2.5 text-xs transition-colors"
                    >
                      <span>{t('viewAllResults')}</span>
                      <ArrowRight size={14} />
                    </Link>
                  )}
                </>
              )}
            </>
          )
        ) : null}
      </div>
    </div>
  );
};
