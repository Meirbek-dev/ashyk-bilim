'use client';
import type { Action, Resource, Scope } from '@/types/permissions';
import { useSession } from '@/hooks/useSession';
import { useTranslations } from 'next-intl';

interface ProtectedTextProps {
  text: string;
  action: Action;
  resource: Resource;
  scope: Scope;
  fallback?: string;
}

const ProtectedText = ({ text, action, resource, scope, fallback }: ProtectedTextProps) => {
  const t = useTranslations('General');
  const { can } = useSession();
  return <span>{can(resource, action, scope) ? text : (fallback ?? t('noContentYet'))}</span>;
};

export default ProtectedText;
