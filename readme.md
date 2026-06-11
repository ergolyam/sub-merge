# sub-merge

Lightweight container image for merging subscription links from multiple upstream subscription servers.

## Initial Setup

### Build

```bash
docker build -t sub-merge .
```

### Pull

```bash
docker pull ghcr.io/ergolyam/sub-merge:latest
```

## Run

`UPSTREAMS` is required. Provide a comma-separated list of upstream base URLs without the `/sub/<id>` suffix.

- With two upstream servers:
    ```bash
    docker run --rm -it \
      -p 3000:3000 \
      -e UPSTREAMS=https://node1.example.com,https://node2.example.com \
      sub-merge
    ```

- With custom upstream timeout:
    ```bash
    docker run --rm -it \
      -p 3000:3000 \
      -e TIMEOUT=10 \
      -e UPSTREAMS=https://node1.example.com,https://node2.example.com \
      sub-merge
    ```

## Usage

- Request a subscription id directly from the container:
    - http://localhost:3000/my-subscription-id

- For the request above, sub-merge fetches:
    - https://node1.example.com/sub/my-subscription-id
    - https://node2.example.com/sub/my-subscription-id

- With `SUB_SUFFIXES=cz,ee`, the same request also fetches:
    - https://node1.example.com/sub/my-subscription-id-cz
    - https://node1.example.com/sub/my-subscription-id-ee
    - https://node2.example.com/sub/my-subscription-id-cz
    - https://node2.example.com/sub/my-subscription-id-ee

- The service accepts plain, base64, and base64url upstream subscription responses. It extracts URI lines, removes duplicates, and keeps the original upstream order.
    - Browser requests receive a simple HTML page with one copy button per link.
    - Subscription clients receive a base64 encoded merged subscription.

### Nginx reverse proxy

- To expose sub-merge under `/sub-merge/`, proxy requests to the container root:
    ```nginx
    server {
        listen 80 default;
        server_name example.com;

        location /sub-merge/ {
            proxy_pass http://127.0.0.1:3000/;
            proxy_intercept_errors on;
            error_page 404 =404 @nginx_404;
        }

        location @nginx_404 {
            return 404;
        }
    }
    ```

- With this configuration, request the merged subscription through Nginx:
    - http://example.com/sub-merge/my-subscription-id

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `UPSTREAMS` | - | Required comma-separated upstream base URLs. Only `http` and `https` URLs are used |
| `SUB_SUFFIXES` | - | Optional comma-separated subscription id suffixes. For `SUB_SUFFIXES=cz,ee`, requests also include `<id>-cz` and `<id>-ee` |
| `PORT` | `3000` | HTTP listen port |
| `HOST` | `0.0.0.0` | HTTP listen address |
| `TIMEOUT` | `5` | Upstream fetch timeout in seconds |
| `RETRIES` | `1` | Total upstream fetch attempts inside `TIMEOUT`. Unset keeps one attempt with no retries |
