# CAPSULE Setup Guide

## 🚀 Quick Start

This guide will help you set up and run the CAPSULE platform on your local machine or production server.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 16.0.0 or higher
- **npm** 8.0.0 or higher
- **MongoDB** 4.0+ (or MongoDB Atlas account)
- **Git** (for cloning the repository)

### Optional Tools

- **Docker** & **Docker Compose** (for containerized deployment)
- **PM2** (for process management in production)
- **Redis** 
  - Local dev: requires Redis running on 127.0.0.1:6379
  - Production: uses Upstash (set REDIS_URL in Render env vars)

## 🔧 Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd capsule
```

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit the .env file with your configuration
nano .env  # or use your preferred editor
```

**Required Environment Variables:**

Create a `.env` file in the `backend` directory with the following variables:

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

### 3. Frontend Setup

```bash
# Navigate to frontend directory
cd ../frontend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit the .env file
nano .env  # or use your preferred editor
```

**Required Environment Variables:**

Create a `.env` file in the `frontend` directory with the following variables:

```env
VITE_API_URL=http://localhost:5000/api
VITE_APP_URL=http://localhost:3000
VITE_AI_TAGGING_ENABLED=true
VITE_MAX_FILE_SIZE=10485760
VITE_DEFAULT_THEME=noir-velvet
```

### 4. Database Setup

#### Option A: Local MongoDB

```bash
# Start MongoDB service
sudo systemctl start mongod

# Create database (optional)
mongosh
use capsule
exit
```

#### Option B: MongoDB Atlas

1. Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a database user
3. Get your connection string
4. Add the connection string to your backend `.env` file

### 5. Seed Database (Optional)

```bash
# From the backend directory
npm run seed
```

This will create sample users and vlogs for testing.

## 🏃‍♂️ Running the Application

### Development Mode

#### Backend

```bash
cd backend
npm run dev
```

#### Frontend

```bash
cd frontend
npm run dev
```

The application will be available at:

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## Background Workers
The email queue runs as a separate process using Bull + Redis.
Start the email worker in a separate terminal:
```bash
cd backend
npm run worker:email
```
Requires Redis running locally on port 6379.
In production (Render), deploy as a separate worker service.

### Production Mode

#### Backend

```bash
cd backend
npm start
```

#### Frontend

```bash
cd frontend
npm run build
npm run preview  # or serve the dist folder with a web server
```

## 🐳 Docker Deployment

### Using Docker Compose

1. **Configure Environment Variables**

   ```bash
   # Edit docker-compose.yml with your environment variables
   nano docker-compose.yml
   ```

2. **Build and Run**

   ```bash
   docker-compose up -d
   ```

3. **Check Status**
   ```bash
   docker-compose ps
   docker-compose logs
   ```

### Individual Docker Containers

```bash
# Build and run backend
cd backend
docker build -t capsule-backend .
docker run -p 5000:5000 --env-file .env capsule-backend

# Build and run frontend
cd ../frontend
docker build -t capsule-frontend .
docker run -p 3000:80 capsule-frontend
```

## 🌐 Production Deployment

### Using the Deployment Script

```bash
# Make the script executable
chmod +x deploy.sh

# Run the deployment script
./deploy.sh
```

### Manual Production Setup

1. **Server Preparation**

   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y

   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Install PM2
   sudo npm install -g pm2
   ```

2. **Application Setup**

   ```bash
   # Clone repository
   git clone <your-repository-url>
   cd capsule

   # Setup backend
   cd backend
   npm install
   npm run build

   # Start with PM2
   pm2 start src/server.js --name capsule-backend
   pm2 startup
   pm2 save

   # Setup frontend
   cd ../frontend
   npm install
   npm run build
   ```

3. **Web Server Configuration**

   ```bash
   # Install NGINX
   sudo apt install nginx

   # Configure NGINX
   sudo nano /etc/nginx/sites-available/capsule
   ```

   **NGINX Configuration:**

   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           root /path/to/capsule/frontend/dist;
           try_files $uri $uri/ /index.html;
       }

       location /api {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

## 🔐 Security Considerations

### Environment Security

- Never commit `.env` files to version control
- Use strong, unique passwords and secrets
- Rotate secrets regularly in production
- Use HTTPS in production

### Database Security

- Use connection strings with authentication
- Implement database backup strategies
- Monitor database access and performance

### Application Security

- Keep dependencies updated
- Use security headers
- Implement rate limiting
- Monitor for vulnerabilities

## 📊 Monitoring & Maintenance

### Logs

```bash
# Backend logs
pm2 logs capsule-backend

# System logs
sudo journalctl -u capsule-backend
```

### Performance Monitoring

- Use PM2 monitoring: `pm2 monit`
- Monitor MongoDB performance
- Track application metrics

### Updates

```bash
# Update dependencies
npm update

# Update system
sudo apt update && sudo apt upgrade
```

## 🆘 Troubleshooting

### Common Issues

1. **Port Already in Use**

   ```bash
   # Find process using port
   lsof -i :5000

   # Kill process
   kill -9 <PID>
   ```

2. **MongoDB Connection Failed**
   - Check MongoDB service status
   - Verify connection string
   - Check firewall settings

3. **Build Errors**
   - Clear node_modules: `rm -rf node_modules && npm install`
   - Check Node.js version
   - Verify environment variables

4. **CORS Issues**
   - Check backend CORS configuration
   - Verify frontend API URL

### Getting Help

- Check application logs
- Review error messages
- Consult the documentation
- Check GitHub issues
- Contact support

## 📈 Scaling

### Horizontal Scaling

- Use load balancers
- Deploy multiple instances
- Use container orchestration (Kubernetes)

### Vertical Scaling

- Increase server resources
- Optimize database queries
- Use caching strategies

### Database Scaling

- Implement database sharding
- Use read replicas
- Optimize indexes

## 🎉 Success!

You should now have a fully functional CAPSULE platform running. Visit your application URL to start creating and sharing amazing visual content!

## 📞 Support

If you encounter any issues:

1. Check the logs for error messages
2. Review this setup guide
3. Check the GitHub repository for known issues
4. Create a new issue with detailed information

Happy vlogging! 🎥✨
