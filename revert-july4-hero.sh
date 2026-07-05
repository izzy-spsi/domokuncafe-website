#!/bin/zsh
# Auto-revert script: restores rotating Chef Domo hero images after July 4th.
# Created 2026-07-04. Safe to delete after it runs once.
set -e
cd /Users/izzyaala/Documents/domokuncafe-website

if [ ! -f index.html.pre-july4-backup ]; then
  echo "No backup file found — nothing to revert (already reverted?)."
  exit 0
fi

cp index.html.pre-july4-backup index.html
rm -f domo-site-assets/domo-250th-july4-2026.jpg
rm -f index.html.pre-july4-backup

git add -A
git commit -m "revert: restore rotating Chef Domo hero images, remove July 4th temp graphic" || echo "Nothing to commit"
git push origin main

echo "Reverted and pushed."
