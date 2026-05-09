'use client';
import { useQueryClient } from '@tanstack/react-query';
import { NativeSelect, NativeSelectOption } from '@components/ui/native-select';
import { assignRoleToUser, removeRoleFromUser } from '@/services/rbac';
import { Field, FieldError, FieldLabel } from '@components/ui/field';
import { BarLoader } from '@components/Objects/Loaders/BarLoader';
import { Alert, AlertDescription } from '@components/ui/alert';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useRoles } from '@/features/users/hooks/useUsers';
import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';
import { Button } from '@components/ui/button';
import { useTranslations } from 'next-intl';
import type { FC } from 'react';
import { toast } from 'sonner';
import * as v from 'valibot';

interface Props {
  user: any;
  setRolesModal: any;
  alreadyAssignedRole: string;
}
const createValidationSchema = (t: (key: string) => string) =>
  v.object({
    role: v.pipe(v.string(), v.minLength(1, t('roleRequired'))),
  });

interface FormData {
  role: string;
}

type RoleFormValues = v.InferOutput<ReturnType<typeof createValidationSchema>>;

const RolesUpdate: FC<Props> = (props) => {
  const queryClient = useQueryClient();
  const validationT = useTranslations('Validation');
  const t = useTranslations('Components.RolesUpdate');
  const validationSchema = createValidationSchema(validationT);
  const [error, setError] = useState<any>(null);

  const form = useForm<FormData, any, RoleFormValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      role: props.alreadyAssignedRole,
    },
  });

  // Fetch available platform roles and sort them by system flag + priority
  const { data: roles, error: rolesError } = useRoles();

  const sortedRoles = (roles ?? []).toSorted((a: any, b: any) => {
    // System roles first, then by descending priority, then by name
    const aSystem = a.is_system ? 0 : 1;
    const bSystem = b.is_system ? 0 : 1;
    if (aSystem !== bSystem) return aSystem - bSystem;
    const aPriority = (a.priority ?? 0) * -1;
    const bPriority = (b.priority ?? 0) * -1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return (a.name || '').localeCompare(b.name || '');
  });
  const handleSubmit = async (values: FormData) => {
    setError(null);

    const toastId = toast.loading(t('toastLoading'));
    try {
      const newRoleId = Number.parseInt(values.role, 10);
      const oldRoleId = Number.parseInt(props.alreadyAssignedRole, 10);
      const userId = props.user.user.id;

      if (!Number.isNaN(oldRoleId)) {
        await removeRoleFromUser(userId, oldRoleId);
      }
      await assignRoleToUser(userId, newRoleId);

      await queryClient.invalidateQueries({ queryKey: queryKeys.users.allMembers() });
      props.setRolesModal(false);
      toast.success(t('toastSuccess'), { id: toastId });
    } catch (error: any) {
      const detail = error?.message ?? 'Unknown error';
      setError(detail);
      toast.error(t('toastError'), { id: toastId });
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            <strong>
              {t('errorPrefix')} {error.split(':')[0]}:{' '}
            </strong>
            {error.split(':').slice(1).join(':')}
          </AlertDescription>
        </Alert>
      )}

      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-4"
      >
        <Controller
          control={form.control}
          name="role"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel>{t('rolesLabel')}</FieldLabel>
              <NativeSelect
                onChange={(event) => field.onChange(event.target.value)}
                value={field.value}
                disabled={!roles || Boolean(rolesError)}
                className="w-full"
                aria-label={t('selectRolePlaceholder')}
              >
                {!roles || rolesError ? (
                  <NativeSelectOption
                    value=""
                    disabled
                  >
                    {t('loadingRoles')}
                  </NativeSelectOption>
                ) : (
                  sortedRoles.map((role: any) => (
                    <NativeSelectOption
                      key={role.id}
                      value={role.id.toString()}
                    >
                      {role.name}
                    </NativeSelectOption>
                  ))
                )}
              </NativeSelect>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <div className="flex justify-end pt-4">
          <Button
            type="submit"
            disabled={form.formState.isSubmitting || !roles || Boolean(rolesError)}
            className="min-w-[100px]"
          >
            {form.formState.isSubmitting ? (
              <BarLoader
                cssOverride={{ borderRadius: 60 }}
                width={60}
                color="#ffffff"
              />
            ) : (
              t('updateButton')
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default RolesUpdate;
