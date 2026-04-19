# syntax=docker/dockerfile:1.7
# Builds the donto HTTP sidecar (dontosrv) from the sibling donto repo.
# Build context: parent of dontopedia/ and donto/ (../../../ from compose).

FROM rust:1.82-slim-bookworm AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends pkg-config libssl-dev ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY donto /src/donto
WORKDIR /src/donto
RUN cargo build --release -p dontosrv

FROM debian:bookworm-slim AS run
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/donto/target/release/dontosrv /usr/local/bin/dontosrv
EXPOSE 7878
ENV DONTO_BIND=0.0.0.0:7878
CMD ["/usr/local/bin/dontosrv"]
