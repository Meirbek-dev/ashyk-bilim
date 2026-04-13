'use client';

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Globe, Image as ImageIcon, Loader2, Lock, Search } from 'lucide-react';
import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { createCollection } from '@services/courses/collections';
import { revalidateTags } from '@/lib/api-client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAbsoluteUrl } from '@services/config/config';
import { useMemo, useState, useTransition } from 'react';
import { useCourseList } from '@/hooks/useCourseList';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import NextImage from '@/components/ui/NextImage';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ChangeEvent } from 'react';
import { toast } from 'sonner';

interface CourseListItem {
  id: number;
  name: string;
  description?: string | null;
  course_uuid: string;
  thumbnail_image?: string | null;
}

const NewCollection = () => {
  const t = useTranslations('NewCollectionPage');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCourses, setSelectedCourses] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();
  const { data: courses, error, isLoading } = useCourseList();
  const [isPublic, setIsPublic] = useState(true);

  const filteredCourses = useMemo(() => {
    if (!courses || !searchQuery.trim()) return courses || [];
    const query = searchQuery.toLowerCase();
    return courses.filter(
      (course: CourseListItem) =>
        course.name.toLowerCase().includes(query) || course.description?.toLowerCase().includes(query),
    );
  }, [courses, searchQuery]);

  const handleVisibilityChange = (value: string) => {
    setIsPublic(value === 'true');
  };

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
  };

  const handleDescriptionChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(event.target.value);
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error(t('toast.missingName'));
      return;
    }

    if (!description.trim()) {
      toast.error(t('toast.missingDescription'));
      return;
    }

    if (selectedCourses.length === 0) {
      toast.error(t('toast.noCoursesSelected'));
      return;
    }

    startTransition(() => setIsSubmitting(true));
    try {
      const collection = {
        name: name.trim(),
        description: description.trim(),
        courses: selectedCourses,
        public: isPublic,
      };
      await createCollection(collection);
      await revalidateTags(['collections']);
      toast.success(t('toast.success'));
      startTransition(() => router.push(getAbsoluteUrl('/collections')));
    } catch {
      toast.error(t('toast.failure'));
    } finally {
      startTransition(() => setIsSubmitting(false));
    }
  };

  const toggleCourse = (courseId: number) => {
    setSelectedCourses((prev) =>
      prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId],
    );
  };

  const selectAll = () => {
    if (filteredCourses.length === 0) return;
    const allIds = filteredCourses.map((c: CourseListItem) => c.id);
    setSelectedCourses(allIds);
  };

  const deselectAll = () => {
    setSelectedCourses([]);
  };

  const visibilityItems = [
    {
      value: 'true',
      label: t('visibilityPublic'),
    },
    {
      value: 'false',
      label: t('visibilityPrivate'),
    },
  ] as const;

  if (error) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">{t('errorTitle')}</CardTitle>
            <CardDescription>{t('errorLoadingCourses')}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-background mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">{t('description')}</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        {/* Collection Details Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('detailsTitle')}</CardTitle>
            <CardDescription>{t('detailsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label
                  htmlFor="collection-name"
                  className="text-sm font-medium"
                >
                  {t('nameLabel')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="collection-name"
                  type="text"
                  placeholder={t('namePlaceholder')}
                  value={name}
                  onChange={handleNameChange}
                  maxLength={100}
                  className="h-10"
                />
                <p className="text-muted-foreground text-xs">{t('nameChars', { current: name.length, max: 100 })}</p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="collection-visibility"
                  className="text-sm font-medium"
                >
                  {t('visibilityLabel')} <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={String(isPublic)}
                  onValueChange={(value) => value !== null && handleVisibilityChange(value)}
                  items={visibilityItems}
                >
                  <SelectTrigger
                    id="collection-visibility"
                    className="h-10"
                  >
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectGroup>
                      {visibilityItems.map((item) => (
                        <SelectItem
                          key={item.value}
                          value={item.value}
                        >
                          <div className="flex items-center gap-2">
                            {item.value === 'true' ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            <span>{item.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="collection-description"
                className="text-sm font-medium"
              >
                {t('descriptionLabel')} <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="collection-description"
                placeholder={t('descriptionPlaceholder')}
                value={description}
                onChange={handleDescriptionChange}
                rows={4}
                maxLength={500}
                className="resize-none"
              />
              <p className="text-muted-foreground text-xs">
                {t('descriptionChars', { current: description.length, max: 500 })}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Course Selection Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">
                  {t('selectCoursesLabel')} <span className="text-red-500">*</span>
                </CardTitle>
                <CardDescription>{t('selectCoursesDescription')}</CardDescription>
              </div>
              {selectedCourses.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-auto"
                >
                  {t('selectedCount', { count: selectedCourses.length })}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Loader2 className="text-primary mx-auto h-8 w-8 animate-spin" />
                  <p className="text-muted-foreground mt-2 text-sm">{t('loadingCourses')}</p>
                </div>
              </div>
            ) : courses?.length === 0 ? (
              <div className="rounded-lg border border-dashed py-12 text-center">
                <ImageIcon className="text-muted-foreground mx-auto h-12 w-12" />
                <p className="text-muted-foreground mt-2 text-sm">{t('noCoursesAvailable')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Search and Actions */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative flex-1">
                    <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      placeholder={t('searchPlaceholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={selectAll}
                      disabled={filteredCourses.length === 0}
                    >
                      {t('selectAllButton')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={deselectAll}
                      disabled={selectedCourses.length === 0}
                    >
                      {t('clearButton')}
                    </Button>
                  </div>
                </div>

                {/* Course List */}
                <ScrollArea className="h-[400px] rounded-lg border">
                  <div className="space-y-2 p-4">
                    {filteredCourses.length === 0 ? (
                      <div className="text-muted-foreground py-8 text-center text-sm">
                        {t('noCoursesFound', { query: searchQuery })}
                      </div>
                    ) : (
                      filteredCourses.map((course: CourseListItem) => {
                        const isSelected = selectedCourses.includes(course.id);
                        return (
                          <div
                            key={course.id}
                            onClick={() => toggleCourse(course.id)}
                            className={`group hover:border-primary hover:bg-accent relative flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-all ${
                              isSelected ? 'border-primary bg-accent' : ''
                            }`}
                          >
                            <Checkbox
                              checked={isSelected}
                              className="mt-1"
                              onCheckedChange={() => toggleCourse(course.id)}
                            />
                            <div className="bg-muted relative h-20 w-32 shrink-0 overflow-hidden rounded-md border">
                              {course.thumbnail_image ? (
                                <div className="relative h-full w-full">
                                  <NextImage
                                    src={getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)}
                                    alt={course.name}
                                    fill
                                    className="object-cover"
                                    sizes="100vw"
                                  />
                                </div>
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <ImageIcon className="text-muted-foreground h-8 w-8" />
                                </div>
                              )}
                              {isSelected && (
                                <div className="bg-primary/20 absolute inset-0 flex items-center justify-center">
                                  <CheckCircle2 className="text-primary h-6 w-6" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-foreground leading-tight font-medium">{course.name}</h3>
                              {course.description && (
                                <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{course.description}</p>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="bg-muted/50 flex items-center justify-between rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">{t('selectedCount', { count: selectedCourses.length })}</p>
          <div className="flex gap-3">
            <Button
              type="button"
              onClick={() => router.back()}
              variant="outline"
            >
              {t('cancelButton')}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isPending}
              className="min-w-[120px]"
            >
              {isSubmitting || isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('creatingButton')}
                </>
              ) : (
                t('createButton')
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default NewCollection;
