# Stand-in for the web app (WEB_IMAGE=<this image>): proves the edge and the
# smoke checks do not depend on the web framework. Contract: :3000, non-root,
# HEALTHCHECK, `/` answers 200.
FROM docker.io/library/busybox:1.38@sha256:a46257e06c82ad85242d0d38077d0a52d9896389ca60a1a59d3463db586e5fa4
RUN mkdir /www && echo 'stub web' >/www/index.html
USER 65534
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["httpd", "-f", "-p", "3000", "-h", "/www"]
