# CI Pipeline Documentation

## Overview

Capsule uses GitHub Actions for automated quality validation on every push and pull request. **CI validates only — deployment is handled natively by Render (backend) and Vercel (frontend).**

```
Developer pushes code
        │
        ▼
┌─────────────────────┐    ┌──────────────────────────┐
│    backend-ci.yml   │    │    frontend-ci.yml        │
│  (backend/** only)  │    │  (frontend/** only)       │
│                     │    │                           │
│  1. npm ci          │    │  1. npm ci                │
│  2. ESLint (0 warn) │    │  2. ESLint (0 warn)       │
│  3. Jest --coverage │    │  3. vite build            │
│  4. Upload artifact │    │  4. Vitest --coverage     │
│                     │    │  5. Upload artifact       │
└─────────────────────┘    └──────────────────────────┘
        │                           │
        └───────────┬───────────────┘
                    ▼
         Both must pass ✅
         before merge to main
```

---

## Workflow Files

| File | Triggers | Key Steps |
|---|---|---|
| [backend-ci.yml](file:///.github/workflows/backend-ci.yml) | Push/PR to `main` when `backend/**` changes | lint → jest --coverage |
| [frontend-ci.yml](file:///.github/workflows/frontend-ci.yml) | Push/PR to `main` when `frontend/**` changes | lint → vite build → vitest --coverage |

---

## What Each Job Validates

### Backend CI (`backend-ci`)

| Step | Tool | Threshold |
|---|---|---|
| **Lint** | ESLint (airbnb-base) | Zero warnings (`--max-warnings 0`) |
| **Tests** | Jest 29 + Supertest | All 19 test files must pass |
| **Coverage** | Istanbul (built-in) | ≥ 60% line coverage |
| **Artifact** | `actions/upload-artifact` | `backend-coverage-{run}` stored 30 days |

### Frontend CI (`frontend-ci`)

| Step | Tool | Threshold |
|---|---|---|
| **Lint** | ESLint (react + hooks) | Zero warnings (`--max-warnings 0`) |
| **Build** | Vite 4 | Must produce `dist/` without errors |
| **Tests** | Vitest + React Testing Library | All 21 test files must pass |
| **Coverage** | V8 provider | ≥ 40% line coverage |
| **Artifact** | `actions/upload-artifact` | `frontend-coverage-{run}` stored 30 days |

---

## Environment Variables in CI

### What's Injected (safe, non-secret)

```yaml
# Backend
NODE_ENV: test
JWT_SECRET: ci-fake-jwt-secret-minimum-32-characters-long   # Fake — tests use mocks
JWT_REFRESH_SECRET: ci-fake-refresh-secret-minimum-32-characters-long
JWT_EXPIRE: 7d
JWT_REFRESH_EXPIRE: 30d
FRONTEND_URL: http://localhost:3000
PORT: 5000

# Frontend
VITE_API_URL: http://localhost:5000/api
VITE_APP_URL: http://localhost:3000
```

### What's NOT Needed in CI

| Variable | Why Not Needed |
|---|---|
| `MONGODB_URI` | `mongodb-memory-server` handles in-process MongoDB |
| `REDIS_HOST/PORT` | `jest.mock('../config/redis')` + `jest.mock('bull')` |
| `CLOUDINARY_*` | All upload tests use mocks |
| `GROQ_API_KEY` | AI provider tests use jest mocks |
| `HUGGINGFACE_API_KEY` | AI provider tests use jest mocks |
| `RESEND_API_KEY` | `jest.mock('resend')` in emailWorker tests |

> **Security principle:** No real secrets ever enter CI. All external services are fully mocked at the module level using Jest's `jest.mock()`.

---

## Branch Protection Setup

After pushing these workflows, configure protection on `main` in GitHub:

**GitHub → Repository → Settings → Branches → Add rule**

```
Branch name pattern: main
```

Enable these options:

| Setting | Value |
|---|---|
| Require a pull request before merging | ✅ On |
| Required approvals | 1 |
| Dismiss stale reviews on new commits | ✅ On |
| Require status checks to pass | ✅ On |
| Required checks | `Lint + Test + Coverage` (backend-ci) |
| Required checks | `Lint + Build + Test + Coverage` (frontend-ci) |
| Require branches to be up to date | ✅ On |
| Block force pushes | ✅ On |
| Restrict direct pushes | ✅ On |

---

## Running Locally Before Pushing

Always validate locally before opening a PR. CI will fail for the same reasons locally.

### Backend

```bash
cd backend

# Install deps
npm ci

# Run linter (zero warnings)
npm run lint

# Run tests with full coverage report
npm test
# → Opens coverage/index.html for visual report

# Watch mode during development
npm run test:watch
```

### Frontend

```bash
cd frontend

# Install deps (includes @vitest/coverage-v8)
npm ci

# Run linter
npm run lint

# Production build check
npm run build

# Run tests with coverage (single-pass, same as CI)
npm test

# Coverage report (explicit)
npm run test:coverage

# Watch mode during development
npm run test:watch
```

### Expected Outputs

```
Backend:  Jest: 19 test suites passed
          Coverage: ≥ 60% lines
          ESLint: 0 warnings

Frontend: Vitest: 21 test files passed
          Coverage: ≥ 40% lines
          ESLint: 0 warnings
          Vite build: dist/ generated successfully
```

---

## Coverage Thresholds

| Component | Current Threshold | Long-term Target |
|---|---|---|
| Backend | 60% lines | 80% |
| Frontend | 40% lines | 70% |

Thresholds are intentionally conservative to avoid blocking PRs immediately. Raise them gradually as test coverage improves.

---

## Troubleshooting CI Failures

| Failure | Cause | Fix |
|---|---|---|
| `ESLint: X warnings` | Code added with warnings | Fix the warning locally first |
| `Jest: coverage below 60%` | New code without tests | Add test coverage for new files |
| `Vitest: coverage below 40%` | New component without tests | Add component tests |
| `vite build: error` | Import error or missing file | Run `npm run build` locally |
| `npm ci: error` | `package-lock.json` out of sync | Run `npm install` and commit the updated lockfile |

---

## Artifacts

After every CI run, download coverage reports from:

**GitHub → Actions → [workflow run] → Artifacts**

- `backend-coverage-{N}` — Jest HTML report + lcov data
- `frontend-coverage-{N}` — Vitest HTML report + lcov data
