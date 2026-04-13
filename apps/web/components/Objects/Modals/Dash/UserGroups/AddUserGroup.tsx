'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Field, FieldContent, FieldError, FieldLabel } from '@components/ui/field';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { createUserGroup } from '@services/usergroups/usergroups';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as v from 'valibot';

interface AddUserGroupProps {
  setCreateUserGroupModal: any;
}

const createValidationSchema = (t: (key: string) => string) =>
  v.object({
    name: v.pipe(v.string(), v.minLength(1, t('nameRequiredError'))),
    description: v.optional(v.string()),
  });

type UserGroupFormValues = v.InferOutput<ReturnType<typeof createValidationSchema>>;
type UserGroupInputValues = v.InferInput<ReturnType<typeof createValidationSchema>>;

const AddUserGroup = (props: AddUserGroupProps) => {
  const queryClient = useQueryClient();
  const t = useTranslations('Components.AddUserGroup');
  const validationSchema = createValidationSchema(t);

  const form = useForm<UserGroupInputValues, any, UserGroupFormValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const handleSubmit = async (values: UserGroupFormValues) => {
    const toastID = toast.loading(t('toastLoading'));
    const res = await createUserGroup(values);
    if (res.status === 200) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.userGroups.all() });
      props.setCreateUserGroupModal(false);
      toast.success(t('toastSuccess'), { id: toastID });
      return;
    }

    toast.error(t('toastError'), { id: toastID });
  };

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      className="space-y-4"
    >
      <Field>
        <FieldLabel htmlFor="name">{t('nameLabel')}</FieldLabel>
        <FieldContent>
          <Input
            id="name"
            type="text"
            {...form.register('name')}
          />
        </FieldContent>
        <FieldError errors={[form.formState.errors.name]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="description">{t('descriptionLabel')}</FieldLabel>
        <FieldContent>
          <Input
            id="description"
            type="text"
            {...form.register('description')}
          />
        </FieldContent>
        <FieldError errors={[form.formState.errors.description]} />
      </Field>

      <div className="flex py-4">
        <Button
          type="submit"
          className="w-full rounded-md p-2 text-center font-bold shadow-md hover:cursor-pointer"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? t('loadingButton') : t('createButton')}
        </Button>
      </div>
    </form>
  );
};

export default AddUserGroup;
