# syntax=docker/dockerfile:1.7
# Builds the donto HTTP sidecar (dontosrv) from the sibling donto repo.
# Build context: ../../.. (so both dontopedia and donto sit in the context).

FROM rust:1.82-slim AS build
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY donto /src/donto
WORKDIR /src/donto
RUN cargo build --release -p dontosrv

FROM debian:bookworm-slim AS run
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/donto/target/release/dontosrv /usr/local/bin/dontosrv
EXPOSE 7878
ENV DONTO_BIND=0.0.0.0:7878
CMD ["/usr/local/bin/dontosrv"]
