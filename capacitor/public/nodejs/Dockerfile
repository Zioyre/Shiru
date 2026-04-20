FROM alpine:3.23 AS worker

RUN apk add curl unzip
RUN curl -L https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v18.20.4/nodejs-mobile-v18.20.4-android.zip -o libnode.zip
RUN unzip libnode.zip

FROM saschpe/android-ndk:37.0-jdk21.0.10_7-ndk30.0.14904198-cmake4.1.2

USER root

COPY --from=worker ./nodejs-mobile* /opt/libnode
ENV LIBNODE_PATH=/opt/libnode

# Install nodejs 18 (same version as nodejs-mobile)
ARG NODE_MAJOR=18

RUN apt-get update
RUN apt-get install -y ca-certificates curl gnupg make
RUN mkdir -p /etc/apt/keyrings
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
RUN apt-get update
RUN apt-get install nodejs -y

WORKDIR /app