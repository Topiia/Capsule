# CAPSULE — AI-Ready Visual Vlogging Platform

[![Backend CI](https://github.com/YOUR_GITHUB_USERNAME/Capsule/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/YOUR_GITHUB_USERNAME/Capsule/actions/workflows/backend-ci.yml)
[![Frontend CI](https://github.com/YOUR_GITHUB_USERNAME/Capsule/actions/workflows/frontend-ci.yml/badge.svg)](https://github.com/YOUR_GITHUB_USERNAME/Capsule/actions/workflows/frontend-ci.yml)
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
│   │   └── services/       # Business logic
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

- JWT-based authentication
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
   # Database
   MONGODB_URI=mongodb://localhost:27017/capsule
   # OR for MongoDB Atlas:
   # MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/capsule

   # JWT Secrets (generate strong random strings)
   JWT_SECRET=your-super-secret-jwt-key-here
   JWT_REFRESH_SECRET=your-super-secret-refresh-key

   # Resend Email API
   RESEND_API_KEY=re_your_resend_api_key
   FROM_EMAIL=onboarding@resend.dev
   FROM_NAME=Capsule

   # Cloudinary
   CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name

   # Frontend URL
   FRONTEND_URL=http://localhost:3000
   ```

   **Frontend** (`frontend/.env` - Optional):

   ```bash
   cp frontend/.env.example frontend/.env
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

# Frontend — lint + build + vitest + coverage (≥ 40% lines required)
cd frontend
npm run lint         # zero warnings enforced
npm run build        # production build validation
npm test             # Vitest 21 test files (single-pass)
npm run test:watch   # watch mode for local dev
npm run test:coverage  # explicit coverage report
```

> **CI Pipeline:** Both test pipelines run automatically on every pull request via GitHub Actions.
> See [`docs/internal/ci.md`](docs/internal/ci.md) for full pipeline documentation.

## 🚀 Deployment

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
- Redis for caching and sessions
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
