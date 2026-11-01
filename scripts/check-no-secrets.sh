#!/bin/sh
# Prüft, ob Geheimnisse im Repository stehen könnten. Läuft lokal (`sh scripts/check-no-secrets.sh`) und in der CI.
set -eu
cd "$(dirname "$0")/.."
status=0

# 1) .env-Dateien dürfen nicht versioniert sein (außer .env.example)
if git rev-parse --git-dir >/dev/null 2>&1; then
  tracked="$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v -E '(^|/)\.env\.example$' || true)"
  if [ -n "$tracked" ]; then
    echo "FEHLER: .env-Dateien sind versioniert:"; echo "$tracked"; status=1
  fi
fi

# 2) Typische Schlüsselmuster im Quelltext (Supabase Secret Key, JWTs, mod-Tokens, private Schlüssel)
patterns='sb_secret_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|smpe_[a-f0-9]{64}|-----BEGIN ([A-Z]+ )?PRIVATE KEY-----'
# In einem Git-Repo nur versionierte Dateien prüfen (eine lokale, ignorierte .env.local ist kein Fehler).
if git rev-parse --git-dir >/dev/null 2>&1; then
  hits="$(git ls-files -z | xargs -0 grep -HInE "$patterns" -- 2>/dev/null | grep -v '^scripts/check-no-secrets.sh:' || true)"
else
  hits="$(grep -rInE "$patterns" . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=build --exclude-dir=.gradle --exclude=check-no-secrets.sh || true)"
fi
if [ -n "$hits" ]; then
  echo "FEHLER: mögliche Schlüssel im Quelltext:"; echo "$hits" | cut -c1-160; status=1
fi

# 3) Geheimnis-Variablen in .env.example müssen leer sein
if grep -nE '^(SUPABASE_SECRET_KEY|TWITCH_CLIENT_SECRET)=.+' .env.example; then
  echo "FEHLER: .env.example enthält einen Wert für eine Geheimnis-Variable"; status=1
fi

# 4) Server-Geheimnisse dürfen nie mit NEXT_PUBLIC_ benannt werden (das würde sie in den Browser bringen)
if grep -rnE 'NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE_ROLE)' apps .env.example --include='*.ts' --include='*.tsx' --include='*.example' --include='*.json' --include='*.mjs'; then
  echo "FEHLER: Geheimnis mit NEXT_PUBLIC_-Präfix"; status=1
fi

# 5) Client-Komponenten dürfen den Secret-Key-Client nicht importieren
client_files="$(grep -rlE "^['\"]use client['\"]" apps/web/src --include='*.ts' --include='*.tsx' || true)"
for f in $client_files; do
  if grep -q "supabase/admin" "$f"; then echo "FEHLER: Client-Komponente importiert supabase/admin: $f"; status=1; fi
done

if [ "$status" -eq 0 ]; then echo "OK: keine Geheimnisse gefunden."; fi
exit "$status"
