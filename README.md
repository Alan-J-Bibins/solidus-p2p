# Solidus - A library for simplifying development on data-heavy collaborative peer-to-peer platforms

## Repo Structure

This is a monorepo made using [vite-plus](https://viteplus.dev/)

```bash
solidus-p2p
├── apps                     # Demo of the application goes here
│   └── website
├── node_modules
├── package.json
├── package-lock.json
├── packages                 # All libraries developed for the project go here
│   └── core                 # Core package repo
│       ├── node_modules
│       ├── package.json
│       ├── README.md
│       ├── src
│       │   └── index.ts
│       ├── tests
│       │   └── index.test.ts
│       ├── tsconfig.json
│       └── vite.config.ts
├── README.md
├── tsconfig.json
└── vite.config.ts
```
