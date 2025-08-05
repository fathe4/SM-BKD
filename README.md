# Social Platform Backend 🚀

A robust, scalable social media platform backend built with Express.js, TypeScript, and Supabase. This API powers a full-featured social media experience with real-time messaging, content sharing, and social interactions.

## 🌟 Features

### Core Social Features

- **User Management**: Authentication, profiles, privacy settings
- **Content Sharing**: Posts, comments, reactions, and media uploads
- **Social Connections**: Friendships, following/followers system
- **Real-time Messaging**: Direct messages and group chats
- **Stories**: Temporary content sharing
- **Marketplace**: Buy/sell functionality with integrated payments

### Advanced Features

- **Real-time Notifications**: WebSocket-powered live updates
- **Payment Processing**: Stripe integration for subscriptions and marketplace
- **File Uploads**: Secure media handling with Multer
- **Privacy Controls**: Granular user privacy settings
- **Content Moderation**: Built-in safety features
- **Analytics & Insights**: User engagement tracking (Still working)

## 🛠️ Tech Stack

- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Real-time**: Socket.IO
- **Authentication**: JWT
- **Payments**: Stripe
- **File Storage**: Multer + Supabase Storage
- **Testing**: Jest + Mocha
- **Deployment**: Vercel
- **Validation**: Zod + Express Validator

## 📋 Prerequisites

Before running this project, make sure you have:

- **Node.js** (v18.0.0 or higher)
- **npm** or **yarn** package manager
- **Supabase** account and project
- **Stripe** account (for payment features)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/social-platform-backend.git
cd social-platform-backend
```

### 2. Install Dependencies

```bash
# Using npm
npm install

# Using yarn
yarn install
```

### 3. Environment Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
NODE_ENV=development
PORT=5000

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# JWT Configuration
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

# Stripe Configuration (for payments)
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# File Upload Configuration
MAX_FILE_SIZE=10485760  # 10MB
ALLOWED_FILE_TYPES=jpg,jpeg,png,gif,mp4,mov

# CORS Configuration
FRONTEND_URL=http://localhost:3000

# Logging
LOG_LEVEL=info
```

### 4. Database Setup

Since this project uses Supabase, you have several options for setting up your database:

#### Option 1: Using npm Scripts (Recommended)

```bash
# Setup database schema
npm run db:setup

# Run existing migrations
npm run migrate:privacy-settings

# Seed initial data (optional)
npm run seed
```

#### Option 2: Using Supabase Dashboard

1. **Go to your Supabase project dashboard**
2. **Navigate to the SQL Editor**
3. **Run the schema** from `src/scripts/db-schema.sql`

#### Option 3: Using the Setup Script Directly

```bash
# Run the database setup script directly
npx ts-node src/scripts/setupDatabase.ts
```

#### Option 4: Using Supabase CLI

```bash
# If you have Supabase CLI installed
supabase db reset
supabase db push
```

**Note**: Make sure your Supabase environment variables are properly configured before running any database setup commands.

### 5. Start Development Server

```bash
# Development mode with hot reload
npm run dev

# Production build and start
npm run build
npm start
```

The server will start at `http://localhost:5000` (or your configured PORT).

## 📁 Project Structure

```
social-platform-backend/
├── src/
│   ├── config/           # Configuration files
│   │   ├── database.ts   # Database connection
│   │   ├── jwt.ts        # JWT configuration
│   │   └── upload.ts     # File upload settings
│   ├── controllers/      # Request handlers
│   │   ├── auth.ts       # Authentication logic
│   │   ├── posts.ts      # Post management
│   │   ├── users.ts      # User management
│   │   └── ...           # Other controllers
│   ├── middlewares/      # Express middlewares
│   │   ├── auth.ts       # Authentication middleware
│   │   ├── validation.ts # Request validation
│   │   └── upload.ts     # File upload middleware
│   ├── models/           # Database models/schemas
│   ├── routes/           # API route definitions
│   │   ├── auth.ts       # Authentication routes
│   │   ├── posts.ts      # Post routes
│   │   ├── users.ts      # User routes
│   │   └── index.ts      # Route aggregation
│   ├── services/         # Business logic layer
│   │   ├── auth.service.ts
│   │   ├── post.service.ts
│   │   └── user.service.ts
│   ├── socketio/         # WebSocket handlers
│   │   ├── events/       # Socket event handlers
│   │   └── middleware.ts # Socket middleware
│   ├── utils/            # Utility functions
│   │   ├── helpers.ts    # General helpers
│   │   ├── logger.ts     # Logging utility
│   │   └── validation.ts # Validation schemas
│   ├── types/            # TypeScript type definitions
│   ├── scripts/          # Database and utility scripts
│   │   ├── migrations/   # Database migrations
│   │   ├── setupDatabase.ts
│   │   └── db-schema.sql
│   └── app.ts            # Express application setup
├── tests/                # Test files
│   ├── integration/      # Integration tests
│   ├── unit/            # Unit tests
│   └── setup.ts         # Test configuration
├── docs/                 # Documentation
├── logs/                 # Application logs
├── coverage/             # Test coverage reports
├── dist/                 # Compiled JavaScript (build output)
├── public/               # Static files
├── .env.example          # Environment variables template
├── package.json          # Project dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── vercel.json           # Vercel deployment config
└── README.md             # Project documentation
```

## 🔧 Development

### Available Scripts

```bash
# Development
npm run dev              # Start development server with hot reload
npm run build            # Build for production
npm start               # Start production server

# Testing
npm test                # Run all tests
npm run test:unit       # Run unit tests only
npm run test:integration # Run integration tests only
npm run test:coverage   # Generate test coverage report

# Code Quality
npm run lint            # Run ESLint
npm run lint:fix        # Fix linting issues automatically
npm run type-check      # TypeScript type checking

# Database
npm run seed            # Seed database with sample data
npm run migrate:privacy-settings # Run privacy settings migration
```

### Development Workflow

1. **Start the development server**: `npm run dev`
2. **Make your changes** in the `src/` directory
3. **Write tests** for new features in `tests/`
4. **Run tests**: `npm test`
5. **Check code quality**: `npm run lint`
6. **Build for production**: `npm run build`

## 📚 API Documentation

### Base URL

```
Development: http://localhost:5000/api
Production: https://your-domain.com/api
```

### Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

### Key Endpoints

#### Authentication

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

#### Users

- `GET /api/users` - Get all users (paginated)
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user profile
- `DELETE /api/users/:id` - Delete user account

#### Posts

- `GET /api/posts` - Get all posts (paginated)
- `POST /api/posts` - Create new post
- `GET /api/posts/:id` - Get post by ID
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post

#### Comments

- `GET /api/posts/:postId/comments` - Get post comments
- `POST /api/posts/:postId/comments` - Add comment
- `PUT /api/comments/:id` - Update comment
- `DELETE /api/comments/:id` - Delete comment

For complete API documentation, visit `/api-docs` when running the server.

## 🧪 Testing

This project uses both Jest and Mocha for comprehensive testing:

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run specific test file
npm test -- tests/unit/auth.test.ts
```

### Test Structure

- **Unit Tests**: Test individual functions and modules
- **Integration Tests**: Test API endpoints and database interactions
- **Coverage**: Aim for >80% test coverage

## 🚢 Deployment

### Vercel Deployment

This project is configured for easy deployment on Vercel:

1. **Connect your repository** to Vercel
2. **Set environment variables** in Vercel dashboard
3. **Deploy**: Vercel will automatically build and deploy

### Manual Deployment

```bash
# Build the project
npm run build

# Start production server
npm start
```

### Environment Variables for Production

Make sure to set all required environment variables in your production environment:

- Database credentials
- JWT secrets
- Stripe keys
- CORS origins
- File storage configuration

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt for secure password storage
- **Input Validation**: Comprehensive request validation
- **CORS Protection**: Configurable cross-origin resource sharing
- **Helmet**: Security headers middleware
- **Rate Limiting**: API rate limiting (planned)
- **File Upload Security**: File type and size validation

## 🚦 Health Monitoring

- **Logging**: Winston-based structured logging
- **Error Handling**: Centralized error handling middleware
- **Health Checks**: `/health` endpoint for monitoring
- **Performance**: Response time tracking

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Process

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** and add tests
4. **Run tests**: `npm test`
5. **Lint your code**: `npm run lint`
6. **Commit your changes**: `git commit -m 'Add amazing feature'`
7. **Push to the branch**: `git push origin feature/amazing-feature`
8. **Open a Pull Request**

### Code Style

- Use TypeScript for all new code
- Follow the existing code style
- Write tests for new features
- Update documentation as needed

## 📄 License

This project is licensed under the MIT License

## 🆘 Support

- **Documentation**: Check the `/docs` directory
- **Issues**: [GitHub Issues](https://github.com/fathe4/social-platform-backend/issues)
- **Discussions**: [GitHub Discussions](https://github.com/fathe4/social-platform-backend/discussions)

## 🗺️ Roadmap

- [ ] Enhanced real-time features
- [ ] Advanced content moderation
- [ ] Mobile push notifications
- [ ] Analytics dashboard
- [ ] Third-party integrations
- [ ] Multi-language support
- [ ] Advanced search functionality

---
