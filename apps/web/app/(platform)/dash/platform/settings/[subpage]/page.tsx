'use client';

import EditSocials from '@/components/Dashboard/Pages/Platform/EditSocials/EditSocials';
import EditLanding from '@/components/Dashboard/Pages/Platform/EditLanding/EditLanding';
import EditImages from '@/components/Dashboard/Pages/Platform/EditImages/EditImages';
import { ImageIcon, LayoutDashboardIcon, Share2Icon } from 'lucide-react';
import SettingsHeader from '@components/Dashboard/Misc/SettingsHeader';
import SettingsTabs from '@components/Dashboard/Misc/SettingsTabs';
import { getAbsoluteUrl } from '@services/config/config';
import { AnimatePresence, motion } from 'motion/react';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { use, useMemo } from 'react';

export interface Params {
  subpage: string;
}

interface TabItem {
  id: string;
  label: string;
  icon: LucideIcon;
  titleKey: string;
  descriptionKey: string;
}

const SETTING_TABS: TabItem[] = [
  {
    id: 'landing',
    label: 'landing',
    icon: LayoutDashboardIcon,
    titleKey: 'landingTitle',
    descriptionKey: 'landingDescription',
  },
  {
    id: 'previews',
    label: 'previews',
    icon: ImageIcon,
    titleKey: 'previewsTitle',
    descriptionKey: 'previewsDescription',
  },
  {
    id: 'socials',
    label: 'socials',
    icon: Share2Icon,
    titleKey: 'socialsTitle',
    descriptionKey: 'socialsDescription',
  },
];

export default function PlatformSettingsPage(props: { params: Promise<{ subpage: string }> }) {
  const t = useTranslations('DashPage.PlatformSettings');
  const params = use(props.params);

  const currentTab = useMemo<TabItem>(() => {
    const tab = SETTING_TABS.find((tabItem) => tabItem.id === params.subpage);
    return tab ?? SETTING_TABS[0]!;
  }, [params.subpage]);
  const pageTitle = useMemo(() => t(currentTab.titleKey), [currentTab, t]);
  const pageDescription = useMemo(() => t(currentTab.descriptionKey), [currentTab, t]);

  return (
    <div className="bg-background flex h-full w-full flex-col">
      <SettingsHeader
        breadcrumbType="platform"
        title={pageTitle}
        description={pageDescription}
      >
        <SettingsTabs
          value={params.subpage}
          tabs={SETTING_TABS.map((tab) => ({ id: tab.id, labelKey: tab.label, icon: tab.icon }))}
          getHref={(tab) => `${getAbsoluteUrl('')}/dash/platform/settings/${tab.id}`}
          translationNamespace="DashPage.PlatformSettings"
        />
      </SettingsHeader>

      <Separator />

      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 lg:py-8">
          <Card className="shadow-sm ring-1 ring-foreground/10">
            <CardContent className="p-0">
              <ContentRenderer subpage={params.subpage} />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

const ContentRenderer = ({ subpage }: { subpage: string }) => {
  const content = useMemo(() => {
    switch (subpage) {
      case 'previews': {
        return <EditImages />;
      }
      case 'socials': {
        return <EditSocials />;
      }
      case 'landing': {
        return <EditLanding />;
      }
      default: {
        return null;
      }
    }
  }, [subpage]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={subpage}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="flex-1 overflow-y-auto p-1"
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
};
