# The code runner: go-judge (REST sandbox, cgroup v2) on Debian with the toolchains of
# apps/server/crates/clients/src/gojudge/languages.rs. A language added there is installed here, and
# `ashyq admin runner-check` runs hello world in every allowed one against this image.
FROM docker.io/criyle/go-judge:v1.13.3 AS gojudge

FROM docker.io/library/debian:trixie-20261027-slim AS fetch
ARG KOTLIN_VERSION=2.4.21
ARG KOTLIN_SHA256=7cc140e76daf416a0424a5557f99afd7ca89ebd463ea1101261e3e01c33e75cd
ARG TYPESCRIPT_VERSION=5.9.3
ARG TYPESCRIPT_SHA256=10e108c9cf7d5f2879053dff18515fb405abf2ccef63eaaf017d9c571687a1d3
# Node's own typings, so `require`, `process` and `fs` type-check (match the image's Node major).
ARG TYPES_NODE_VERSION=20.19.43
ARG TYPES_NODE_SHA256=9963f2cb96d2b26dbf9cf86262c698815cbec9503af73c7ce75209d1d0658f3d
ARG UNDICI_TYPES_VERSION=6.21.0
ARG UNDICI_TYPES_SHA256=cfa1a9a5e18988850e548f4f6b629c58da32dc32bebb116e58ea301e516fd16d
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /fetch
RUN curl -fsSLo kotlin.zip "https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VERSION}/kotlin-compiler-${KOTLIN_VERSION}.zip" \
    && echo "${KOTLIN_SHA256}  kotlin.zip" | sha256sum -c - \
    && unzip -q kotlin.zip && mv kotlinc kotlin \
    && curl -fsSLo typescript.tgz "https://registry.npmjs.org/typescript/-/typescript-${TYPESCRIPT_VERSION}.tgz" \
    && echo "${TYPESCRIPT_SHA256}  typescript.tgz" | sha256sum -c - \
    && tar xzf typescript.tgz && mv package typescript \
    && curl -fsSLo types-node.tgz "https://registry.npmjs.org/@types/node/-/node-${TYPES_NODE_VERSION}.tgz" \
    && echo "${TYPES_NODE_SHA256}  types-node.tgz" | sha256sum -c - \
    && mkdir -p node_modules/@types && tar xzf types-node.tgz && mv "node v20.19" node_modules/@types/node \
    && curl -fsSLo undici-types.tgz "https://registry.npmjs.org/undici-types/-/undici-types-${UNDICI_TYPES_VERSION}.tgz" \
    && echo "${UNDICI_TYPES_SHA256}  undici-types.tgz" | sha256sum -c - \
    && tar xzf undici-types.tgz && mv package node_modules/undici-types

FROM docker.io/library/debian:trixie-20261027-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc g++ libc6-dev \
        python3 \
        openjdk-21-jdk-headless \
        nodejs \
        golang-go \
        rustc \
        php-cli \
        ruby \
    && rm -rf /var/lib/apt/lists/*
COPY --from=fetch /fetch/kotlin /usr/local/kotlin
COPY --from=fetch /fetch/typescript /usr/local/lib/typescript
COPY --from=fetch /fetch/node_modules /usr/local/lib/node_modules
COPY --from=gojudge /opt/go-judge /opt/go-judge
COPY mount.yaml /opt/mount.yaml
# Warm caches, read-only in every run: Go's standard library (a cold build spends seconds of CPU on it)
# and a precompiled <bits/stdc++.h> for the C++ flags of languages.rs (2.7 s -> well under 1 s).
RUN mkdir -p /usr/local/go-cache && GOCACHE=/usr/local/go-cache GOFLAGS=-trimpath go build std \
    && chmod -R a+rX /usr/local/go-cache \
    && header=$(echo '#include <bits/stdc++.h>' | g++ -std=gnu++20 -x c++ -H -fsyntax-only - 2>&1 | grep -m1 'bits/stdc++.h$' | sed 's/^[.]* //') \
    && g++ -O2 -std=gnu++20 -pipe -x c++-header "$header" -o "$header.gch"
WORKDIR /opt
ENV ES_MOUNT_CONF=/opt/mount.yaml \
    ES_NO_FALLBACK=true \
    ES_FILE_TIMEOUT=10m
EXPOSE 5050
ENTRYPOINT ["/opt/go-judge"]
