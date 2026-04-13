'use client';

import { Controller, useForm } from 'react-hook-form';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { Code2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as v from 'valibot';

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const createValidationSchema = (t: (key: string) => string) =>
  v.object({
    name: v.pipe(v.string(), v.minLength(1, t('challengeNameRequired'))),
    description: v.pipe(v.string(), v.minLength(1, t('challengeDescriptionRequired'))),
    difficulty: v.picklist(['easy', 'medium', 'hard']),
    subtype: v.picklist(['general', 'competitive']),
  });

interface FormValues {
  name: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  subtype: 'general' | 'competitive';
}

interface CodeChallengeActivityModalProps {
  submitActivity: (data: any) => Promise<void>;
  chapterId: number;
  course: any;
  closeModal?: () => void;
}

export default function CodeChallengeActivityModal({
  submitActivity,
  chapterId,
  course,
  closeModal,
}: CodeChallengeActivityModalProps) {
  const t = useTranslations('Components.NewActivity.CodeChallenge');

  const validationSchema = createValidationSchema(t);
  type ValidationInput = v.InferInput<typeof validationSchema>;
  type ValidationOutput = v.InferOutput<typeof validationSchema>;

  const form = useForm<ValidationInput, any, ValidationOutput>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      name: '',
      description: '',
      difficulty: 'medium',
      subtype: 'general',
    },
  });

  const handleSubmit = async (values: ValidationOutput) => {
    const activityData = {
      name: values.name,
      activity_type: 'TYPE_CODE_CHALLENGE',
      activity_sub_type: values.subtype === 'competitive' ? 'SUBTYPE_CODE_COMPETITIVE' : 'SUBTYPE_CODE_GENERAL',
      chapter_id: chapterId,
      published: false,
      content: {
        description: values.description,
        difficulty: values.difficulty,
      },
    };

    await submitActivity(activityData);
    closeModal?.();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
          <Code2 className="text-primary h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">{t('title')}</h3>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
      </div>

      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-4"
      >
        <Controller
          control={form.control}
          name="name"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>{t('name')}</FieldLabel>
              <FieldContent>
                <Input
                  id={field.name}
                  placeholder={t('namePlaceholder')}
                  {...field}
                />
              </FieldContent>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="description"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>{t('description')}</FieldLabel>
              <FieldContent>
                <Textarea
                  id={field.name}
                  placeholder={t('descriptionPlaceholder')}
                  className="min-h-24"
                  {...field}
                />
              </FieldContent>
              <FieldDescription>{t('descriptionHint')}</FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Controller
            control={form.control}
            name="difficulty"
            render={({ field, fieldState }) => {
              const difficultyItems = [
                { value: 'easy', label: t('difficultyEasy') },
                { value: 'medium', label: t('difficultyMedium') },
                { value: 'hard', label: t('difficultyHard') },
              ];

              return (
                <Field>
                  <FieldLabel>{t('difficulty')}</FieldLabel>
                  <Select
                    items={difficultyItems}
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectDifficulty')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {difficultyItems.map((item) => (
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
                  <FieldError errors={[fieldState.error]} />
                </Field>
              );
            }}
          />

          <Controller
            control={form.control}
            name="subtype"
            render={({ field, fieldState }) => {
              const subtypeItems = [
                { value: 'general', label: t('typeGeneral') },
                { value: 'competitive', label: t('typeCompetitive') },
              ];

              return (
                <Field>
                  <FieldLabel>{t('type')}</FieldLabel>
                  <Select
                    items={subtypeItems}
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectType')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {subtypeItems.map((item) => (
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
                  <FieldDescription>
                    {field.value === 'competitive' ? t('typeCompetitiveHint') : t('typeGeneralHint')}
                  </FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              );
            }}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          {closeModal && (
            <Button
              type="button"
              variant="outline"
              onClick={closeModal}
            >
              {t('cancel')}
            </Button>
          )}
          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('create')}
          </Button>
        </div>
      </form>
    </div>
  );
}
