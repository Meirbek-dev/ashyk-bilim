import { getTheme, THEME_CACHE_STORAGE_KEY, THEME_MODE_STORAGE_KEY } from '@/lib/themes';
import type { Theme } from '@/lib/themes';
import {
  GOOGLE_FONT_QUERY_BY_FAMILY,
  GOOGLE_FONTS_ASSET_ORIGIN,
  GOOGLE_FONTS_STYLESHEET_ORIGIN,
  SYSTEM_FONT_FAMILY_KEYS,
  THEME_FONT_FAMILIES_ATTRIBUTE,
  THEME_FONT_LINK_ATTRIBUTE,
  THEME_FONT_TOKENS,
} from '@/lib/theme-fonts';

function safeJson(value: unknown): string {
  const json = JSON.stringify(value);
  return json === undefined ? 'undefined' : json.replace(/</g, '\\u003c');
}

interface ThemeScriptProps {
  initialTheme: Theme;
}

export function ThemeScript({ initialTheme }: ThemeScriptProps) {
  const defaultTokensByMode = {
    light: getTheme(initialTheme.name, 'light').tokens,
    dark: getTheme(initialTheme.name, 'dark').tokens,
  };

  const scriptContent = `
    (function() {
      var root = document.documentElement;
      var themeName = ${safeJson(initialTheme.name)};
      var modeStorageKey = ${safeJson(THEME_MODE_STORAGE_KEY)};
      var cacheStorageKey = ${safeJson(THEME_CACHE_STORAGE_KEY)};
      var defaultTokensByMode = ${safeJson(defaultTokensByMode)};
      var fontTokens = ${safeJson(THEME_FONT_TOKENS)};
      var systemFonts = ${safeJson(Object.fromEntries(SYSTEM_FONT_FAMILY_KEYS.map((family) => [family, true])))};
      var googleFontQueries = ${safeJson(GOOGLE_FONT_QUERY_BY_FAMILY)};
      var googleFontsStylesheetOrigin = ${safeJson(GOOGLE_FONTS_STYLESHEET_ORIGIN)};
      var googleFontsAssetOrigin = ${safeJson(GOOGLE_FONTS_ASSET_ORIGIN)};
      var themeFontLinkAttribute = ${safeJson(THEME_FONT_LINK_ATTRIBUTE)};
      var themeFontFamiliesAttribute = ${safeJson(THEME_FONT_FAMILIES_ATTRIBUTE)};

      function getStoredMode() {
        try {
          var stored = localStorage.getItem(modeStorageKey);
          return stored === "light" || stored === "dark" ? stored : null;
        } catch (_) {
          return null;
        }
      }

      function getCachedTheme() {
        try {
          var raw = localStorage.getItem(cacheStorageKey);
          if (!raw) return null;
          var parsed = JSON.parse(raw);
          if (!parsed || !parsed.tokensByMode) return null;
          return parsed;
        } catch (_) {
          return null;
        }
      }

      function getSystemMode() {
        return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      }

      function normalizeFontFamilyKey(family) {
        return family.trim().replace(/^['"]|['"]$/g, "").replace(/\\s+/g, " ").toLowerCase();
      }

      function readFirstFontFamily(fontFamilyValue) {
        var quote = null;
        var family = "";

        for (var index = 0; index < fontFamilyValue.length; index += 1) {
          var char = fontFamilyValue[index];

          if (quote) {
            if (char === quote) quote = null;
            family += char;
            continue;
          }

          if (char === '"' || char === "'") {
            quote = char;
            family += char;
            continue;
          }

          if (char === ",") break;
          family += char;
        }

        var cleanFamily = family.trim().replace(/^['"]|['"]$/g, "");
        return cleanFamily || null;
      }

      function getGoogleFontFamily(fontFamilyValue) {
        if (!fontFamilyValue) return null;

        var family = readFirstFontFamily(fontFamilyValue);
        if (!family) return null;

        var familyKey = normalizeFontFamilyKey(family);
        if (systemFonts[familyKey]) return null;

        for (var googleFamily in googleFontQueries) {
          if (
            Object.prototype.hasOwnProperty.call(googleFontQueries, googleFamily) &&
            normalizeFontFamilyKey(googleFamily) === familyKey
          ) {
            return googleFamily;
          }
        }

        return null;
      }

      function readLoadedFontFamilies() {
        var loaded = {};
        var links = document.querySelectorAll("link[" + themeFontLinkAttribute + "]");

        for (var linkIndex = 0; linkIndex < links.length; linkIndex += 1) {
          var rawFamilies = links[linkIndex].getAttribute(themeFontFamiliesAttribute);
          if (!rawFamilies) continue;

          var families = rawFamilies.split("|");
          for (var familyIndex = 0; familyIndex < families.length; familyIndex += 1) {
            loaded[families[familyIndex]] = true;
          }
        }

        return loaded;
      }

      function stylesheetExists(href) {
        var links = document.querySelectorAll('link[rel="stylesheet"]');

        for (var index = 0; index < links.length; index += 1) {
          if (links[index].href === href || links[index].getAttribute("href") === href) {
            return true;
          }
        }

        return false;
      }

      function ensurePreconnect(href, crossOrigin) {
        var links = document.querySelectorAll('link[rel="preconnect"]');

        for (var index = 0; index < links.length; index += 1) {
          if (links[index].href === href || links[index].getAttribute("href") === href) {
            return;
          }
        }

        var link = document.createElement("link");
        link.rel = "preconnect";
        link.href = href;
        if (crossOrigin) link.crossOrigin = "anonymous";
        document.head.appendChild(link);
      }

      function buildFontStylesheetHref(families) {
        if (families.length === 0) return null;
        families.sort();

        var familyParams = families.map(function(family) {
          return "family=" + googleFontQueries[family].trim().replace(/ /g, "+");
        }).join("&");

        return googleFontsStylesheetOrigin + "/css2?" + familyParams + "&display=swap";
      }

      function loadGoogleFonts(families) {
        var loaded = readLoadedFontFamilies();
        var seen = {};
        var missingFamilies = [];

        for (var index = 0; index < families.length; index += 1) {
          var family = families[index];
          if (!family || loaded[family] || seen[family]) continue;
          seen[family] = true;
          missingFamilies.push(family);
        }

        var href = buildFontStylesheetHref(missingFamilies);
        if (!href) return;

        ensurePreconnect(googleFontsStylesheetOrigin, false);
        ensurePreconnect(googleFontsAssetOrigin, true);

        if (stylesheetExists(href)) return;

        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.setAttribute(themeFontLinkAttribute, "true");
        link.setAttribute(themeFontFamiliesAttribute, missingFamilies.join("|"));
        document.head.appendChild(link);
      }

      var cachedTheme = getCachedTheme();
      var tokensByMode = cachedTheme && cachedTheme.tokensByMode
        ? cachedTheme.tokensByMode
        : defaultTokensByMode;
      var mode = getStoredMode() || getSystemMode();
      var tokens = tokensByMode[mode] || tokensByMode.light || {};
      themeName = cachedTheme && cachedTheme.name ? cachedTheme.name : themeName;

      for (var key in tokens) {
        if (Object.prototype.hasOwnProperty.call(tokens, key)) {
          root.style.setProperty("--" + key, tokens[key]);
        }
      }

      root.setAttribute("data-theme", themeName);
      root.setAttribute("data-mode", mode);
      root.classList.toggle("dark", mode === "dark");
      root.style.colorScheme = mode;

      try {
        var families = [];
        fontTokens.forEach(function(token) {
          var family = getGoogleFontFamily(tokens[token]);
          if (family) families.push(family);
        });
        loadGoogleFonts(families);
      } catch (error) {
        console.warn("Theme font initialization failed:", error);
      }
    })();
  `;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: scriptContent }}
      suppressHydrationWarning
    />
  );
}
