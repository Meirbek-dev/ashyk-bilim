# Ashyq Bilim

## Ashyq Bilim is a platform that makes it easy for anyone to provide world-class educational content and it offers a variety of content types : Dynamic Pages, Videos, Documents & more.

## Progress

🚧 Ashyq Bilim is still in development (beta), as we reach stability we will release a stable
version and add more features.

## Roadmap

We prioritize issues depending on the most requested features from our users, please help us
prioritize issues by commenting on them and sharing your thoughts

[🚢 LearnHouse General Roadmap](https://www.learnhouse.app/roadmap)

[👨‍💻 Detailed Roadmap](https://github.com/orgs/learnhouse/projects/4)

## Overview

- 📄✨Dynamic notion-like Blocks-based Courses & editor
- 🏎️ Easy to use
- 👥 Multi-Organization
- 📹 Supports Uploadable Videos and external videos like YouTube
- 📄 Supports documents like PDF
- 👨‍🎓 Users & Groups Management
- 🙋 Quizzes
- 🍱 Course Collections
- 👟 Course Progress
- 🛜 Course Updates
- 💬 Discussions
- ✨ Ashyq Bilim AI : The Teachers and Students copilot
- 👪 Multiplayer Course edition
- More to come

## Contributing

Here is how you can help :

- [Getting Started](/CONTRIBUTING.md)
- [Developers Quick start](https://docs.learnhouse.app/setup-dev-environment)
- [Submit a bug report](https://github.com/learnhouse/learnhouse/issues/new?assignees=&labels=bug%2Ctriage&projects=&template=bug.yml&title=%5BBug%5D%3A+)
- [Check good first issues & Help Wanted](https://github.com/learnhouse/learnhouse/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22+label%3A%22help+wanted%22)
- Spread the word and share the project with your friends

## Documentation

- [Overview](https://docs.learnhouse.app)
- [Developers](https://docs.learnhouse.app/setup-dev-environment)

## Get started

### Get a local ready copy of LearnHouse

TLDR: Run `docker-compose up -d` and inspect the logs, should be ready to go in less than 2 mins

```bash
# Start core stack
docker-compose --profile core up -d

# Start with code execution tier
docker-compose --profile core --profile code-runner up -d

# Production (with resource limits)
docker-compose -f docker-compose.yml -f compose.prod.yml --profile core up -d
```

### Deployment environment

For Docker deployments, keep the live application configuration in `extra/.env`.

- Start from `extra/example-conf.env` and copy it to `extra/.env`.
- The `app` service reads backend runtime configuration from process environment variables only.
- `apps/api/config/config.yaml` is reference-only and is not loaded at runtime.
- `apps/api/.env.example` and `apps/web/.env.example` are local development examples, not deployment
  sources.
- When building with `docker-compose`, pass public web build variables with `--env-file extra/.env`
  or exported shell variables because `env_file` does not populate Docker build args.

- [Self Hosting](https://docs.learnhouse.app/self-hosting/hosting-guide)

### Set-up a Development Environment

- [Detailed Guide](https://docs.learnhouse.app/setup-dev-environment)

## Tech

Ashyq Bilim uses a number of open source projects to work properly:

- **Next.js** (16 with the App Directory) - The React Framework
- **TailwindCSS** - Styling
- **Base UI** - Modern accessible UI Components
- **Tiptap** - An editor framework and headless wrapper around ProseMirror
- **FastAPI** - A high performance, async API framework for Python
- **PostgreSQL** - SQL Database
- **Redis** - In-Memory Database
- **React** - duh
