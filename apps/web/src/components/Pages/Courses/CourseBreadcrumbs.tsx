'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { getAbsoluteUrl } from '@services/config/config';
import Link from '@components/ui/ServerLink';
import { useTranslations } from 'next-intl';
import { Book } from 'lucide-react';

interface CourseBreadcrumbsProps {
  course: any;
}

export default function CourseBreadcrumbs({ course }: CourseBreadcrumbsProps) {
  const t = useTranslations('CourseBreadcrumbs');
  return (
    <div className="pt-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<Link href={`${getAbsoluteUrl('')}/courses`} />}
              className="flex items-center space-x-2"
            >
              <Book
                className="text-gray"
                size={14}
              />
              <span>{t('courses')}</span>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="first-letter:uppercase">{course.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
