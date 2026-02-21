import { beforeEach, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMockApi } from "./utils/mockApi";

// Global API mocking - MUST BE TOP LEVEL for hoisting
vi.mock("../../services/api", () => createMockApi());

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
