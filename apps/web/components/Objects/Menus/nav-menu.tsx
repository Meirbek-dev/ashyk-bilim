"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { BookCopy, Menu, Signpost, SquareLibrary } from "lucide-react";

// Components & UI
import Link from "@components/ui/AppLink";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SearchBar } from "@/components/Objects/Search/SearchBar";
import { LocaleSwitcher } from "@/components/Utils/LocaleSwitcher";
import { HeaderProfileBox } from "@/components/Security/HeaderProfileBox";

// Hooks & Config
import { useSession } from "@/hooks/useSession";
import { getAbsoluteUrl } from "@/services/config/config";
import { NAVBAR_HEIGHT } from "@/lib/constants";

// Assets
import platformLogoFull from "@public/platform_logo_full.svg";

interface NavigationLinkProps {
  href: string;
  type: "courses" | "collections" | "trail";
  onNavigate?: () => void;
}

// ----------------------------------------------------------------------
// Desktop & Mobile Link Component
// ----------------------------------------------------------------------
const NavigationLinkItem = ({
  href,
  type,
  onNavigate,
}: NavigationLinkProps) => {
  const t = useTranslations("Components.NavMenuLinks");
  const pathname = usePathname();

  const linkConfig = {
    courses: { icon: BookCopy, label: t("courses") },
    collections: { icon: SquareLibrary, label: t("collections") },
    trail: { icon: Signpost, label: t("trail") },
  };

  const { icon: Icon, label } = linkConfig[type];
  const isActive = pathname?.includes(href);

  return (
    <NavigationMenuItem className="list-none">
      <Link
        prefetch={false}
        href={getAbsoluteUrl(href)}
        onClick={onNavigate}
        className={`group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ${
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        <Icon
          size={18}
          className={`shrink-0 transition-colors ${
            isActive
              ? "text-primary"
              : "text-muted-foreground group-hover:text-accent-foreground"
          }`}
        />
        <span className={isActive ? "font-semibold" : ""}>{label}</span>
      </Link>
    </NavigationMenuItem>
  );
};

// ----------------------------------------------------------------------
// Main Navigation Bar Component
// ----------------------------------------------------------------------
export default function NavBar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);

  const pathname = usePathname();
  const t = useTranslations("Components.NavMenu");
  const { isAuthenticated } = useSession();

  const isOnActivityPage = pathname?.includes("/activity/") ?? false;

  // Handle Focus Mode Sync
  useEffect(() => {
    if (!isOnActivityPage) {
      setIsFocusMode(false);
      return;
    }

    const readFocusMode = () => {
      try {
        return localStorage.getItem("globalFocusMode") === "true";
      } catch {
        return false;
      }
    };

    setIsFocusMode(readFocusMode());

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "globalFocusMode") setIsFocusMode(readFocusMode());
    };

    const handleFocusModeChange = () => setIsFocusMode(readFocusMode());

    globalThis.addEventListener("storage", handleStorageChange);
    globalThis.addEventListener(
      "focusModeChange",
      handleFocusModeChange as EventListener,
    );

    return () => {
      globalThis.removeEventListener("storage", handleStorageChange);
      globalThis.removeEventListener(
        "focusModeChange",
        handleFocusModeChange as EventListener,
      );
    };
  }, [isOnActivityPage]);

  // Handle Scroll Effects (Glassmorphism)
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close menu automatically on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // Hide entirely in focus mode
  if (isOnActivityPage && isFocusMode) return null;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 w-full border-b transition-all duration-300 ${
        isScrolled
          ? "border-border/40 bg-background/80 shadow-sm backdrop-blur-md"
          : "border-transparent bg-background/95"
      }`}
      style={{ height: NAVBAR_HEIGHT }}
    >
      <div className="mx-auto flex h-full w-full items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left Section: Logo & Desktop Links */}
        <div className="flex items-center gap-6 lg:gap-8">
          <Link
            href={getAbsoluteUrl("/")}
            className="flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Image
              src={platformLogoFull}
              alt={t("logoAlt")}
              width={100}
              height={32}
              className="h-8 w-auto object-contain"
              priority
              loading="eager"
            />
          </Link>

          <nav className="hidden md:flex">
            <NavigationMenu>
              <NavigationMenuList className="space-x-1">
                <NavigationLinkItem href="/courses" type="courses" />
                <NavigationLinkItem href="/collections" type="collections" />
                {isAuthenticated && (
                  <NavigationLinkItem href="/trail" type="trail" />
                )}
              </NavigationMenuList>
            </NavigationMenu>
          </nav>
        </div>

        {/* Center Section: Desktop Search */}
        <div className="hidden flex-1 items-center justify-center px-6 lg:flex lg:max-w-2xl">
          <SearchBar className="w-full max-w-md" />
        </div>

        {/* Right Section: Desktop Controls & Mobile Trigger */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden sm:flex">
            <LocaleSwitcher />
          </div>

          <div className="hidden md:flex">
            <HeaderProfileBox />
          </div>

          {/* Mobile Sheet Menu */}
          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger
              render={(triggerProps) => (
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label={t("openMenu")}
                  {...triggerProps}
                >
                  <Menu className="h-5 w-5" />
                </Button>
              )}
            />

            <SheetContent
              side="left"
              className="flex w-full flex-col p-6 sm:max-w-sm"
            >
              <SheetHeader className="mb-4 text-left">
                <SheetTitle className="sr-only">{t("navigation")}</SheetTitle>
                <Image
                  src={platformLogoFull}
                  alt={t("logoAlt")}
                  width={90}
                  height={28}
                  className="h-7 w-auto object-contain"
                />
              </SheetHeader>

              <div className="flex flex-col gap-6 overflow-y-auto pb-6">
                {/* Mobile Search */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("search")}
                  </Label>
                  <SearchBar isMobile className="w-full" />
                </div>

                {/* Mobile Links */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("navigation")}
                  </Label>
                  <nav className="flex flex-col space-y-1">
                    <NavigationLinkItem href="/courses" type="courses" />
                    <NavigationLinkItem
                      href="/collections"
                      type="collections"
                    />
                    {isAuthenticated && (
                      <NavigationLinkItem href="/trail" type="trail" />
                    )}
                  </nav>
                </div>

                {/* Mobile Locale */}
                <div className="space-y-2 sm:hidden">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("language")}
                  </Label>
                  <LocaleSwitcher className="w-full" isMobile />
                </div>

                {/* Mobile Profile */}
                <div className="mt-auto space-y-2 border-t border-border/40 pt-6">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("account")}
                  </Label>
                  <div className="flex items-center justify-center rounded-xl border border-border/40 bg-accent/30 p-4">
                    <HeaderProfileBox />
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
