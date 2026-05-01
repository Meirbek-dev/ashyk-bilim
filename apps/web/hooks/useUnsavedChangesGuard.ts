'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

interface UnsavedChangesGuardOptions {
  message?: string;
  interceptInAppNavigation?: boolean;
}

interface PendingNavigation {
  kind: 'history-back' | 'link';
  href?: string;
}

const globalPromptState: {
  ownerId: symbol | null;
} = {
  ownerId: null,
};

function tryReleasePromptOwnership(ownerId: symbol) {
  if (globalPromptState.ownerId === ownerId) {
    globalPromptState.ownerId = null;
  }
}

function setPromptOwnership(ownerId: symbol) {
  globalPromptState.ownerId = ownerId;
}

function createGuardHistoryState() {
  return { ...globalThis.history.state, __unsavedChangesGuard: true };
}

export function useUnsavedChangesGuard(isDirty: boolean, options?: UnsavedChangesGuardOptions) {
  const message = options?.message ?? '';
  const interceptInAppNavigation = options?.interceptInAppNavigation ?? false;
  const messageRef = useRef(message);
  const ignoreNextPopRef = useRef(false);
  const allowNavigationRef = useRef(false);
  const guardInstanceIdRef = useRef(Symbol('unsaved-changes-guard'));
  const pendingLinkRef = useRef<HTMLAnchorElement | null>(null);
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);

  const releasePromptOwnership = useCallback(() => {
    tryReleasePromptOwnership(guardInstanceIdRef.current);
  }, []);

  const openPendingNavigation = useCallback((nextPendingNavigation: PendingNavigation) => {
    const currentOwnerId = globalPromptState.ownerId;
    if (currentOwnerId !== null && currentOwnerId !== guardInstanceIdRef.current) {
      return;
    }

    if (pendingNavigationRef.current !== null) {
      return;
    }

    setPromptOwnership(guardInstanceIdRef.current);
    pendingNavigationRef.current = nextPendingNavigation;
    setPendingNavigation(nextPendingNavigation);
  }, []);

  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  useEffect(() => {
    pendingNavigationRef.current = pendingNavigation;
  }, [pendingNavigation]);

  useEffect(() => {
    if (isDirty) {
      return;
    }

    releasePromptOwnership();
    allowNavigationRef.current = false;
    ignoreNextPopRef.current = false;
    pendingLinkRef.current = null;
    pendingNavigationRef.current = null;
    setPendingNavigation(null);
  }, [isDirty, releasePromptOwnership]);

  useEffect(() => {
    return () => {
      releasePromptOwnership();
    };
  }, [releasePromptOwnership]);

  const cancelNavigation = useCallback(() => {
    const currentPending = pendingNavigationRef.current;
    if (!currentPending) {
      return;
    }
    // Clear ref synchronously so re-entrant calls are no-ops.
    pendingNavigationRef.current = null;

    if (currentPending.kind === 'history-back') {
      globalThis.history.pushState(createGuardHistoryState(), '', globalThis.location.href);
    }

    releasePromptOwnership();
    pendingLinkRef.current = null;
    allowNavigationRef.current = false;
    setPendingNavigation(null);
  }, [releasePromptOwnership]);

  const confirmNavigation = useCallback(() => {
    const currentPending = pendingNavigationRef.current;

    if (!currentPending) {
      return;
    }

    // Clear ref immediately so any re-entrant call returns early.
    pendingNavigationRef.current = null;
    // Flush the dialog closed synchronously before navigating so there is no
    // window in which a spurious popstate/click can reopen it.
    flushSync(() => setPendingNavigation(null));

    if (currentPending.kind === 'history-back') {
      ignoreNextPopRef.current = true;
      globalThis.history.back();
      return;
    }

    allowNavigationRef.current = true;

    if (pendingLinkRef.current?.isConnected) {
      pendingLinkRef.current.click();
      return;
    }

    if (currentPending.href) {
      globalThis.location.assign(currentPending.href);
    }
  }, []);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  useEffect(() => {
    if (!(isDirty && interceptInAppNavigation)) {
      return;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      if (globalPromptState.ownerId !== null && globalPromptState.ownerId !== guardInstanceIdRef.current) {
        return;
      }

      if (allowNavigationRef.current || pendingNavigationRef.current !== null) {
        return;
      }

      if (event.defaultPrevented || event.button !== 0) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const { target } = event;
      if (!(target instanceof Element)) {
        return;
      }

      const link = target.closest('a[href]');
      if (!(link instanceof HTMLAnchorElement)) {
        return;
      }

      if (link.target && link.target !== '_self') {
        return;
      }

      if (link.hasAttribute('download')) {
        return;
      }

      const nextUrl = new URL(link.href, globalThis.location.href);
      const currentUrl = new URL(globalThis.location.href);
      if (
        nextUrl.pathname === currentUrl.pathname &&
        nextUrl.search === currentUrl.search &&
        nextUrl.hash === currentUrl.hash
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      pendingLinkRef.current = link;
      openPendingNavigation({ kind: 'link', href: nextUrl.toString() });
    };

    if (globalThis.history.state?.__unsavedChangesGuard !== true) {
      globalThis.history.pushState(createGuardHistoryState(), '', globalThis.location.href);
    }

    const handlePopState = () => {
      if (ignoreNextPopRef.current) {
        ignoreNextPopRef.current = false;
        return;
      }

      if (globalPromptState.ownerId !== null && globalPromptState.ownerId !== guardInstanceIdRef.current) {
        return;
      }

      if (allowNavigationRef.current || pendingNavigationRef.current !== null) {
        return;
      }

      pendingLinkRef.current = null;
      openPendingNavigation({ kind: 'history-back' });
    };

    document.addEventListener('click', handleDocumentClick, true);
    globalThis.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
      globalThis.removeEventListener('popstate', handlePopState);
    };
  }, [interceptInAppNavigation, isDirty, openPendingNavigation]);

  return {
    cancelNavigation,
    confirmNavigation,
    isPromptOpen: pendingNavigation !== null,
    promptMessage: messageRef.current || 'You have unsaved changes. Leave this page?',
  };
}
