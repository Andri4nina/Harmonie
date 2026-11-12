# API Harmonie (Rust). Contexte de build : la racine du dépôt.
#   docker build -f deploy/api.Dockerfile -t harmonie-api .

FROM rust:1-slim-trixie AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY db ./db
RUN cargo build --release --locked -p harmonia-api --bin harmonia-api

FROM debian:trixie-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --create-home harmonie
COPY --from=build /src/target/release/harmonia-api /usr/local/bin/harmonia-api
USER harmonie
WORKDIR /home/harmonie
ENV PORT=8080 LOCAL_STORAGE_DIR=/home/harmonie/storage
EXPOSE 8080
CMD ["harmonia-api"]
