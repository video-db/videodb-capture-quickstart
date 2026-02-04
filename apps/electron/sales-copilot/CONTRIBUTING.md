# Contributing

## Getting Started

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/video-db/videodb-capture-quickstart.git
   cd videodb-capture-quickstart/apps/electron/sales-copilot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the app:
   ```bash
   npm start
   ```

## Project Structure

- `frontend/` - Electron app (main process, renderer, UI modules)
- `server/` - FastAPI backend (auth, webhooks, VideoDB integration)
- `scripts/` - Setup and startup scripts

## Submitting Changes

1. Create a branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Open a Pull Request against `main`

## Reporting Issues

Open an issue at [github.com/video-db/videodb-capture-quickstart/issues](https://github.com/video-db/videodb-capture-quickstart/issues)

## License

MIT
