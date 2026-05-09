import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AdminHeaderClient from '@/app/_shared/dash/admin/AdminHeaderClient';
import { getTranslations } from 'next-intl/server';
import { Shield, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('DashPage.Admin.Index');
  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function PlatformAdminPage() {
  const t = await getTranslations('DashPage.Admin.Index');

  const adminSections = [
    {
      title: t('rolesTitle'),
      description: t('rolesDescription'),
      href: 'admin/roles',
      icon: Shield,
    },
    {
      title: t('userRolesTitle'),
      description: t('userRolesDescription'),
      href: 'admin/users',
      icon: Users,
    },
  ];

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div>
        <AdminHeaderClient />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {adminSections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
          >
            <Card className="hover:border-primary h-full cursor-pointer transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 rounded-lg p-2">
                    <section.icon className="text-primary h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">{section.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{section.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
