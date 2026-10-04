# Build context: repository root (compose: `context: ., dockerfile: apps/server/Dockerfile`).
# cargo-chef caches the dependency layer; SQLX_OFFLINE builds against .sqlx.
#
# Base images come from Amazon's Docker Hub mirror (public.ecr.aws) — CI runs
# #24/#25 died on Docker Hub's anonymous pull rate limit on shared GitHub
# runner IPs; the mirror serves the same official images without the limit.

FROM public.ecr.aws/docker/library/rust:1-slim-trixie AS chef
RUN cargo install cargo-chef --locked
WORKDIR /build

FROM chef AS planner
COPY apps/server/ .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /build/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY apps/server/ .
ENV SQLX_OFFLINE=true
# The binary moves out and target/ goes in the same layer: the layer (and the gha
# cache it is exported to) stays small instead of ~0.5 GB of build output.
RUN cargo build --release -p ashyq-server \
    && mv target/release/ashyq /usr/local/bin/ashyq && rm -rf target

FROM public.ecr.aws/docker/library/debian:trixie-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 10001 ashyq \
    && useradd -u 10001 -g ashyq -s /usr/sbin/nologin ashyq
COPY --from=builder /usr/local/bin/ashyq /usr/local/bin/ashyq
USER ashyq
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s \
    CMD curl -fsS http://127.0.0.1:8000/api/v2/health || exit 1
ENTRYPOINT ["/usr/local/bin/ashyq"]
CMD ["serve"]
