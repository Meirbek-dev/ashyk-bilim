'use client';

import { LoaderCircle, Search, ShieldCheck, UserRoundCheck, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { apiFetch, apiFetcher } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type AccessMode = 'ALL_COURSE_LEARNERS' | 'RESTRICTED';

interface AccessUser {
  id: number;
  user_uuid: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
}

interface AccessUserGroup {
  id: number;
  usergroup_uuid: string;
  name: string;
  description: string;
  member_count: number;
}

interface AccessRead {
  mode: AccessMode;
  users: AccessUser[];
  usergroups: AccessUserGroup[];
  effective_user_count: number;
}

interface AccessManagementTabProps {
  assessmentUuid: string;
  disabled: boolean;
}

export default function AccessManagementTab({ assessmentUuid, disabled }: AccessManagementTabProps) {
  const t = useTranslations('Features.Assessments.Studio.AccessManagement');
  const [access, setAccess] = useState<AccessRead | null>(null);
  const [eligibleUsers, setEligibleUsers] = useState<AccessUser[]>([]);
  const [eligibleGroups, setEligibleGroups] = useState<AccessUserGroup[]>([]);
  const [mode, setMode] = useState<AccessMode>('ALL_COURSE_LEARNERS');
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [groupQuery, setGroupQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const [accessData, usersData, groupsData] = await Promise.all([
          apiFetcher<AccessRead>(`assessments/${assessmentUuid}/access`),
          apiFetcher<AccessUser[]>(`assessments/${assessmentUuid}/access/eligible-learners`),
          apiFetcher<AccessUserGroup[]>(`assessments/${assessmentUuid}/access/eligible-usergroups`),
        ]);
        if (cancelled) return;
        setAccess(accessData);
        setEligibleUsers(usersData);
        setEligibleGroups(groupsData);
        setMode(accessData.mode);
        setSelectedUsers(new Set(accessData.users.map((user) => user.id)));
        setSelectedGroups(new Set(accessData.usergroups.map((group) => group.id)));
      } catch {
        if (!cancelled) toast.error(t('loadFailed'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [assessmentUuid, t]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return eligibleUsers;
    return eligibleUsers.filter((user) =>
      [user.username, user.first_name, user.last_name, user.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [eligibleUsers, query]);

  const filteredGroups = useMemo(() => {
    const normalized = groupQuery.trim().toLowerCase();
    if (!normalized) return eligibleGroups;
    return eligibleGroups.filter((group) =>
      [group.name, group.description].filter(Boolean).some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [eligibleGroups, groupQuery]);

  const effectiveLocalCount = useMemo(() => {
    if (mode === 'ALL_COURSE_LEARNERS') return eligibleUsers.length;
    return Math.max(access?.effective_user_count ?? 0, selectedUsers.size);
  }, [access?.effective_user_count, eligibleUsers.length, mode, selectedUsers.size]);

  const save = () => {
    startTransition(async () => {
      try {
        const response = await apiFetch(`assessments/${assessmentUuid}/access`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            user_ids: mode === 'RESTRICTED' ? [...selectedUsers] : [],
            usergroup_ids: mode === 'RESTRICTED' ? [...selectedGroups] : [],
          }),
        });
        if (!response.ok) throw new Error(response.statusText);
        const next = (await response.json()) as AccessRead;
        setAccess(next);
        setMode(next.mode);
        setSelectedUsers(new Set(next.users.map((user) => user.id)));
        setSelectedGroups(new Set(next.usergroups.map((group) => group.id)));
        toast.success(t('saved'));
      } catch {
        toast.error(t('saveFailed'));
      }
    });
  };

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex min-h-[360px] items-center justify-center text-sm">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        {t('loading')}
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="bg-card rounded-lg border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{t('title')}</h2>
              <p className="text-muted-foreground mt-1 text-xs">{t('description')}</p>
            </div>
            <ShieldCheck className="text-primary size-5 shrink-0" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric
              label={t('eligible')}
              value={eligibleUsers.length}
            />
            <Metric
              label={t('effective')}
              value={effectiveLocalCount}
            />
          </div>
        </section>

        <section className="bg-card rounded-lg border p-4">
          <RadioGroup
            value={mode}
            onValueChange={(value) => setMode(value as AccessMode)}
            className="space-y-3"
            disabled={disabled}
          >
            <ModeOption
              id="access-all"
              value="ALL_COURSE_LEARNERS"
              title={t('allCourseLearners')}
              description={t('allCourseLearnersDesc')}
              active={mode === 'ALL_COURSE_LEARNERS'}
            />
            <ModeOption
              id="access-restricted"
              value="RESTRICTED"
              title={t('restricted')}
              description={t('restrictedDesc')}
              active={mode === 'RESTRICTED'}
            />
          </RadioGroup>
          <Button
            className="mt-4 w-full"
            disabled={disabled || isPending}
            onClick={save}
          >
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <UserRoundCheck className="size-4" />}
            {t('save')}
          </Button>
        </section>
      </aside>

      <main className={cn('grid gap-5 lg:grid-cols-2', mode !== 'RESTRICTED' && 'opacity-60')}>
        <AccessList
          title={t('students')}
          count={selectedUsers.size}
          search={query}
          searchPlaceholder={t('searchStudents')}
          onSearch={setQuery}
        >
          {filteredUsers.map((user) => (
            <button
              key={user.id}
              type="button"
              disabled={disabled || mode !== 'RESTRICTED'}
              onClick={() => toggleSet(setSelectedUsers, user.id)}
              className="hover:bg-muted/60 bg-background flex w-full items-center gap-3 rounded-md border p-3 text-left transition disabled:cursor-not-allowed"
            >
              <Checkbox checked={selectedUsers.has(user.id)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{displayUser(user)}</p>
                <p className="text-muted-foreground truncate text-xs">{user.email}</p>
              </div>
              <Badge variant="outline">#{user.id}</Badge>
            </button>
          ))}
        </AccessList>

        <AccessList
          title={t('usergroups')}
          count={selectedGroups.size}
          search={groupQuery}
          searchPlaceholder={t('searchGroups')}
          onSearch={setGroupQuery}
        >
          {filteredGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              disabled={disabled || mode !== 'RESTRICTED'}
              onClick={() => toggleSet(setSelectedGroups, group.id)}
              className="hover:bg-muted/60 bg-background flex w-full items-center gap-3 rounded-md border p-3 text-left transition disabled:cursor-not-allowed"
            >
              <Checkbox checked={selectedGroups.has(group.id)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{group.name}</p>
                <p className="text-muted-foreground truncate text-xs">{group.description || t('noGroupDescription')}</p>
              </div>
              <Badge variant="secondary">
                <UsersRound className="size-3" />
                {group.member_count}
              </Badge>
            </button>
          ))}
        </AccessList>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function ModeOption({
  id,
  value,
  title,
  description,
  active,
}: {
  id: string;
  value: AccessMode;
  title: string;
  description: string;
  active: boolean;
}) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition',
        active && 'border-primary bg-primary/5',
      )}
    >
      <RadioGroupItem
        id={id}
        value={value}
        className="mt-0.5"
      />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="text-muted-foreground block text-xs">{description}</span>
      </span>
    </Label>
  );
}

function AccessList({
  title,
  count,
  search,
  searchPlaceholder,
  onSearch,
  children,
}: {
  title: string;
  count: number;
  search: string;
  searchPlaceholder: string;
  onSearch: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card flex min-h-[520px] flex-col rounded-lg border">
      <div className="border-b p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <Badge variant="outline">{count}</Badge>
        </div>
        <div className="relative mt-3">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{children}</div>
    </section>
  );
}

function toggleSet(setter: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) {
  setter((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

function displayUser(user: AccessUser) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return name || user.username;
}
