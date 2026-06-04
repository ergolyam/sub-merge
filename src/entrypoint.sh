#!/bin/ash
set -eu

sed -i "1iload_module modules/ngx_http_js_module.so;" /etc/nginx/nginx.conf
sed -i "2ienv SUBMERGE_UPSTREAMS;" /etc/nginx/nginx.conf

exec nginx -g "daemon off;"
