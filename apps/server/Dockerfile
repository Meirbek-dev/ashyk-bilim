# Build context: repository root (compose: `context: ., dockerfile: apps/server/Dockerfile`).
# A static musl binary on distroless static (docs/REWRITE.md 4.2 "Build:"): no shell, no curl, no libc in the image.
# mimalloc stays the allocator (musl's malloc is slow under threads). TLS is rustls (ring, aws-lc-rs), so nothing
# needs glibc or OpenSSL; jiff bundles the time zone database, the certificate fonts are compiled in. Healthchecks
# and the smoke's in-container request run `ashyq probe`. cargo-chef caches the dependency layer; SQLX_OFFLINE
# builds against .sqlx.
#
# Pull the official images directly: the ECR mirror's anonymous data quota blocks CI.

FROM docker.io/library/rust:1.100.0-alpine@sha256:8d0e82abfdf9a38071e07cabc5afba4ddbe077631a80e4e742a760c38beadc33 AS chef
# musl-dev: the static libc and crt objects the C dependencies (ring, aws-lc-sys, zstd-sys, mimalloc) link against.
RUN apk add --no-cache musl-dev \
    && cargo install cargo-chef --version 0.1.78 --locked
# The image's own toolchain (the same version): rust-toolchain.toml would also download clippy, rustfmt and
# llvm-tools into every build.
ENV RUSTUP_TOOLCHAIN=1.100.0
WORKDIR /build

FROM chef AS planner
COPY apps/server/ .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /build/recipe.json recipe.json
RUN cargo chef cook --locked --release --package ashyq-server --recipe-path recipe.json
COPY apps/server/ .
ENV SQLX_OFFLINE=true
# The binary moves out and target/ goes in the same layer: the layer (and the cache it is exported to) stays small
# instead of ~0.5 GB of build output. The binary must not need a dynamic loader (distroless static has none).
RUN cargo build --locked --release -p ashyq-server \
    && if readelf -l target/release/ashyq | grep -q INTERP; then echo "ashyq is not static" >&2; exit 1; fi \
    && mv target/release/ashyq /usr/local/bin/ashyq && rm -rf target

# nonroot tag; the process still runs as 10001, the uid of the earlier Debian image.
FROM gcr.io/distroless/static-debian13:nonroot@sha256:8ce6dd87e9823c5b48dcfb2c8604714ccb351ce59607327bcc4957448da279b5 AS runtime
COPY --from=builder /usr/local/bin/ashyq /usr/local/bin/ashyq
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s \
    CMD ["/usr/local/bin/ashyq", "probe", "http://127.0.0.1:8000/api/v2/health"]
ENTRYPOINT ["/usr/local/bin/ashyq"]
CMD ["serve"]
