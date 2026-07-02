# Contributing to Solidus

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

## Getting Started

1. Clone the package (duh).
    ```bash
    git clone https://github.com/Alan-J-Bibins/solidus-p2p
    ```
2. Install dependencies.
    ```bash
    cd solidus-p2p
    vp install
    ```
3. Don't forget to `cd` into the library you are working on
    ```bash
    cd packages/core/
    ```

> [!NOTE]
> `packages/core` is where `@solidus-p2p/core` will be developed, this is the core package. The above monorepo structure was taken so that if and when we make other subpackages like `@solidus-p2p/react` or `@solidus-p2p/storage`, we will not have to create another git repo

## Running tests

Vite+ uses vitest under the hood for testing.

```bash
vp test
```

## Branching and commits

We will have a `main` and `dev` branch by default.

**Rule:** Only branch and merge into the `dev` branch. `main` is reserved for managing stable versions. _DO NOT MERGE INTO `main`_

```bash
git switch -c dev
git checkout -b <new-branch>
```

**Branch naming:** Please make sure to have a name that reflects whatever you are working on. For eg:

- `feat/feature-name`
- `fix/bug-name`

**Commit messages:** Ensure your commit messages look like this:

- `feat(core): feature-name`
- `fix(demo-website): some-fix`

## Pull Requests

After you are done with developing a feature, open a pull request by navigating to the repo page on github.

Before you open a pull request, please ensure your branch meets the following criteria:

1. **Builds successfully**: Running `vp build` should not produce any errors.
2. **Tests pass**: All existing and new tests must pass successfully.
3. **Single-purpose**: Keep PRs focused. If you are fixing a bug and adding a massive feature, split them into two separate PRs.

## Code Styling

Since the repo is using vite+ we are using oxfmt. Pre-commit hooks have been setup so everytime you make a commit, oxfmt will kick in and format the codebase according to the configuration given in `vite.config.ts` at the repo root.

If you wish to manually format then run:

```bash
vp fmt
```
