import { beforeEach, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
