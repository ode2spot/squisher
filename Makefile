.PHONY: build shell check-container deps dev ext lint fmt test package clean deploy

COMPOSE := docker compose -f docker/docker-compose.yml

# Machine-local settings (DEPLOY_HOST etc.) live in a git-ignored .env.
-include .env
DEPLOY_DIR ?= ~/extensions

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

# Copy the built extension to another machine (host side: uses your ssh
# keys/password). Load $(DEPLOY_DIR)/squisher unpacked in Edge there.
deploy:
	@[ -n "$(DEPLOY_HOST)" ] || { \
	  echo "DEPLOY_HOST is not set. Put DEPLOY_HOST=user@host in .env"; \
	  echo "or run: make deploy DEPLOY_HOST=user@host"; \
	  exit 1; }
	@[ -d dist/extension ] || { \
	  echo "No build at dist/extension — run ./scripts/run-in-docker.sh make ext first."; \
	  exit 1; }
	rsync -a --delete --rsync-path="mkdir -p $(DEPLOY_DIR) && rsync" \
	  dist/extension/ "$(DEPLOY_HOST):$(DEPLOY_DIR)/squisher/"
	@echo "Deployed to $(DEPLOY_HOST):$(DEPLOY_DIR)/squisher"

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
