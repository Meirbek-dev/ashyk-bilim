import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Polyfill process.env for browser environment
if (typeof process === 'undefined') {
  (globalThis as any).process = { env: {} };
}

// Mock window.matchMedia which is often missing in test environments
Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

class MockIntersectionObserver {
  root = null;
  rootMargin = '';
  scrollMargin = '';
  thresholds = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
}

globalThis.ResizeObserver = MockResizeObserver;
globalThis.IntersectionObserver = MockIntersectionObserver;
