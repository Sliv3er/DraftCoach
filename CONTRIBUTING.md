# Contributing to DraftCoach

Thank you for your interest in contributing to DraftCoach! 🎮

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/DraftCoach.git`
3. Create a feature branch: `git checkout -b feature/your-feature`
4. Make your changes
5. Commit with a descriptive message: `git commit -m "feat: add your feature"`
6. Push: `git push origin feature/your-feature`
7. Open a Pull Request

## Development Setup

```bash
cd apps/backend && npm install && cd ../..
cd apps/desktop && npm install && cd ../..

# Terminal 1: Backend
cd apps/backend && npm run dev

# Terminal 2: Desktop
cd apps/desktop && npm run dev
```

## Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Add JSDoc comments for public functions
- Write meaningful commit messages using [Conventional Commits](https://www.conventionalcommits.org/)

## Reporting Issues

- Use the GitHub Issues tab
- Include steps to reproduce the bug
- Include your OS, Node.js version, and League patch version

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
