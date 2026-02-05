.PHONY: help
help:
	@cat $(MAKEFILE_LIST) | grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

.PHONY: install
install: ## Install dependencies
	npm install

.PHONY: dev
dev: ## Run app in development mode
	npm start

.PHONY: build
build: ## Build app for current platform
	npm run build

.PHONY: build-mac
build-mac: ## Build macOS .zip distribution
	npm run build

.PHONY: build-win
build-win: ## Build Windows portable .zip
	npm run build:win

.PHONY: build-all
build-all: ## Build for both macOS and Windows
	npm run build:all

.PHONY: publish
publish: ## Build and publish to GitHub releases (requires GH_TOKEN)
	@echo "Publishing version $$(node -p "require('./package.json').version")..."
	@if [ -z "$$GH_TOKEN" ]; then \
		echo "❌ Error: GH_TOKEN environment variable not set"; \
		echo "Set it with: export GH_TOKEN=your_github_token"; \
		exit 1; \
	fi
	npm run build -- --publish always

.PHONY: publish-mac
publish-mac: ## Build and publish macOS only
	@if [ -z "$$GH_TOKEN" ]; then \
		echo "❌ Error: GH_TOKEN environment variable not set"; \
		exit 1; \
	fi
	npm run build -- --mac --publish always

.PHONY: publish-win
publish-win: ## Build and publish Windows only
	@if [ -z "$$GH_TOKEN" ]; then \
		echo "❌ Error: GH_TOKEN environment variable not set"; \
		exit 1; \
	fi
	npm run build:win -- --publish always

.PHONY: test-build
test-build: ## Build without publishing (test release process)
	npm run build -- --publish never

.PHONY: version
version: ## Show current version
	@node -p "require('./package.json').version"

.PHONY: bump-patch
bump-patch: ## Bump patch version (1.0.0 -> 1.0.1)
	npm version patch --no-git-tag-version
	@echo "Version bumped to $$(node -p "require('./package.json').version")"

.PHONY: bump-minor
bump-minor: ## Bump minor version (1.0.0 -> 1.1.0)
	npm version minor --no-git-tag-version
	@echo "Version bumped to $$(node -p "require('./package.json').version")"

.PHONY: bump-major
bump-major: ## Bump major version (1.0.0 -> 2.0.0)
	npm version major --no-git-tag-version
	@echo "Version bumped to $$(node -p "require('./package.json').version")"

.PHONY: release-patch
release-patch: bump-patch commit-version publish ## Bump patch version, commit, and publish
	@echo "✅ Patch release complete!"

.PHONY: release-minor
release-minor: bump-minor commit-version publish ## Bump minor version, commit, and publish
	@echo "✅ Minor release complete!"

.PHONY: release-major
release-major: bump-major commit-version publish ## Bump major version, commit, and publish
	@echo "✅ Major release complete!"

.PHONY: commit-version
commit-version: ## Commit version bump (internal helper)
	@VERSION=$$(node -p "require('./package.json').version"); \
	git add package.json package-lock.json; \
	git commit -m "Bump version to $$VERSION"; \
	echo "✅ Committed version $$VERSION"

.PHONY: clean
clean: ## Remove build artifacts
	rm -rf dist/
	rm -rf node_modules/.cache/
	@echo "✅ Cleaned build artifacts"

.PHONY: clean-all
clean-all: clean ## Remove all generated files including node_modules
	rm -rf node_modules/
	@echo "✅ Removed node_modules"

.PHONY: check-token
check-token: ## Verify GH_TOKEN is set and valid
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

.PHONY: docs
docs: ## Open documentation in browser
	@echo "📚 Opening documentation..."
	@open docs/CRITICAL-BUSINESS-RULES.md || echo "Run 'open docs/' to browse documentation"

.PHONY: dist-info
dist-info: ## Show info about built packages
	@if [ -d "dist" ]; then \
		echo "Built packages:"; \
		ls -lh dist/*.dmg dist/*.exe 2>/dev/null || echo "No packages found in dist/"; \
	else \
		echo "No dist/ directory found. Run 'make build' first."; \
	fi

.PHONY: git-status
git-status: ## Check git status before release
	@echo "Git status:"; \
	if [ -z "$$(git status --porcelain)" ]; then \
		echo "✅ Working directory clean"; \
	else \
		echo "⚠️  Uncommitted changes:"; \
		git status --short; \
	fi

.PHONY: pre-release
pre-release: git-status check-token ## Pre-release checks (git status, token validity)
	@echo "✅ Ready to release!"

.PHONY: show-releases
show-releases: ## Show GitHub releases for this repo
	@REPO=$$(node -p "require('./package.json').build.publish.owner + '/' + require('./package.json').build.publish.repo"); \
	echo "Releases for $$REPO:"; \
	curl -s "https://api.github.com/repos/$$REPO/releases" | grep -E '"tag_name"|"name"|"published_at"' | head -30

.DEFAULT_GOAL := help
