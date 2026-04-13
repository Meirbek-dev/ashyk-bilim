'use client';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Backpack, Book, School, User, Users } from 'lucide-react';
import AppLink from '@/components/ui/AppLink';
import { useTranslations } from 'next-intl';

interface BreadCrumbsProps {
  type: 'courses' | 'user' | 'users' | 'platform' | 'platformusers' | 'assignments';
  last_breadcrumb?: string;
}

const BreadCrumbs = (props: BreadCrumbsProps) => {
  const t = useTranslations('DashPage');

  const getBreadcrumbIcon = (type: string) => {
    switch (type) {
      case 'courses': {
        return (
          <Book
            className="text-muted-foreground"
            size={14}
          />
        );
      }
      case 'assignments': {
        return (
          <Backpack
            className="text-muted-foreground"
            size={14}
          />
        );
      }
      case 'user': {
        return (
          <User
            className="text-muted-foreground"
            size={14}
          />
        );
      }
      case 'platformusers': {
        return (
          <Users
            className="text-muted-foreground"
            size={14}
          />
        );
      }
      case 'platform': {
        return (
          <School
            className="text-muted-foreground"
            size={14}
          />
        );
      }
      default: {
        return null;
      }
    }
  };

  const getBreadcrumbLink = (type: string) => {
    switch (type) {
      case 'courses': {
        return '/dash/courses';
      }
      case 'assignments': {
        return '/dash/assignments';
      }
      case 'user': {
        return '/dash/user-account/settings/general';
      }
      case 'platformusers': {
        return '/dash/users/settings/users';
      }
      case 'platform': {
        return '/dash/platform/settings/landing';
      }
      default: {
        return '#';
      }
    }
  };

  const getBreadcrumbTitle = (type: string) => {
    switch (type) {
      case 'courses': {
        return t('Courses.title');
      }
      case 'assignments': {
        return t('Assignments.title');
      }
      case 'user': {
        return t('UserAccountSettings.title');
      }
      case 'platformusers': {
        return t('Card.Users.title');
      }
      case 'platform': {
        return t('Card.Platform.title');
      }
      default: {
        return '';
      }
    }
  };

  return (
    <div>
      <div className="h-7" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<AppLink href={getBreadcrumbLink(props.type)} />}
              className="flex items-center space-x-2"
            >
              {getBreadcrumbIcon(props.type)}
              <span>{getBreadcrumbTitle(props.type)}</span>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {props.last_breadcrumb ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="first-letter:uppercase">{props.last_breadcrumb}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : null}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
};

export default BreadCrumbs;
