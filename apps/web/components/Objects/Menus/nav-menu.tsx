'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { BookCopy, Menu, Signpost, SquareLibrary } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';

// Components & UI
import Link from '@components/ui/AppLink';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NavigationMenu, NavigationMenuItem, NavigationMenuList } from '@/components/ui/navigation-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ThemeModeToggle } from '@/components/theme-mode-toggle';
import { SearchBar } from '@/components/Objects/Search/SearchBar';
import { LocaleSwitcher } from '@/components/Utils/LocaleSwitcher';
import { HeaderProfileBox } from '@/components/Security/HeaderProfileBox';

// Hooks & Config
import { useSession } from '@/hooks/useSession';
import { getAbsoluteUrl } from '@/services/config/config';
import { NAVBAR_HEIGHT } from '@/lib/constants';
import { cn } from '@/lib/utils';

// Assets
import platformLogoFull from '@public/platform_logo_full.svg';
import platformLogoLightFull from '@public/platform_logo_light_full.svg';

// ----------------------------------------------------------------------
// Types & Config
// ----------------------------------------------------------------------
type NavLinkType = 'courses' | 'collections' | 'trail';

interface NavLinkDef {
  type: NavLinkType;
  href: string;
  icon: LucideIcon;
  authRequired?: boolean;
}

const NAV_LINKS: NavLinkDef[] = [
  { type: 'courses', href: '/courses', icon: BookCopy },
  { type: 'collections', href: '/collections', icon: SquareLibrary },
  { type: 'trail', href: '/trail', icon: Signpost, authRequired: true },
];

const SCROLL_THRESHOLD = 8;

// ----------------------------------------------------------------------
// Active path matcher — handles root + nested routes correctly
// ----------------------------------------------------------------------
function useIsActive(href: string): boolean {
  const pathname = usePathname();
  return useMemo(() => {
    if (!pathname) return false;
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  }, [pathname, href]);
}

// ----------------------------------------------------------------------
// Focus mode — SSR-safe, reads localStorage only after mount
// ----------------------------------------------------------------------
function useFocusMode(enabled: boolean): boolean {
  const [isFocusMode, setIsFocusMode] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsFocusMode(false);
      return;
    }

    const read = (): boolean => {
      try {
        return localStorage.getItem('globalFocusMode') === 'true';
      } catch {
        return false;
      }
    };

    setIsFocusMode(read());

    const sync = () => setIsFocusMode(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'globalFocusMode') sync();
    };

    globalThis.addEventListener('storage', onStorage);
    globalThis.addEventListener('focusModeChange', sync);

    return () => {
      globalThis.removeEventListener('storage', onStorage);
      globalThis.removeEventListener('focusModeChange', sync);
    };
  }, [enabled]);

  return isFocusMode;
}

// ----------------------------------------------------------------------
// Scroll elevation — RAF-throttled, threshold-based
// ----------------------------------------------------------------------
function useScrollElevation(threshold = SCROLL_THRESHOLD): boolean {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    let rafId = 0;

    const update = () => {
      rafId = 0;
      const next = window.scrollY > threshold;
      setIsScrolled((prev) => (prev === next ? prev : next));
    };

    const onScroll = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId !== 0) cancelAnimationFrame(rafId);
    };
  }, [threshold]);

  return isScrolled;
}

// ----------------------------------------------------------------------
// Desktop link — pill with primary-tinted active state
// ----------------------------------------------------------------------
interface NavLinkProps {
  def: NavLinkDef;
  label: string;
  onNavigate?: () => void;
}

const DesktopNavLink = ({ def, label }: NavLinkProps) => {
  const { icon: Icon, href } = def;
  const isActive = useIsActive(href);

  return (
    <NavigationMenuItem className="list-none">
      <Link
        prefetch={false}
        href={getAbsoluteUrl(href)}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'group/navlink relative flex h-10 items-center gap-2 rounded-md px-3.5 text-base font-medium outline-none transition-colors duration-200',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isActive ? 'bg-accent text-primary' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        )}
      >
        <Icon
          size={16}
          strokeWidth={2.25}
          aria-hidden="true"
          className={cn(
            'shrink-0 transition-colors',
            isActive ? 'text-primary' : 'text-muted-foreground/70 group-hover/navlink:text-foreground',
          )}
        />
        <span className="tracking-tight">{label}</span>
      </Link>
    </NavigationMenuItem>
  );
};

// ----------------------------------------------------------------------
// Mobile link — roomier tap target, primary accent dot on active
// ----------------------------------------------------------------------
const MobileNavLink = ({ def, label, onNavigate }: NavLinkProps) => {
  const { icon: Icon, href } = def;
  const isActive = useIsActive(href);

  return (
    <Link
      prefetch={false}
      href={getAbsoluteUrl(href)}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group/navlink flex w-full items-center gap-3 rounded-lg px-3 py-3 text-base font-medium outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring',
        isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      )}
    >
      <Icon
        size={18}
        strokeWidth={2.25}
        aria-hidden="true"
        className={cn(
          'shrink-0',
          isActive ? 'text-primary' : 'text-muted-foreground/70 group-hover/navlink:text-foreground',
        )}
      />
      <span className="flex-1">{label}</span>
      {isActive && (
        <span
          className="bg-primary h-1.5 w-1.5 rounded-full"
          aria-hidden="true"
        />
      )}
    </Link>
  );
};

// ----------------------------------------------------------------------
// NavBar
// ----------------------------------------------------------------------
export default function NavBar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations('Components.NavMenu');
  const tLinks = useTranslations('Components.NavMenuLinks');
  const { isAuthenticated } = useSession();
  const { resolvedTheme } = useTheme();
  const logoSrc = resolvedTheme === 'dark' ? platformLogoLightFull : platformLogoFull;

  const isOnActivityPage = pathname?.includes('/activity/') ?? false;
  const isFocusMode = useFocusMode(isOnActivityPage);
  const isScrolled = useScrollElevation();

  const visibleLinks = useMemo(() => NAV_LINKS.filter((l) => !l.authRequired || isAuthenticated), [isAuthenticated]);

  // Auto-close the mobile sheet on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  if (isOnActivityPage && isFocusMode) return null;

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 w-full border-b border-border/60',
        'transition-[background-color,box-shadow,backdrop-filter] duration-200',
        isScrolled
          ? 'bg-background/85 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/75'
          : 'bg-background',
      )}
      style={{ height: NAVBAR_HEIGHT }}
    >
      <div className="mx-auto flex h-full w-full items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
        {/* ── Left: logo + desktop nav ─────────────────────────────── */}
        <div className="flex min-w-0 items-center gap-6 lg:gap-8">
          <Link
            href={getAbsoluteUrl('/')}
            aria-label={t('logoAlt')}
            className="focus-visible:ring-ring focus-visible:ring-offset-background flex shrink-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <Image
              src={logoSrc}
              alt={t('logoAlt')}
              width={120}
              height={36}
              className="h-9 w-auto object-contain"
              priority
            />
          </Link>

          <nav
            aria-label={t('navigation')}
            className="hidden md:flex"
          >
            <NavigationMenu>
              <NavigationMenuList className="gap-0.5">
                {visibleLinks.map((def) => (
                  <DesktopNavLink
                    key={def.type}
                    def={def}
                    label={tLinks(def.type)}
                  />
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </nav>
        </div>

        {/* ── Center: desktop search ───────────────────────────────── */}
        <div className="hidden flex-1 justify-center lg:flex">
          <SearchBar className="w-full max-w-md" />
        </div>

        {/* Spacer for md-only viewports where search is hidden */}
        <div className="flex-1 lg:hidden" />

        {/* ── Right: controls + mobile trigger ─────────────────────── */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <div className="hidden sm:flex">
            <LocaleSwitcher />
          </div>

          <ThemeModeToggle className="mx-1" />

          <div className="hidden md:flex">
            <HeaderProfileBox />
          </div>

          <Sheet
            open={isMenuOpen}
            onOpenChange={setIsMenuOpen}
          >
            <SheetTrigger
              render={(triggerProps) => (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 md:hidden"
                  aria-label={t('openMenu')}
                  {...triggerProps}
                >
                  <Menu className="h-5 w-5" />
                </Button>
              )}
            />

            <SheetContent
              side="right"
              className="flex w-full flex-col gap-0 p-0 sm:max-w-sm"
            >
              <SheetHeader className="border-border/60 border-b px-6 py-4">
                <SheetTitle className="sr-only">{t('navigation')}</SheetTitle>
                <Image
                  src={logoSrc}
                  alt={t('logoAlt')}
                  width={163}
                  height={60}
                  className="h-8 w-auto object-contain"
                />
              </SheetHeader>

              <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
                <section className="space-y-2">
                  <Label className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                    {t('search')}
                  </Label>
                  <SearchBar
                    isMobile
                    className="w-full"
                  />
                </section>

                <Separator />

                <section className="space-y-2">
                  <Label className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                    {t('navigation')}
                  </Label>
                  <nav
                    aria-label={t('navigation')}
                    className="flex flex-col gap-1"
                  >
                    {visibleLinks.map((def) => (
                      <MobileNavLink
                        key={def.type}
                        def={def}
                        label={tLinks(def.type)}
                        onNavigate={closeMenu}
                      />
                    ))}
                  </nav>
                </section>

                <section className="space-y-2 sm:hidden">
                  <Separator />
                  <Label className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                    {t('language')}
                  </Label>
                  <div className="flex items-center gap-2">
                    <LocaleSwitcher
                      className="flex-1"
                      isMobile
                    />
                    <ThemeModeToggle className="shrink-0" />
                  </div>
                </section>
              </div>

              <div className="border-border/60 bg-muted/30 mt-auto border-t px-6 py-4">
                <Label className="text-muted-foreground mb-2 block text-[11px] font-semibold tracking-wider uppercase">
                  {t('account')}
                </Label>
                <div className="border-border/60 bg-background flex items-center justify-center rounded-lg border p-3">
                  <HeaderProfileBox />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
