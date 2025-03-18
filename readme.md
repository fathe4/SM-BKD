# Social Media Platform

A modern social media platform built with Express, TypeScript, and Supabase.

## Features

- User authentication and profiles
- Posts, comments, and reactions
- Friendships and connections
- Messaging system
- Groups and pages
- Stories
- Marketplace and subscriptions
- And more...

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Supabase account and project

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/social-platform.git
cd social-platform
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Set up environment variables:
```bash
cp .env.example .env
```
Then edit the `.env` file with your Supabase credentials and other configuration.

4. Build the project:
```bash
npm run build
# or
yarn build
```

5. Start the development server:
```bash
npm run dev
# or
yarn dev
```

## Project Structure

```
social-platform/
├── src/
│   ├── config/           # Configuration files
│   ├── controllers/      # Request handlers
│   ├── middlewares/      # Express middlewares
│   ├── models/           # Database models
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   ├── utils/            # Utility functions
│   ├── types/            # TypeScript type definitions
│   └── app.ts            # Express application setup
├── public/               # Static files
├── scripts/              # Build/deployment scripts
├── tests/                # Test files
├── .env.example          # Environment variables example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Development

### Running Tests

```bash
npm test
# or
yarn test
```

### Linting

```bash
npm run lint
# or
yarn lint
```

### Building for Production

```bash
npm run build
# or
yarn build
```

## API Documentation

API documentation will be available at `/api-docs` when running the server.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
