.PHONY: dev compile watch build build-win clean install version lint format fix

dev: compile  ## Compile, start app, and auto-recompile on changes (default)
	@trap 'kill %1 2>/dev/null' EXIT; \
	npx tsc --watch --preserveWatchOutput & \
	npx electron .

compile:  ## One-shot compile TypeScript + copy assets to dist/
	@npx tsc || true
	@cp src/index.html src/styles.css dist/

watch:  ## Auto-recompile only (no app start, for a separate terminal)
	npx tsc --watch

build: compile  ## Build macOS release
	npx electron-builder --mac

build-win: compile  ## Build Windows release
	npx electron-builder --win

clean:  ## Remove compiled output and build artifacts
	rm -rf dist/ release/

install:  ## Install dependencies
	npm install

version:  ## Show current version
	@node -p "require('./package.json').version"

lint:  ## Check formatting and lint rules (no changes)
	npx biome check src/

format:  ## Auto-format all source files
	npx biome format --write src/

fix:  ## Auto-fix lint issues and format
	npx biome check --fix src/

.DEFAULT_GOAL := dev
