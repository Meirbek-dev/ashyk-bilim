# The code runner: go-judge (REST sandbox, cgroup v2) on Debian with the toolchains of
# apps/server/crates/clients/src/gojudge/languages.rs. A language added there is installed here, and
# `ashyq admin runner-check` runs hello world in every allowed one against this image.

FROM golang:1.27.4-trixie AS native-tools
# Rebuild native tools with the patched Go toolchain and explicit security dependency pins.
ADD --checksum=sha256:e1c4e775a74f5196e1b94464d12b6b8464e73adc39a824be31d53c27d3ec7249 https://codeload.github.com/criyle/go-judge/tar.gz/refs/tags/v1.14.1 /tmp/go-judge.tgz
ADD --checksum=sha256:5ccb47dbb3f68cd0da58b71e6f445eee36a50bd3e9f9f330cc23a97b88500119 https://codeload.github.com/microsoft/typescript-go/tar.gz/2bd066d87f5bafd315be9f40889d0a60b9e58e0b /tmp/typescript.tgz
RUN mkdir /judge /typescript /out && tar xzf /tmp/go-judge.tgz -C /judge --strip-components=1 \
    && tar xzf /tmp/typescript.tgz -C /typescript --strip-components=1
WORKDIR /judge
RUN go get golang.org/x/net@v0.63.0 golang.org/x/sys@v0.50.0 golang.org/x/text@v0.44.0 \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/go-judge ./cmd/go-judge
WORKDIR /typescript
RUN go get golang.org/x/net@v0.63.0 golang.org/x/text@v0.44.0 \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/tsc ./cmd/tsgo

FROM docker.io/library/debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2 AS fetch
ARG KOTLIN_VERSION=2.4.21
ARG KOTLIN_SHA256=7cc140e76daf416a0424a5557f99afd7ca89ebd463ea1101261e3e01c33e75cd
ARG TYPESCRIPT_VERSION=7.0.2
ARG TYPESCRIPT_SHA256=da2513f4b95176d6dde8b51aab7afe8a927656c9d277369793f77f7e59371c08
# Node's own typings, so `require`, `process` and `fs` type-check (match the image's Node major).
ARG TYPES_NODE_VERSION=20.19.43
ARG TYPES_NODE_SHA256=9963f2cb96d2b26dbf9cf86262c698815cbec9503af73c7ce75209d1d0658f3d
ARG UNDICI_TYPES_VERSION=6.21.0
ARG UNDICI_TYPES_SHA256=cfa1a9a5e18988850e548f4f6b629c58da32dc32bebb116e58ea301e516fd16d
RUN apt-get update && apt-get upgrade -y --no-install-recommends && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /fetch
# Official compiler archives are digest checked; native executables are rebuilt above.
ARG TARGETARCH
COPY --from=native-tools /out/go-judge /fetch/go-judge
RUN curl -fsSLo kotlin.zip "https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VERSION}/kotlin-compiler-${KOTLIN_VERSION}.zip" \
    && echo "${KOTLIN_SHA256}  kotlin.zip" | sha256sum -c - \
    && unzip -q kotlin.zip && mv kotlinc kotlin && rm -f kotlin/lib/kotlin-main-kts.jar \
    && curl -fsSLo typescript.tgz "https://registry.npmjs.org/typescript/-/typescript-${TYPESCRIPT_VERSION}.tgz" \
    && echo "${TYPESCRIPT_SHA256}  typescript.tgz" | sha256sum -c - \
    && tar xzf typescript.tgz && mv package typescript \
    && case "$TARGETARCH" in \
         amd64) ts_arch=x64; ts_sha=7ecad6f67377e831856367ab062ef394f21506a611405bf8ac0ff039348637d3;; \
         arm64) ts_arch=arm64; ts_sha=c83d931ac9dd7549cde6e71246aa9d6a9812843023df3e277fe3b5dcf41dd0ea;; \
       esac \
    && curl -fsSLo typescript-native.tgz "https://registry.npmjs.org/@typescript/typescript-linux-${ts_arch}/-/typescript-linux-${ts_arch}-${TYPESCRIPT_VERSION}.tgz" \
    && echo "$ts_sha  typescript-native.tgz" | sha256sum -c - \
    && mkdir -p node_modules/@typescript && tar xzf typescript-native.tgz \
    && mv package "node_modules/@typescript/typescript-linux-${ts_arch}" \
    && curl -fsSLo types-node.tgz "https://registry.npmjs.org/@types/node/-/node-${TYPES_NODE_VERSION}.tgz" \
    && echo "${TYPES_NODE_SHA256}  types-node.tgz" | sha256sum -c - \
    && mkdir -p node_modules/@types && tar xzf types-node.tgz && mv "node v20.19" node_modules/@types/node \
    && curl -fsSLo undici-types.tgz "https://registry.npmjs.org/undici-types/-/undici-types-${UNDICI_TYPES_VERSION}.tgz" \
    && echo "${UNDICI_TYPES_SHA256}  undici-types.tgz" | sha256sum -c - \
    && tar xzf undici-types.tgz && mv package node_modules/undici-types

COPY --from=native-tools /out/tsc /fetch/tsc
RUN find /fetch/node_modules/@typescript -path "*/lib/tsc" -type f -exec cp /fetch/tsc {} \;

FROM docker.io/library/debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2 AS runtime
RUN apt-get update && apt-get upgrade -y --no-install-recommends && apt-get install -y --no-install-recommends \
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
COPY --from=fetch /fetch/go-judge /opt/go-judge
COPY mount.yaml /opt/mount.yaml
# Warm caches, read-only in every run: Go's standard library (a cold build spends seconds of CPU on it)
# and a precompiled <bits/stdc++.h> for the C++ flags of languages.rs (2.7 s -> well under 1 s).
# Go trims its cache a day after the stamp in trim.txt and fails the build when it cannot rewrite it (the
# cache is read-only): the stamp points into the run's fresh /tmp, so each run re-stamps it there (a walk of
# the cache that removes nothing) and an image older than a day still compiles Go.
RUN mkdir -p /usr/local/go-cache && GOCACHE=/usr/local/go-cache GOFLAGS=-trimpath go build std \
    && chmod -R a+rX /usr/local/go-cache \
    && ln -sf /tmp/go-cache-trim.txt /usr/local/go-cache/trim.txt \
    && header=$(echo '#include <bits/stdc++.h>' | g++ -std=gnu++20 -x c++ -H -fsyntax-only - 2>&1 | grep -m1 'bits/stdc++.h$' | sed 's/^[.]* //') \
    && g++ -O2 -std=gnu++20 -pipe -x c++-header "$header" -o "$header.gch"
WORKDIR /opt
ENV ES_MOUNT_CONF=/opt/mount.yaml \
    ES_NO_FALLBACK=true \
    ES_FILE_TIMEOUT=10m
EXPOSE 5050
ENTRYPOINT ["/opt/go-judge"]
