#!/bin/sh
# Managed by OFA studio-design-guard installer v1
set -eu
studio_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec python3 "$studio_dir/design_guard.py" --root "$studio_dir/.." "$@"
