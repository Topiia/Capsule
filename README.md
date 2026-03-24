# CAPSULE — AI-Ready Visual Vlogging Platform

[![Backend CI](https://github.com/Topiia/Capsule/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/Topiia/Capsule/actions/workflows/backend-ci.yml)
[![Frontend CI](https://github.com/Topiia/Capsule/actions/workflows/frontend-ci.yml/badge.svg)](https://github.com/Topiia/Capsule/actions/workflows/frontend-ci.yml)
[![Security Scan](https://github.com/Topiia/Capsule/actions/workflows/security-scan.yml/badge.svg)](https://github.com/Topiia/Capsule/actions/workflows/security-scan.yml)
![Node](https://img.shields.io/badge/node-20.x-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

> 🔒 **CI enforces:** ESLint (zero warnings) · Jest ≥ 60% line coverage · Vitest ≥ 40% line coverage · Vite production build  
> 🚀 **Auto-deployed:** Backend → [Render](https://render.com) · Frontend → [Vercel](https://vercel.com)

## 🚀 Overview

CAPSULE is a cutting-edge, production-ready vlogging platform that combines futuristic design with powerful functionality. Built with modern web technologies, it offers users a premium experience for creating, sharing, and discovering visual content.

## ✨ Key Features

### Frontend

- **Futuristic UI/UX** with 3 premium gradient themes
- **Responsive Design** for mobile, tablet, and desktop
- **Smooth Animations** and 3D transitions
- **Glass-card Design** with hover glow effects
- **Theme Engine** with localStorage persistence

### Backend

- **Secure Authentication** with JWT + Refresh Tokens
- **RESTful API** with comprehensive endpoints
- **File Upload** with image storage
- **AI-Powered Auto-tagging** system
- **Security Features** (CORS, Helmet, Rate Limiting)

### Core Functionality

- User registration and authentication
- Create, edit, delete vlogs
- Multiple image uploads
- Description, tags, and categories
- Search and filtering
- Infinite scroll pagination
- Theme switching
- Toast notifications

## 🛠 Tech Stack

### Frontend

- React 18 with Vite
- Tailwind CSS
- Framer Motion (animations)
- React Router DOM
- Axios for API calls
- React Query for state management

### Backend

- Node.js + Express
- MongoDB with Mongoose
- JWT for authentication
- Bcrypt for password hashing
- Multer for file uploads
- Cloudinary for image storage
- Express Rate Limit
- Helmet for security

### AI/ML

- Simple NLP model for auto-tagging
- Content analysis for category suggestions

## 📁 Project Structure

```
capsule/
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API services
│   │   ├── utils/          # Utility functions
│   │   ├── contexts/       # React contexts
│   │   └── styles/         # Global styles
│   ├── public/             # Static assets
│   └── package.json
│
├── backend/                 # Node.js backend API
│   ├── src/
│   │   ├── controllers/    # Route controllers
│   │   ├── models/         # MongoDB models
│   │   ├── routes/         # API routes
│   │   ├── middleware/     # Custom middleware
│   │   ├── utils/          # Utility functions
│   │   ├── config/         # Configuration files
│   │   ├── services/       # Business logic
│   │   ├── queues/         # Bull job queues
│   │   └── workers/        # Background workers (email worker)
│   ├── uploads/            # Local upload directory
│   └── package.json
│
├── shared/                  # Shared types and utilities
└── docs/                   # Documentation
```

## 🎨 Theme System

### Available Themes

1. **Noir Velvet** → `#232526` → `#414345`
2. **Deep Space** → `#0D1452` → `#004E92`
3. **Crimson Night** → `#3A1C71` → `#D76D77`

### Theme Features

- Smooth transitions between themes
- Persistent user preference
- Dynamic CSS variable system
- Component-level theme adaptation

## 🔐 Security Features

- JWT-based authentication with 15-minute access token expiry
- Refresh token rotation with token family tracking (30-day session)
- Password hashing with bcrypt
- Input validation and sanitization
- CORS protection
- Rate limiting
- Helmet security headers
- Secure cookie handling
- CSRF protection

## 🚀 Getting Started

### Prerequisites

- Node.js 20.x (see `.nvmrc`)
- MongoDB (local installation OR MongoDB Atlas)
- npm or yarn
- Cloudinary account (for image storage)
- Resend account (for email - 100 free emails/day)

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd capsule
   ```

2. **Install backend dependencies**

   ```bash
   cd backend
   npm install
   ```

3. **Install frontend dependencies**

   ```bash
   cd ../frontend
   npm install
   ```

4. **Set up environment variables**

   **Backend** (`backend/.env`):

   ```bash
   cp backend/.env.example backend/.env
   ```

   Edit `backend/.env` with your credentials:

   ```env
   # Server
   PORT=5000
   NODE_ENV=development

   # Database
   MONGODB_URI=mongodb://localhost:27017/capsule

   # Frontend
   FRONTEND_URL=http://localhost:3000
   CORS_ORIGINS=http://localhost:3000

   # JWT
   JWT_SECRET=your-super-secret-jwt-key-here
   JWT_REFRESH_SECRET=your-super-secret-refresh-key
   JWT_EXPIRE=15m
   JWT_REFRESH_EXPIRE=30d

   # Cloudinary
   CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret

   # Redis (local dev)
   REDIS_HOST=127.0.0.1
   REDIS_PORT=6379

   # Email (Resend)
   RESEND_API_KEY=re_your_resend_api_key
   FROM_EMAIL=onboarding@resend.dev
   FROM_NAME=Capsule

   # Rate Limiting
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100

   # Upload
   MAX_FILE_SIZE=10485760
   UPLOAD_PATH=uploads/

   # AI
   AI_TAGGING_ENABLED=true
   MIN_DESCRIPTION_LENGTH=10
   ```

   **Frontend** (`frontend/.env` - Optional):

   ```bash
   cp frontend/.env.example frontend/.env
   ```

   Edit `frontend/.env` with your credentials:

   ```env
   VITE_API_URL=http://localhost:5000/api
   VITE_APP_URL=http://localhost:3000
   VITE_AI_TAGGING_ENABLED=true
   VITE_MAX_FILE_SIZE=10485760
   VITE_DEFAULT_THEME=noir-velvet
   ```

5. **Start MongoDB** (if using local installation)

   ```bash
   mongod
   ```

6. **Start the development servers**

   **Terminal 1 - Backend:**

   ```bash
   cd backend
   npm run dev
   ```

   Backend runs on: `http://localhost:5000`

   **Terminal 2 - Frontend:**

   ```bash
   cd frontend
   npm run dev
   ```

   Frontend runs on: `http://localhost:3000`

7. **Access the application**
   - Open browser: `http://localhost:3000`
   - API base URL: `http://localhost:5000/api`

## 📡 API Endpoints

### Authentication

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh access token

### Vlogs

- `GET /api/vlogs` - Get all vlogs (paginated)
- `GET /api/vlogs/:id` - Get single vlog
- `POST /api/vlogs` - Create new vlog
- `PUT /api/vlogs/:id` - Update vlog
- `DELETE /api/vlogs/:id` - Delete vlog
- `GET /api/vlogs/search` - Search vlogs

### Images

- `POST /api/upload` - Upload images
- `DELETE /api/upload/:id` - Delete images

## 🧪 Testing

All tests run fully isolated — no live database, Redis, or external API credentials required.

```bash
# Backend — lint + jest + coverage (≥ 60% lines required)
cd backend
npm run lint       # zero warnings enforced
npm test           # Jest 19 test suites + coverage report
npm run test:watch # watch mode for local dev
npm run test:unit      # unit tests only
npm run test:integration  # integration tests only
npm run worker:email   # start email background worker
npm run seed           # seed the database with sample data

# Frontend — lint + build + vitest + coverage (≥ 40% lines required)
cd frontend
npm run lint         # zero warnings enforced
npm run build        # production build validation
npm test             # Vitest 21 test files (single-pass)
npm run test:watch   # watch mode for local dev
npm run test:coverage  # explicit coverage report
```

> **CI Pipeline:** Both test pipelines run automatically on every pull request via GitHub Actions.
> **Security Scan:** Weekly Monday 9AM UTC — wakes Render backend, audits CSP and security headers, checks SSL expiry, runs npm audit on both frontend and backend. Uploads markdown report as artifact.
> See [`docs/internal/ci.md`](docs/internal/ci.md) for full pipeline documentation.

## 🚀 Deployment

## 🌐 Live URLs
| Service  | URL |
|----------|-----|
| Frontend | https://vlogspherefrontend.vercel.app |
| Backend  | https://capsule-backend.onrender.com |

### Frontend Deployment (Vercel)

1. Connect your GitHub repository to Vercel
2. Configure build settings
3. Add environment variables
4. Deploy

### Backend Deployment (Render/Railway)

1. Connect your repository
2. Configure build command and start command
3. Add environment variables
4. Deploy

### Database (MongoDB Atlas)

1. Create a MongoDB Atlas cluster
2. Configure connection string
3. Set up database access
4. Whitelist IP addresses

## 📈 Scaling to SaaS

### Infrastructure

- Load balancing with NGINX
- **Redis**: 
  - Managed via Upstash in production (`REDIS_URL`)
  - Local Redis (`127.0.0.1:6379`) in development
  - *Used for:* Caching, Atomic counters, and Queueing
- CDN for static assets
- Microservices architecture

### Features

- Multi-tenant support
- Advanced analytics
- Monetization features
- Team collaboration
- API rate limiting per user
- Advanced search with Elasticsearch

### Monitoring

- Error tracking with Sentry
- Performance monitoring
- User analytics
- Uptime monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support, please open an issue in the GitHub repository or contact the development team.

---

Built with ❤️ by the CAPSULE team
