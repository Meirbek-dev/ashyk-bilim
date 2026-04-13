'use client';

import { NavigationMenu, NavigationMenuList, NavigationMenuItem } from '@/components/ui/navigation-menu';
import { HeaderProfileBox } from '@/components/Security/HeaderProfileBox';
import { useSession } from '@/hooks/useSession';
import { BookCopy, Menu, Signpost, SquareLibrary, X } from 'lucide-react';
import { LocaleSwitcher } from '@/components/Utils/LocaleSwitcher';
import { SearchBar } from '@/components/Objects/Search/SearchBar';
import platformLogoFull from '@public/platform_logo_full.svg';
import platformLogoLightFull from '@public/platform_logo_light_full.svg';
import { NAVBAR_HEIGHT } from '@/lib/constants';
import { getAbsoluteUrl } from '@/services/config/config';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import Link from '@components/ui/AppLink';
import Image from 'next/image';
import { useTheme } from 'next-themes';

interface NavigationLinkProps {
  href: string;
  type: 'courses' | 'collections' | 'trail';
}

// Navigation link component with icon and label
const NavigationLinkItem = ({ href, type }: NavigationLinkProps) => {
  const t = useTranslations('Components.NavMenuLinks');
  const pathname = usePathname();

  const linkConfig = {
    courses: { icon: BookCopy, label: t('courses') },
    collections: { icon: SquareLibrary, label: t('collections') },
    trail: { icon: Signpost, label: t('trail') },
  };

  const { icon: Icon, label } = linkConfig[type];
  const isActive = pathname.includes(href);

  return (
    <NavigationMenuItem>
      <Link
        prefetch={false}
        href={getAbsoluteUrl(href)}
        className={`hover:text-primary flex max-h-[36px] items-center gap-3 rounded-md px-4 py-2 font-medium transition-colors ${
          isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
        }`}
      >
        <Icon
          size={20}
          className={`shrink-0 ${isActive ? 'text-primary' : ''}`}
        />
        <span className={`text-base font-medium whitespace-nowrap ${isActive ? 'font-semibold' : ''}`}>{label}</span>
      </Link>
    </NavigationMenuItem>
  );
};

export default function NavBar() {
  const { theme } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();
  const t = useTranslations('Components.NavMenu');
  const { isAuthenticated } = useSession();

  // Use local state for focus mode from localStorage (avoid getSnapshot sync warning)
  const isOnActivityPage = pathname?.includes('/activity/') ?? false;
  const [isFocusMode, setIsFocusMode] = useState(false);

  useEffect(() => {
    if (!isOnActivityPage) {
      setIsFocusMode(false);
      return;
    }

    const readFocusMode = () => {
      try {
        return localStorage.getItem('globalFocusMode') === 'true';
      } catch {
        return false;
      }
    };

    setIsFocusMode(readFocusMode());

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'globalFocusMode') {
        setIsFocusMode(readFocusMode());
      }
    };

    const handleFocusModeChange = () => {
      setIsFocusMode(readFocusMode());
    };

    globalThis.addEventListener('storage', handleStorageChange);
    globalThis.addEventListener('focusModeChange', handleFocusModeChange as EventListener);

    return () => {
      globalThis.removeEventListener('storage', handleStorageChange);
      globalThis.removeEventListener('focusModeChange', handleFocusModeChange as EventListener);
    };
  }, [isOnActivityPage]);

  useEffect(() => {
    // Scroll detection for header background
    const handleScroll = () => {
      const { scrollY } = globalThis;
      setIsScrolled(scrollY > 20);
    };

    const listenerOptions = { passive: true } as any;
    window.addEventListener('scroll', handleScroll, listenerOptions);

    return () => {
      window.removeEventListener('scroll', handleScroll, listenerOptions);
    };
  }, []);

  function toggleMenu() {
    setIsMenuOpen(!isMenuOpen);
  }

  // Close mobile menu when clicking outside or pressing escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      // Only close if clicking outside the mobile menu and not on menu trigger or select dropdown
      if (
        isMenuOpen &&
        !target.closest('[data-mobile-menu]') &&
        !target.closest('[data-menu-trigger]') &&
        !target.closest('[data-radix-select-content]') &&
        !target.closest('[data-slot="select-content"]')
      ) {
        setIsMenuOpen(false);
      }
    };

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let previousOverflow: string | undefined;

    if (isMenuOpen) {
      document.addEventListener('keydown', handleEscape);
      // Use a small delay to prevent immediate closing when opening
      timeoutId = globalThis.setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 100);

      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    } else {
      // Ensure we don't overwrite other components' overflow state when closed
      if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = '';
      }
    }

    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('click', handleClickOutside);
      if (previousOverflow !== undefined) {
        document.body.style.overflow = previousOverflow || '';
      }
    };
  }, [isMenuOpen]);

  // Hide menu in focus mode during activities
  if (pathname?.includes('/activity/') && isFocusMode) {
    return null;
  }

  return (
    <>
      {/* Backdrop blur */}
      <div
        className="bg-background/85 fixed top-0 right-0 left-0 -z-10 backdrop-blur-sm"
        style={{ height: NAVBAR_HEIGHT }}
      />

      {/* Main header */}
      <header
        className={`border-border/60 fixed top-0 right-0 left-0 z-50 border-b shadow-sm transition-colors ${
          isScrolled ? 'bg-background/97' : 'bg-background/92'
        } backdrop-blur-sm`}
        style={{ height: NAVBAR_HEIGHT }}
      >
        <div className="mx-auto flex h-full w-full items-center justify-between px-4 sm:px-6 lg:px-12">
          {/* Left section */}
          <div className="flex items-center gap-8 md:gap-10">
            {/* Logo */}
            <Link
              href={getAbsoluteUrl('/')}
              className="hover:bg-accent/60 flex items-center justify-center rounded-md p-2 transition-colors"
            >
              <Image
                src={platformLogoFull}
                alt={t('logoAlt')}
                width={100}
                style={{ height: 'auto' }}
                priority
                loading="eager"
              />
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex">
              <NavigationMenu>
                <NavigationMenuList className="gap-1">
                  <NavigationLinkItem
                    href="/courses"
                    type="courses"
                  />
                  <NavigationLinkItem
                    href="/collections"
                    type="collections"
                  />
                  {isAuthenticated && (
                    <NavigationLinkItem
                      href="/trail"
                      type="trail"
                    />
                  )}
                </NavigationMenuList>
              </NavigationMenu>
            </nav>
          </div>

          {/* Center - Search */}
          <div className="hidden max-w-2xl flex-1 justify-center px-8 md:flex">
            <div className="w-full max-w-lg">
              <SearchBar className="w-full" />
            </div>
          </div>

          {/* Right section */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex">
              <LocaleSwitcher />
            </div>

            {/* Desktop profile */}
            <div className="hidden md:flex">
              <HeaderProfileBox />
            </div>

            {/* Mobile menu trigger */}
            <Button
              className={`h-11 w-11 rounded-xl transition-colors md:hidden ${
                isMenuOpen ? 'bg-accent' : 'hover:bg-accent/60'
              }`}
              variant="ghost"
              size="icon"
              onClick={toggleMenu}
              aria-label={isMenuOpen ? t('closeMenu') : t('openMenu')}
              aria-expanded={isMenuOpen}
              data-menu-trigger
            >
              <div className="relative h-6 w-6">
                <Menu
                  size={22}
                  strokeWidth={2.5}
                  className={`absolute inset-0 transition-opacity ${isMenuOpen ? 'opacity-0' : 'opacity-100'}`}
                />
                <X
                  size={22}
                  strokeWidth={2.5}
                  className={`absolute inset-0 transition-opacity ${isMenuOpen ? 'opacity-100' : 'opacity-0'}`}
                />
              </div>
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {isMenuOpen ? (
        <div className="fixed inset-0 z-60 md:hidden">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => {
              setIsMenuOpen(false);
            }}
            role="button"
            tabIndex={-1}
            aria-label={t('overlayClose')}
          />

          {/* Menu panel */}
          <div
            className="border-border/60 bg-background/95 absolute right-0 left-0 border-b shadow-lg backdrop-blur-sm"
            data-mobile-menu
            onClick={(e) => {
              e.stopPropagation();
            }}
            style={{
              maxHeight: `calc(100vh - ${NAVBAR_HEIGHT}px)`,
              overflowY: 'auto',
              overflowX: 'visible',
            }}
          >
            <div className="space-y-6 px-4 py-6">
              {/* Mobile Search */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-2">
                  <div className="bg-primary h-4 w-1 rounded-full" />
                  <Label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    {t('search')}
                  </Label>
                </div>
                <div>
                  <SearchBar
                    isMobile
                    className="w-full"
                  />
                </div>
              </div>

              {/* Mobile Navigation */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-2">
                  <div className="bg-primary h-4 w-1 rounded-full" />
                  <Label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    {t('navigation')}
                  </Label>
                </div>
                <div className="border-border/30 bg-accent/20 rounded-xl border p-3">
                  <nav className="space-y-1">
                    <div className="space-y-1">
                      <div
                        onClick={() => {
                          setIsMenuOpen(false);
                        }}
                      >
                        <NavigationLinkItem
                          href="/courses"
                          type="courses"
                        />
                      </div>
                      <div
                        onClick={() => {
                          setIsMenuOpen(false);
                        }}
                      >
                        <NavigationLinkItem
                          href="/collections"
                          type="collections"
                        />
                      </div>
                      {isAuthenticated && (
                        <div
                          onClick={() => {
                            setIsMenuOpen(false);
                          }}
                        >
                          <NavigationLinkItem
                            href="/trail"
                            type="trail"
                          />
                        </div>
                      )}
                    </div>
                  </nav>
                </div>
              </div>

              {/* Mobile locale switcher */}
              <div className="space-y-3 sm:hidden">
                <div className="flex items-center gap-2 px-2">
                  <div className="bg-primary h-4 w-1 rounded-full" />
                  <Label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    {t('language')}
                  </Label>
                </div>
                <div className="border-border/30 bg-accent/20 rounded-xl border p-4">
                  <div
                    className="flex min-h-[44px] items-center"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <LocaleSwitcher
                      className="w-full"
                      isMobile
                    />
                  </div>
                </div>
              </div>

              {/* Mobile profile */}
              <div className="border-border/50 space-y-3 border-t pt-6">
                <div className="flex items-center gap-2 px-2">
                  <div className="bg-primary h-4 w-1 rounded-full" />
                  <Label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    {t('account')}
                  </Label>
                </div>
                <div className="border-border/30 bg-accent/20 rounded-xl border p-4">
                  <div className="flex min-h-[44px] items-center justify-center">
                    <HeaderProfileBox />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
