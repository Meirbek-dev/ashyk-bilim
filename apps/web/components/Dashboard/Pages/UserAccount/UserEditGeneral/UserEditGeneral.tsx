'use client';
import {
  AlertTriangle,
  ArrowBigUpDash,
  Award,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Check,
  FileWarning,
  Globe,
  GraduationCap,
  Info,
  Laptop2,
  Lightbulb,
  Link,
  Loader2,
  MapPin,
  UploadCloud,
  Users,
} from 'lucide-react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select';
import { updateProfile, updateUserAvatar } from '@/lib/users/client';
import { useSession } from '@/hooks/useSession';
import { logout } from '@services/auth/auth';
import { Field, FieldContent, FieldError, FieldLabel } from '@components/ui/field';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { useDebouncedCallback } from '@/hooks/useDebounce';
import { getAbsoluteUrl } from '@services/config/config';
import UserAvatar from '@components/Objects/UserAvatar';
import { constructAcceptValue } from '@/lib/constants';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { ChangeEvent, ElementType } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Textarea } from '@components/ui/textarea';
import { ThemeSelector } from '@/lib/theme-system';
import { Button } from '@components/ui/button';
import { getUserLocale } from '@/i18n/locale';
import { Label } from '@components/ui/label';
import { Input } from '@components/ui/input';
import type { Locale } from '@/i18n/config';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import * as v from 'valibot';

const SUPPORTED_FILES = constructAcceptValue(['jpg', 'png', 'webp', 'gif', 'avif']);

const iconComponentMap = {
  'briefcase': Briefcase,
  'graduation-cap': GraduationCap,
  'map-pin': MapPin,
  'building-2': Building2,
  'speciality': Lightbulb,
  'globe': Globe,
  'laptop-2': Laptop2,
  'award': Award,
  'book-open': BookOpen,
  'link': Link,
  'users': Users,
  'calendar': Calendar,
};

const IconComponent = ({ iconName }: { iconName: string }) => {
  const IconElement = iconComponentMap[iconName as keyof typeof iconComponentMap];
  if (!IconElement) return null;
  return <IconElement className="h-4 w-4" />;
};

interface DetailItem {
  id: string;
  label: string;
  icon: string;
  text: string;
}

interface FormValues {
  username: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  bio?: string;
  details: Record<string, DetailItem>;
}

const createValidationSchema = (t: (key: string, values?: any) => string) =>
  v.object({
    email: v.pipe(
      v.string(),
      v.minLength(1, t('Form.requiredField', { fieldName: 'Email' })),
      v.email(t('Form.invalidEmail')),
    ),
    username: v.pipe(v.string(), v.minLength(1, t('Form.requiredField', { fieldName: 'Username' }))),
    first_name: v.pipe(v.string(), v.minLength(1, t('Form.requiredField', { fieldName: 'First name' }))),
    middle_name: v.optional(v.pipe(v.string(), v.maxLength(100, t('Form.maxChars', { count: 100 })))),
    last_name: v.pipe(v.string(), v.minLength(1, t('Form.requiredField', { fieldName: 'Last name' }))),
    bio: v.optional(v.pipe(v.string(), v.maxLength(400, t('Form.maxChars', { count: 400 })))),
    details: v.record(
      v.string(),
      v.object({
        id: v.string(),
        label: v.string(),
        icon: v.string(),
        text: v.string(),
      }),
    ),
  });

const DetailCard = ({
  id,
  detail,
  onUpdate,
  onRemove,
  onLabelChange,
  availableIcons,
}: {
  id: string;
  detail: DetailItem;
  onUpdate: (id: string, field: keyof DetailItem, value: string) => void;
  onRemove: (id: string) => void;
  onLabelChange: (id: string, newLabel: string) => void;
  availableIcons: readonly {
    name: string;
    label: string;
    component: ElementType;
  }[];
}) => {
  // Use lazy initialization to set initial label from prop
  const [localLabel, setLocalLabel] = useState(() => detail.label);
  const [isUserInput, setIsUserInput] = useState(false);
  const t = useTranslations('DashPage.UserAccountSettings.generalSection');

  const iconItems = availableIcons.map((icon) => ({
    value: icon.name,
    label: (
      <div className="flex items-center gap-2">
        <icon.component className="h-4 w-4" />
        <span>{icon.label}</span>
      </div>
    ),
  }));

  // Create a stable callback for label changes - only for user input
  const stableLabelChangeCallback = (newLabel: string) => {
    if (isUserInput && newLabel !== detail.label) {
      onLabelChange(id, newLabel);
    }
  };

  // Debounce the label change handler
  const debouncedLabelChange = useDebouncedCallback(stableLabelChangeCallback, 500);

  const handleLabelChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newLabel = e.target.value;
    setLocalLabel(newLabel);
    setIsUserInput(true);
    debouncedLabelChange(newLabel);
  };

  const handleIconChange = (value: string) => {
    onUpdate(id, 'icon', value);
  };

  const handleTextChange = (e: ChangeEvent<HTMLInputElement>) => {
    onUpdate(id, 'text', e.target.value);
  };

  const handleRemove = () => {
    onRemove(id);
  };

  return (
    <div className="space-y-2 rounded-lg border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <Input
          value={localLabel}
          onChange={handleLabelChange}
          placeholder={t('detailLabelPlaceholder')}
          className="max-w-[200px]"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-red-500 hover:text-red-700"
          onClick={handleRemove}
        >
          {t('detailRemove')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t('detailIconLabel')}</Label>
          <Select
            value={detail.icon}
            onValueChange={(value) => value && handleIconChange(value)}
            items={iconItems}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('detailSelectIconPlaceholder')}>
                {detail.icon ? (
                  <div className="flex items-center gap-2">
                    <IconComponent iconName={detail.icon} />
                    <span>{availableIcons.find((i) => i.name === detail.icon)?.label}</span>
                  </div>
                ) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {iconItems.map((item) => (
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
        <div>
          <Label>{t('detailTextLabel')}</Label>
          <Input
            value={detail.text}
            onChange={handleTextChange}
            placeholder={t('detailTextPlaceholder')}
          />
        </div>
      </div>
    </div>
  );
};

interface UserEditFormProps {
  form: UseFormReturn<FormValues>;
  profilePicture: {
    error: string | undefined;
    success: string;
    isLoading: boolean;
    localAvatar: File | null;
    handleFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  };
}

// Form component to handle the details section
const UserEditForm = ({ form, profilePicture }: UserEditFormProps) => {
  const tIcons = useTranslations('Components.UserProfilePopup.Icons');
  const tTemplates = useTranslations('DashPage.UserAccountSettings.generalSection.detailTemplateLabels');
  const t = useTranslations('DashPage.UserAccountSettings.generalSection');

  const AVAILABLE_ICONS = [
    { name: 'briefcase', label: tIcons('briefcase'), component: Briefcase },
    { name: 'graduation-cap', label: tIcons('graduation-cap'), component: GraduationCap },
    { name: 'map-pin', label: tIcons('map-pin'), component: MapPin },
    { name: 'building-2', label: tIcons('building-2'), component: Building2 },
    { name: 'speciality', label: tIcons('speciality'), component: Lightbulb },
    { name: 'globe', label: tIcons('globe'), component: Globe },
    { name: 'laptop-2', label: tIcons('laptop-2'), component: Laptop2 },
    { name: 'award', label: tIcons('award'), component: Award },
    { name: 'book-open', label: tIcons('book-open'), component: BookOpen },
    { name: 'link', label: tIcons('link'), component: Link },
    { name: 'users', label: tIcons('users'), component: Users },
    { name: 'calendar', label: tIcons('calendar'), component: Calendar },
  ] as const;

  const DETAIL_TEMPLATES = {
    general: [
      { id: 'title', label: tTemplates('title'), icon: 'briefcase', text: '' },
      { id: 'affiliation', label: tTemplates('affiliation'), icon: 'building-2', text: '' },
      { id: 'location', label: tTemplates('location'), icon: 'map-pin', text: '' },
      { id: 'website', label: tTemplates('website'), icon: 'globe', text: '' },
      { id: 'linkedin', label: tTemplates('linkedin'), icon: 'link', text: '' },
    ],
    academic: [
      { id: 'institution', label: tTemplates('institution'), icon: 'building-2', text: '' },
      { id: 'department', label: tTemplates('department'), icon: 'graduation-cap', text: '' },
      { id: 'research', label: tTemplates('research'), icon: 'book-open', text: '' },
      { id: 'academic-title', label: tTemplates('academic-title'), icon: 'award', text: '' },
    ],
    professional: [
      { id: 'company', label: tTemplates('company'), icon: 'building-2', text: '' },
      { id: 'industry', label: tTemplates('industry'), icon: 'briefcase', text: '' },
      { id: 'expertise', label: tTemplates('expertise'), icon: 'laptop-2', text: '' },
      { id: 'community', label: tTemplates('community'), icon: 'users', text: '' },
    ],
  } as const;

  const details = useWatch({ control: form.control, name: 'details', defaultValue: {} });

  return (
    <div>
      <div className="flex flex-col gap-0">
        <div className="mx-3 my-3 flex flex-col -space-y-1 rounded-md bg-gray-50 px-5 py-3">
          <h1 className="text-xl font-bold text-gray-800">{t('title')}</h1>
          <h2 className="text-base text-gray-500">{t('description')}</h2>
        </div>

        <div className="mx-5 my-5 mt-0 flex flex-col gap-8 lg:flex-row">
          {/* Profile Information Section */}
          <div className="min-w-0 flex-1 space-y-4">
            <Controller
              control={form.control}
              name="email"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>{t('email')}</FieldLabel>
                  <FieldContent>
                    <Input
                      id={field.name}
                      type="email"
                      placeholder={t('emailPlaceholder')}
                      {...field}
                    />
                  </FieldContent>
                  <FieldError errors={[fieldState.error]} />
                  <div className="mt-2 flex items-center space-x-2 rounded-md bg-amber-50 p-2 text-amber-600">
                    <AlertTriangle size={16} />
                    <span className="text-sm">{t('emailChangeWarning')}</span>
                  </div>
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="username"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>{t('username')}</FieldLabel>
                  <FieldContent>
                    <Input
                      id={field.name}
                      placeholder={t('usernamePlaceholder')}
                      {...field}
                    />
                  </FieldContent>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="first_name"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>{t('firstName')}</FieldLabel>
                  <FieldContent>
                    <Input
                      id={field.name}
                      placeholder={t('firstNamePlaceholder')}
                      {...field}
                    />
                  </FieldContent>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="middle_name"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>{t('middleName')}</FieldLabel>
                  <FieldContent>
                    <Input
                      id={field.name}
                      placeholder={t('middleNamePlaceholder')}
                      {...field}
                    />
                  </FieldContent>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="last_name"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>{t('lastName')}</FieldLabel>
                  <FieldContent>
                    <Input
                      id={field.name}
                      placeholder={t('lastNamePlaceholder')}
                      {...field}
                    />
                  </FieldContent>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="bio"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>
                    {t('bio')}
                    <span className="text-sm text-gray-500">
                      ({400 - (field.value?.length || 0)} {t('charactersLeft')})
                    </span>
                  </FieldLabel>
                  <FieldContent>
                    <Textarea
                      id={field.name}
                      placeholder={t('bioPlaceholder')}
                      className="min-h-[150px]"
                      maxLength={400}
                      {...field}
                    />
                  </FieldContent>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            {/* Theme Selector */}
            <ThemeSelector className="border-t pt-6" />

            <div className="space-y-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Label>{t('additionalDetails')}</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-red-500 hover:bg-red-50 hover:text-red-700"
                      onClick={() => {
                        form.setValue('details', {});
                      }}
                    >
                      {t('clearAll')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newDetails = { ...details };
                        const id = `detail-${Date.now()}`;
                        newDetails[id] = {
                          id,
                          label: t('newDetail'),
                          icon: '',
                          text: '',
                        };
                        form.setValue('details', newDetails);
                      }}
                    >
                      {t('addDetail')}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {Object.entries(DETAIL_TEMPLATES).map(([key, template]) => (
                    <Button
                      key={key}
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="flex items-center gap-2"
                      onClick={() => {
                        const currentIds = new Set(Object.keys(details || {}));
                        const newDetails = { ...details };

                        for (const item of template) {
                          if (!currentIds.has(item.id)) {
                            newDetails[item.id] = { ...item };
                          }
                        }

                        form.setValue('details', newDetails);
                      }}
                    >
                      {key === 'general' && <Briefcase className="h-4 w-4" />}
                      {key === 'academic' && <GraduationCap className="h-4 w-4" />}
                      {key === 'professional' && <Building2 className="h-4 w-4" />}
                      {t(`add${key.charAt(0).toUpperCase() + key.slice(1)}Info`)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {Object.entries(details || {}).map(([id, detail]) => (
                  <DetailCard
                    key={id}
                    id={id}
                    detail={detail}
                    onUpdate={(id, field, value) => {
                      const newDetails = { ...details };
                      const existingDetail = newDetails[id];
                      newDetails[id] = {
                        id: existingDetail?.id || id,
                        label: existingDetail?.label || '',
                        icon: existingDetail?.icon || '',
                        text: existingDetail?.text || '',
                        ...existingDetail,
                        [field]: value,
                      };
                      form.setValue('details', newDetails);
                    }}
                    onRemove={(id) => {
                      const newDetails = { ...details };
                      const { [id]: removed, ...nextDetails } = newDetails;
                      form.setValue('details', nextDetails);
                    }}
                    onLabelChange={(id, newLabel) => {
                      const newDetails = { ...details };
                      const existingDetail = newDetails[id];
                      newDetails[id] = {
                        id: existingDetail?.id || id,
                        label: newLabel,
                        icon: existingDetail?.icon || '',
                        text: existingDetail?.text || '',
                        ...existingDetail,
                      };
                      form.setValue('details', newDetails);
                    }}
                    availableIcons={AVAILABLE_ICONS}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Profile Picture Section */}
          <div className="w-full lg:w-80">
            <div className="soft-shadow h-full rounded-lg bg-gray-50/50 p-6">
              <div className="flex flex-col items-center space-y-6">
                <Label className="font-bold">{t('profilePicture')}</Label>
                {profilePicture.error ? (
                  <div className="flex items-center rounded-md bg-red-200 px-4 py-2 text-sm text-red-950">
                    <FileWarning
                      size={16}
                      className="mr-2"
                    />
                    <span className="font-semibold first-letter:uppercase">
                      {t('avatarError', { error: profilePicture.error })}
                    </span>
                  </div>
                ) : null}
                {profilePicture.success ? (
                  <div className="flex items-center rounded-md bg-green-200 px-4 py-2 text-sm text-green-950">
                    <Check
                      size={16}
                      className="mr-2"
                    />
                    <span className="font-semibold first-letter:uppercase">{t('avatarSuccess')}</span>
                  </div>
                ) : null}
                {profilePicture.localAvatar ? (
                  <UserAvatar
                    size="3xl"
                    variant="outline"
                    avatar_url={URL.createObjectURL(profilePicture.localAvatar)}
                  />
                ) : (
                  <UserAvatar
                    size="3xl"
                    variant="outline"
                  />
                )}
                {profilePicture.isLoading ? (
                  <div className="text-gray flex animate-pulse items-center rounded-md bg-green-200 px-4 py-2 text-sm font-bold antialiased">
                    <ArrowBigUpDash
                      size={16}
                      className="mr-2"
                    />
                    <span>{t('uploadingAvatar')}</span>
                  </div>
                ) : (
                  <>
                    <input
                      type="file"
                      id="fileInput"
                      accept={SUPPORTED_FILES}
                      className="hidden"
                      onChange={profilePicture.handleFileChange}
                      aria-label={t('ariaLabel')}
                      title={t('selectFile')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('fileInput')?.click()}
                      className="w-full"
                    >
                      <UploadCloud
                        size={16}
                        className="mr-2"
                      />
                      {t('changeAvatar')}
                    </Button>
                  </>
                )}
                <div className="flex items-center text-xs text-gray-500">
                  <Info
                    size={13}
                    className="mr-2"
                  />
                  <p>{t('recommendedSize')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="mx-5 mt-0 mb-5 flex flex-row-reverse">
          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? t('saving') : t('saveChanges')}
          </Button>
        </div>
      </div>
    </div>
  );
};

const UserEditGeneral = () => {
  const router = useRouter();
  const { user: me } = useSession();
  const [localAvatar, setLocalAvatar] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState('');
  const [userData, setUserData] = useState<any>(null);
  const [currentLocale, setCurrentLocale] = useState<Locale | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const t = useTranslations('DashPage.Notifications');
  const validationSchema = createValidationSchema(t);

  type UserEditFormInput = v.InferInput<ReturnType<typeof createValidationSchema>>;

  const form = useForm<UserEditFormInput, any, FormValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      username: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      email: '',
      bio: '',
      details: {},
    },
    mode: 'onChange',
  });

  useEffect(() => {
    const fetchData = async () => {
      if (me?.id) {
        try {
          const [userDataResponse, localeResponse] = await Promise.all([Promise.resolve(me), getUserLocale()]);
          const details = (userDataResponse.details as FormValues['details'] | undefined) ?? {};
          setUserData(userDataResponse);
          setCurrentLocale(localeResponse);

          // Reset form with fetched data
          form.reset({
            username: userDataResponse.username || '',
            first_name: userDataResponse.first_name || '',
            middle_name: userDataResponse.middle_name || '',
            last_name: userDataResponse.last_name || '',
            email: userDataResponse.email || '',
            bio: userDataResponse.bio || '',
            details,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('Error fetching initial data:', errorMessage, error);
          setError('Failed to load user data.');
        } finally {
          setInitialLoading(false);
        }
      } else {
        setInitialLoading(false);
      }
    };

    fetchData();
  }, [form, me]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLocalAvatar(file);
    setIsLoading(true);
    setError(undefined);
    setSuccess('');

    if (!me?.id) {
      setError(t('avatarError'));
      setIsLoading(false);
      return;
    }

    try {
      const res = await updateUserAvatar(me.id, file);
      if (!res.success) {
        setError(res.HTTPmessage || t('avatarError'));
      } else {
        setSuccess(t('avatarSuccess'));
        router.refresh();
      }
    } catch (error) {
      console.error('Avatar upload error:', error);
      setError(t('avatarError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailChange = async (newEmail: string) => {
    toast.success(t('profileUpdateSuccess'), {
      duration: 4000,
    });

    toast(t('promptLogoutOnEmailChange', { newEmail }), {
      duration: 4000,
      icon: '📧',
    });

    // Wait for 4 seconds before signing out
    await new Promise((resolve) => setTimeout(resolve, 4000));
    await logout({ redirectTo: getAbsoluteUrl('/') });
  };

  const onSubmit = async (values: FormValues) => {
    if (!userData?.id) {
      toast.error(t('profileUpdateError'));
      return;
    }

    const isEmailChanged = values.email !== userData.email;
    const loadingToast = toast.loading(t('updating'));

    try {
      await updateProfile(values, userData.id);
      setUserData((current: any) => ({ ...current, ...values }));

      toast.dismiss(loadingToast);
      if (isEmailChanged) {
        await handleEmailChange(values.email);
      } else {
        router.refresh();
        toast.success(t('profileUpdateSuccess'));
      }
    } catch (error) {
      console.error('Profile update error:', error);
      toast.error(t('profileUpdateError'), {
        id: loadingToast,
      });
    }
  };

  if (initialLoading || !userData || !currentLocale) {
    return (
      <div className="soft-shadow mx-0 rounded-xl bg-white p-8 sm:mx-10">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="soft-shadow mx-0 rounded-xl bg-white sm:mx-10">
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <UserEditForm
          form={form}
          profilePicture={{
            error,
            success,
            isLoading,
            localAvatar,
            handleFileChange,
          }}
        />
      </form>
    </div>
  );
};

export default UserEditGeneral;
