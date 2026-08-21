.PHONY: build shell check-container deps dev ext lint fmt test package clean

COMPOSE := docker compose -f docker/docker-compose.yml

# ---------------------------------------------------------------------------
# HOST SIDE — container management only. Everything else runs inside the
# container: `make shell` in, or ./scripts/run-in-docker.sh make <target>.
# ---------------------------------------------------------------------------

# Build the dev container image
build:
	$(COMPOSE) build

# Drop into the container
shell:
	$(COMPOSE) run --rm dev

# ---------------------------------------------------------------------------
# CONTAINER SIDE
# ---------------------------------------------------------------------------

# Guard for container-only targets
check-container:
ifndef IN_SQUISHER_CONTAINER
	$(error This target must run inside the devcontainer. Use: ./scripts/run-in-docker.sh make $(MAKECMDGOALS))
endif

node_modules/.deps-stamp: package.json $(wildcard package-lock.json)
	npm ci
	touch $@

deps: check-container node_modules/.deps-stamp

# esbuild in watch mode, rebuilding dist/extension/ on change
dev: deps
	node scripts/build.mjs --watch

# One-shot production build to dist/extension/
ext: deps
	node scripts/build.mjs

lint: deps
	npx tsc --noEmit
	npx eslint .
	npx prettier --check .

fmt: deps
	npx prettier --write .

test: deps
	node --import tsx --test test/*.test.ts

# Produce dist/squisher-<version>.zip for store upload (version from manifest)
package: ext
	@VERSION=$$(node -p "require('./src/manifest.json').version"); \
	rm -f "dist/squisher-$$VERSION.zip"; \
	cd dist/extension && zip -r "../squisher-$$VERSION.zip" .; \
	echo "Packaged dist/squisher-$$VERSION.zip"

clean: check-container
	rm -rf dist node_modules/.deps-stamp
