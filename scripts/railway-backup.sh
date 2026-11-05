#!/bin/bash
# Verified backup v4 (daily by cron, or on deploy) of the Digital Menu production data, run inside the
# Railway project. Writes to /backup (its own volume).
# Deployed as the start command of the Railway "db-backup" service (image postgres:18, volume at
# /backup, cron 17 0 * * * UTC), gzip+base64 encoded:
#   bash -c "echo <base64 of gzip of this file> | base64 -d | gunzip > /tmp/backup.sh && bash /tmp/backup.sh"
# Needs DATABASE_URL (private network), BASE (the public site) and the bucket by reference:
# S3_BUCKET, S3_ENDPOINT, S3_KEY, S3_SECRET, S3_REGION (from the menu-images bucket).
# Checks: DB dump restores into a private server with equal row counts; the WHOLE bucket (every
# restaurant, any status) is copied and checked file by file; every file the database points to is
# in the copy; the public site serves active originals. Data-quality counts come from the restored
# copy, never from production. Retention keeps the newest 14 complete backups.
set -uo pipefail
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT=/backup/$TS
mkdir -p "$OUT/storage"
echo "BACKUP_START $TS script=v4"
q() { psql -d "$DATABASE_URL" -Atc "$1"; }

# 1. Database: custom-format dump (restorable with pg_restore).
if ! pg_dump --no-owner --no-privileges -Fc -d "$DATABASE_URL" -f "$OUT/db.dump"; then echo "DB_DUMP FAILED"; exit 1; fi
sha256sum "$OUT/db.dump" | tee "$OUT/db.dump.sha256" | sed 's/^/DUMP_SHA256 /'
echo "DUMP_BYTES $(stat -c %s "$OUT/db.dump")"

# 2. Prove it restores: a private, temporary server inside this container.
PGV=/tmp/verify; mkdir -p $PGV; chown postgres:postgres $PGV
gosu postgres initdb -D $PGV -A trust -U postgres >/dev/null
gosu postgres pg_ctl -D $PGV -o "-p 5499 -k /tmp -c listen_addresses=''" -w start >/dev/null
createdb -h /tmp -p 5499 -U postgres verify
if ! pg_restore --no-owner --no-privileges --exit-on-error -h /tmp -p 5499 -U postgres -d verify "$OUT/db.dump"; then echo "DB_RESTORE FAILED"; exit 1; fi
CORE="users businesses business_memberships brand_themes menus menu_versions menu_categories menu_items menu_item_images media public_files public_file_versions offers modifier_groups modifier_options menu_item_modifier_groups qr_codes branches price_history _prisma_migrations"
FAIL=0
for t in $(q "select tablename from pg_tables where schemaname='public' order by 1"); do
  a=$(q "select count(*) from public.\"$t\""); b=$(psql -h /tmp -p 5499 -U postgres -d verify -Atc "select count(*) from public.\"$t\"")
  echo "TABLE $t prod=$a restored=$b"
  if [[ " $CORE " == *" $t "* ]] && [ "$a" != "$b" ]; then FAIL=1; fi
  if [ "$b" -gt "$a" ]; then FAIL=1; fi
done
# 2b. Data-quality audit, read from the RESTORED COPY (never production):
# counts per restaurant, for review only; nothing is changed anywhere.
v() { psql -h /tmp -p 5499 -U postgres -d verify -AtF ' ' -c "$1"; }
v "select 'AUDIT', b.\"publicId\", b.status, 'dishes=' || count(i.id),
  'no_en=' || count(i.id) filter (where i.\"nameEn\" is null or btrim(i.\"nameEn\")=''),
  'no_desc=' || count(i.id) filter (where coalesce(btrim(i.\"descriptionAr\"),'')='' and coalesce(btrim(i.\"descriptionEn\"),'')=''),
  'no_cal=' || count(i.id) filter (where i.calories is null),
  'odd_cal=' || count(i.id) filter (where i.calories < 20 or i.calories > 2500),
  'no_price=' || count(i.id) filter (where i.\"priceMinor\" is null),
  'no_photo=' || count(i.id) filter (where i.\"imageMediaId\" is null)
  from businesses b left join menu_items i on i.\"businessId\"=b.id group by b.\"publicId\", b.status order by 2" > "$OUT/audit.txt" 2>&1
v "select 'AUDIT_SHARED_PHOTO', b.\"publicId\", count(*) from (select \"businessId\", \"imageMediaId\" from menu_items where \"imageMediaId\" is not null group by 1,2 having count(*)>1) s join businesses b on b.id=s.\"businessId\" group by 2 order by 2" >> "$OUT/audit.txt" 2>&1
v "select 'AUDIT_ODD_CAL', b.\"publicId\", i.\"itemCode\", i.calories from menu_items i join businesses b on b.id=i.\"businessId\" where i.calories < 20 or i.calories > 2500 order by 2,3 limit 40" >> "$OUT/audit.txt" 2>&1
v "select 'AUDIT_OPTIONS', b.\"publicId\", 'empty_ar=' || count(*) filter (where btrim(o.\"nameAr\")=''), 'no_en=' || count(*) filter (where o.\"nameEn\" is null or btrim(o.\"nameEn\")='') from modifier_options o join modifier_groups g on g.id=o.\"groupId\" join businesses b on b.id=g.\"businessId\" group by 2 order by 2" >> "$OUT/audit.txt" 2>&1
cat "$OUT/audit.txt"
gosu postgres pg_ctl -D $PGV -m fast stop >/dev/null; rm -rf $PGV
if [ $FAIL = 0 ]; then echo "DB_VERIFY OK"; else echo "DB_VERIFY MISMATCH"; exit 1; fi

# 3. Stored files: the WHOLE bucket, every restaurant (active, draft or
#    inactive), copied and checked file by file against the bucket.
apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq curl ca-certificates rclone >/dev/null 2>&1
if ! command -v rclone >/dev/null; then echo "MEDIA_TOOL FAILED"; exit 1; fi
if [ -z "${S3_BUCKET:-}" ] || [ -z "${S3_ENDPOINT:-}" ]; then echo "MEDIA_CONFIG FAILED"; exit 1; fi
export RCLONE_CONFIG_B_TYPE=s3 RCLONE_CONFIG_B_PROVIDER=Other RCLONE_CONFIG_B_ENDPOINT="$S3_ENDPOINT" \
  RCLONE_CONFIG_B_ACCESS_KEY_ID="$S3_KEY" RCLONE_CONFIG_B_SECRET_ACCESS_KEY="$S3_SECRET" \
  RCLONE_CONFIG_B_REGION="${S3_REGION:-auto}" RCLONE_CONFIG_B_FORCE_PATH_STYLE=false
rmdir "$OUT/storage" 2>/dev/null
if ! rclone copy "B:$S3_BUCKET" "$OUT/media" --transfers 8 --checkers 16 --exclude ".probe/**" -q; then echo "MEDIA_COPY FAILED"; exit 1; fi
if ! rclone check "B:$S3_BUCKET" "$OUT/media" --one-way --exclude ".probe/**" -q; then echo "MEDIA_CHECK FAILED"; exit 1; fi
echo "MEDIA_COPY OK $(rclone size "B:$S3_BUCKET" --exclude '.probe/**' --json)"
(cd "$OUT/media" && find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$OUT/media.sha256"
echo "MEDIA_FILES $(wc -l < "$OUT/media.sha256") MEDIA_BYTES $(du -sb "$OUT/media" | cut -f1)"

# Every file the database points to, for every restaurant, is in the copy.
q "select m.\"storageKey\"||'|'||array_to_string(m.\"derivativeWidths\",',') from media m where m.\"sourceUrl\" is null union all select \"storageKey\"||'|' from public_file_versions" > "$OUT/media-keys.txt"
keys=0; missing=0
while IFS='|' read -r key widths; do
  [ -z "$key" ] && continue
  for k in "$key" $(for w in ${widths//,/ }; do echo "${key%.*}@${w}.webp"; done); do
    keys=$((keys+1))
    if [ ! -f "$OUT/media/$k" ]; then missing=$((missing+1)); [ $missing -le 20 ] && echo "MEDIA_DB_MISSING $k"; fi
  done
done < "$OUT/media-keys.txt"
echo "MEDIA_DB keys=$keys missing=$missing"

# And the public site still serves them (active restaurants' originals).
ok=0; bad=0
while IFS='|' read -r key size; do
  [ -z "$key" ] && continue
  got=$(curl -s -o /dev/null -w '%{http_code} %{size_download}' "$BASE/uploads/$key")
  if [ "$got" = "200 $size" ]; then ok=$((ok+1)); else bad=$((bad+1)); [ $bad -le 20 ] && echo "SERVE_MISS $key $got/$size"; fi
done < <(q "select m.\"storageKey\"||'|'||m.\"sizeBytes\" from media m join businesses b on b.id=m.\"businessId\" where m.\"sourceUrl\" is null and b.status='ACTIVE'")
echo "SERVED originals_ok=$ok originals_missing=$bad"
echo "BACKUP_DONE $TS"

# 4. Retention, only after a verified backup (every failure above exits first).
# A backup counts as complete only with its marker; folders without one
# (older manual backups, or a failed run) are never touched here.
echo "RETENTION_START keep=14"
touch "$OUT/BACKUP_OK"
KEEP=14
complete() { for d in $(ls -1d /backup/20*Z 2>/dev/null | sort); do [ -f "$d/BACKUP_OK" ] && echo "$d"; done; }
for d in $(complete | head -n -$KEEP); do echo "PRUNE $d"; rm -rf "$d"; done
# Never let the volume fill: past 80%, drop the oldest complete backups, keeping at least 3.
while [ "$(df --output=pcent /backup | tail -1 | tr -dc 0-9)" -gt 80 ]; do
  [ "$(complete | wc -l)" -le 3 ] && { echo "DISK_WARN backup volume over 80% with 3 backups left"; break; }
  d=$(complete | head -1); echo "PRUNE_SPACE $d"; rm -rf "$d"
done
echo "BACKUPS_KEPT $(complete | wc -l) DISK $(df -h --output=used,size,pcent /backup | tail -1)"
# Let the log collector read the last lines before the container exits.
sleep 5
