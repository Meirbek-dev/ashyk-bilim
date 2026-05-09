'use client';

import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { generateUUID } from '@/lib/utils';
import type { CodeChallengeSettingsForm } from './CodeChallengeStudio';

interface TestCaseListEditorProps {
  name: 'visible_tests' | 'hidden_tests';
  title: string;
  visible?: boolean;
}

export default function TestCaseListEditor({ name, title, visible = false }: TestCaseListEditorProps) {
  const t = useTranslations('Activities.CodeChallenges');
  const form = useFormContext<CodeChallengeSettingsForm>();
  const tests = useWatch({ control: form.control, name }) ?? [];
  const { fields, append, remove } = useFieldArray({ control: form.control, name });
  const Icon = visible ? Eye : EyeOff;

  const addTest = () =>
    append({
      id: `test_${generateUUID()}`,
      input: '',
      expected_output: '',
      is_visible: visible,
      description: '',
      weight: 1,
    });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Icon className="size-5" />
              {title}
            </CardTitle>
            <CardDescription>
              {visible ? t('visibleTestCasesDescription') : t('hiddenTestCasesDescription')}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addTest}
          >
            <Plus className="size-4" />
            {t('addTestCase')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!fields.length ? (
          <div className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
            {t('noHiddenTestCases')}
          </div>
        ) : (
          <Accordion defaultValue={fields.map((_, index) => `${name}-${index}`)}>
            {fields.map((field, index) => (
              <AccordionItem
                key={field.id}
                value={`${name}-${index}`}
              >
                <AccordionTrigger className="hover:no-underline">
                  <span className="truncate text-sm">
                    {visible ? t('testCase') : t('hiddenTest')} #{index + 1}
                    {tests[index]?.description ? ` - ${tests[index]?.description}` : ''}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 px-1 pt-4">
                  <Controller
                    control={form.control}
                    name={`${name}.${index}.description`}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel htmlFor={field.name}>{t('testDescription')}</FieldLabel>
                        <Input
                          id={field.name}
                          placeholder={t('testDescriptionPlaceholder')}
                          {...field}
                        />
                      </Field>
                    )}
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Controller
                      control={form.control}
                      name={`${name}.${index}.input`}
                      render={({ field }) => (
                        <Field>
                          <FieldLabel htmlFor={field.name}>{t('input')}</FieldLabel>
                          <Textarea
                            id={field.name}
                            rows={4}
                            className="font-mono"
                            placeholder={t('inputPlaceholder')}
                            {...field}
                          />
                        </Field>
                      )}
                    />
                    <Controller
                      control={form.control}
                      name={`${name}.${index}.expected_output`}
                      render={({ field }) => (
                        <Field>
                          <FieldLabel htmlFor={field.name}>{t('expectedOutput')}</FieldLabel>
                          <Textarea
                            id={field.name}
                            rows={4}
                            className="font-mono"
                            placeholder={t('expectedOutputPlaceholder')}
                            {...field}
                          />
                        </Field>
                      )}
                    />
                  </div>
                  <Controller
                    control={form.control}
                    name={`${name}.${index}.weight`}
                    render={({ field }) => (
                      <Field className="max-w-36">
                        <FieldLabel htmlFor={field.name}>{t('testWeight')}</FieldLabel>
                        <Input
                          id={field.name}
                          type="number"
                          min={1}
                          max={100}
                          value={field.value ?? 1}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                        <FieldDescription>{t('testWeightDescription')}</FieldDescription>
                      </Field>
                    )}
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={visible && fields.length === 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4" />
                      {t('removeTestCase')}
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
