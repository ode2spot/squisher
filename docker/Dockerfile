FROM node:22-bookworm-slim

# Toolchain for the extension build: node (esbuild, tsc, eslint, prettier,
# node:test) is in the base image; zip is needed for `make package`.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    make \
    zip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

CMD ["/bin/bash"]
