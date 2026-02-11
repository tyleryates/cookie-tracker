.PHONY: help dev compile watch build build-win build-all clean install version lint format knip typecheck test \
       publish publish-mac publish-win test-build \
       bump-patch bump-minor bump-major release-patch release-minor release-major commit-version \
       check-token pre-release show-releases dist-info git-status

# === Development ===

dev: compile  ## Compile, start app, and auto-recompile on changes
	@trap 'kill %1 2>/dev/null' EXIT; \
	npx tsup --watch & \
	sleep 2 && npx electron .

compile:  ## One-shot compile (tsup bundles main + renderer, copies assets)
	@npx tsup

typecheck:  ## Type-check without emitting (uses tsc)
	npx tsc --noEmit

watch:  ## Auto-recompile only (no app start, for a separate terminal)
	npx tsup --watch

test:  ## Run unit tests
	npx vitest run

install:  ## Install dependencies
	npm install

version:  ## Show current version
	@node -p "require('./package.json').version"

lint:  ## Check formatting and lint rules (no changes)
	npx biome check src/

format:  ## Auto-format, organize imports, and fix lint issues
	npx biome check --write src/

knip:  ## Find unused files, exports, and dependencies
	pnpm knip

# === Building ===

build: compile  ## Build macOS release
	npx electron-builder --mac

build-win: compile  ## Build Windows release
	npx electron-builder --win

build-all: compile  ## Build for both macOS and Windows
	npx electron-builder --mac --win

# === Publishing ===

publish:  ## Build and publish to GitHub releases (requires GH_TOKEN)
	@echo "Publishing version $$(node -p "require('./package.json').version")..."
	@if [ -z "$$GH_TOKEN" ]; then \
		echo "❌ Error: GH_TOKEN environment variable not set"; \
		echo "Set it with: export GH_TOKEN=your_github_token"; \
		exit 1; \
	fi
	npm run build -- --publish always

publish-mac:  ## Build and publish macOS only
	@if [ -z "$$GH_TOKEN" ]; then \
		echo "❌ Error: GH_TOKEN environment variable not set"; \
		exit 1; \
	fi
	npm run build -- --mac --publish always

publish-win:  ## Build and publish Windows only
	@if [ -z "$$GH_TOKEN" ]; then \
		echo "❌ Error: GH_TOKEN environment variable not set"; \
		exit 1; \
	fi
	npm run build:win -- --publish always

test-build:  ## Build without publishing (test release process)
	npm run build -- --publish never

# === Versioning & Release ===

bump-patch:  ## Bump patch version (1.0.0 -> 1.0.1)
	npm version patch --no-git-tag-version
	@echo "Version bumped to $$(node -p "require('./package.json').version")"

bump-minor:  ## Bump minor version (1.0.0 -> 1.1.0)
	npm version minor --no-git-tag-version
	@echo "Version bumped to $$(node -p "require('./package.json').version")"

bump-major:  ## Bump major version (1.0.0 -> 2.0.0)
	npm version major --no-git-tag-version
	@echo "Version bumped to $$(node -p "require('./package.json').version")"

release-patch: bump-patch commit-version publish  ## Bump patch, commit, and publish
	@echo "✅ Patch release complete!"

release-minor: bump-minor commit-version publish  ## Bump minor, commit, and publish
	@echo "✅ Minor release complete!"

release-major: bump-major commit-version publish  ## Bump major, commit, and publish
	@echo "✅ Major release complete!"

commit-version:  ## Commit version bump (internal helper)
	@VERSION=$$(node -p "require('./package.json').version"); \
	git add package.json package-lock.json; \
	git commit -m "Bump version to $$VERSION"; \
	echo "✅ Committed version $$VERSION"

# === Release Checks ===

check-token:  ## Verify GH_TOKEN is set and valid
	@if [ -z "$$GH_TOKEN" ]; then \
		echo "❌ GH_TOKEN not set"; \
		exit 1; \
	fi
	@echo "Checking GitHub token..."; \
	if curl -s -H "Authorization: token $$GH_TOKEN" https://api.github.com/user | grep -q "login"; then \
		echo "✅ GH_TOKEN is valid"; \
		curl -s -H "Authorization: token $$GH_TOKEN" https://api.github.com/user | grep "login" | cut -d'"' -f4 | xargs -I {} echo "   Authenticated as: {}"; \
	else \
		echo "❌ GH_TOKEN is invalid"; \
		exit 1; \
	fi

pre-release: git-status check-token  ## Pre-release checks (git status, token validity)
	@echo "✅ Ready to release!"

git-status:  ## Check git status before release
	@echo "Git status:"; \
	if [ -z "$$(git status --porcelain)" ]; then \
		echo "✅ Working directory clean"; \
	else \
		echo "⚠️  Uncommitted changes:"; \
		git status --short; \
	fi

show-releases:  ## Show GitHub releases for this repo
	@REPO=$$(node -p "require('./package.json').build.publish.owner + '/' + require('./package.json').build.publish.repo"); \
	echo "Releases for $$REPO:"; \
	curl -s "https://api.github.com/repos/$$REPO/releases" | grep -E '"tag_name"|"name"|"published_at"' | head -30

dist-info:  ## Show info about built packages
	@if [ -d "dist" ]; then \
		echo "Built packages:"; \
		ls -lh dist/*.dmg dist/*.exe 2>/dev/null || echo "No packages found in dist/"; \
	else \
		echo "No dist/ directory found. Run 'make build' first."; \
	fi

# === Cleanup ===

clean:  ## Remove compiled output and build artifacts
	rm -rf dist/ release/

# === Help ===

help:  ## Show available commands
	@cat $(MAKEFILE_LIST) | grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
