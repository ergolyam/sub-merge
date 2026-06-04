# sub-merge

Sub-merge fetches the same subscription id from multiple upstream servers, extracts subscription URI lines, removes duplicates, and returns one merged subscription. Browser requests get a simple HTML page with one copy button per link. Subscription clients get a base64 encoded subscription.

## Test locally

- Run nginx with Podman:
    ```bash
    podman run --rm -it \
      -e SUBMERGE_UPSTREAMS="https://node1.example.com, https://node2.example.com" \
      -v $PWD/conf.d:/etc/nginx/conf.d:O -v $PWD/src:/etc/nginx/submerge:O \
      -p 127.0.0.1:8080:8080 \
      docker.io/nginx:stable-alpine /etc/nginx/submerge/entrypoint.sh
    ```

- Open a merged subscription in a browser: `http://127.0.0.1:8080/sub-merge/YOUR_SUB_ID`

> If the subscription id is empty or no upstream returns usable links, nginx returns `404`.
