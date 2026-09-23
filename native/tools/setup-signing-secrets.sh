#!/usr/bin/env bash
#
# Verify the signing and notarisation credentials, then push them to GitHub as repository secrets.
#
# Run once now, and again whenever a certificate or key is rotated. It asks for the .p12 export
# password at a prompt rather than taking it as an argument, so it never lands in your shell
# history, in a process list, or in a transcript.
#
# Everything is checked before anything is uploaded. A secret that turns out to be wrong is worse
# than a missing one: the workflow gets far enough to look like it is working and then fails in
# the signing step, twenty minutes into a release.
#
#   native/tools/setup-signing-secrets.sh --check         verify only, touch nothing
#   native/tools/setup-signing-secrets.sh --emit DIR      verify, write values to paste by hand
#   GH_TOKEN=... native/tools/setup-signing-secrets.sh    verify, then upload
#
# There is deliberately no `gh auth login` step. That flow asks for account-wide scopes and
# leaves a long-lived token in your keychain, which is a lot of standing authority to acquire in
# order to write six repository secrets once. Instead:
#
#   --emit    needs no GitHub access at all. Writes each value to a mode-600 file for pasting
#             into the web UI, and never writes the .p12 password anywhere — you type that
#             straight into the browser.
#
#   GH_TOKEN  a fine-grained personal access token scoped to this one repository with the single
#             "Secrets: Read and write" permission and a short expiry. `gh` reads it from the
#             environment, uses it, and stores nothing. See SIGNING.md.
#
# --check needs no GitHub access either, which makes it the thing to run when a release fails in
# the signing step and you want to know whether the credentials or the workflow is at fault.
#
# Environment overrides, all optional:
#   P12_PATH        default ~/Downloads/Certificates.p12
#   NOTARY_KEY_PATH default ~/Downloads/AuthKey_*.p8   (if exactly one matches)
#   NOTARY_KEY_ID / NOTARY_ISSUER_ID
#   REPO            default: the origin remote of this checkout
#
# Written for bash 3.2 — see the note in macos-sign.sh.

set -euo pipefail

p12="${P12_PATH:-$HOME/Downloads/Certificates.p12}"
repo="${REPO:-}"

check_only=false
emit_dir=""
while [ $# -gt 0 ]; do
    case "$1" in
        --check|--verify-only) check_only=true ;;
        --emit) shift; emit_dir="${1:-}"; [ -n "$emit_dir" ] || { printf -- '--emit needs a directory\n' >&2; exit 2; } ;;
        # 2,38 is the header block and nothing after it. '2,40p' ran one line past the
        # comment and printed `set -euo pipefail` as though it were documentation.
        -h|--help) sed -n '2,38p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) printf 'unknown option: %s\n' "$1" >&2; exit 2 ;;
    esac
    shift
done

say() { printf '%s\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

# ------------------------------------------------------------------------------- preconditions
upload=false
if [ "$check_only" = false ] && [ -z "$emit_dir" ]; then
    upload=true
    command -v gh >/dev/null 2>&1 || fail "the GitHub CLI (gh) is not installed"
    if [ -z "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]; then
        fail "no GH_TOKEN in the environment.

       Rather than \`gh auth login\`, which takes account-wide scopes and stores a token in
       your keychain, create a fine-grained token scoped to this repository alone with the
       single \"Secrets: Read and write\" permission and a short expiry:

         https://github.com/settings/personal-access-tokens/new

       Then, with a leading space so it stays out of your shell history:

          GH_TOKEN=github_pat_... native/tools/setup-signing-secrets.sh

       Or skip GitHub credentials entirely and paste the values in by hand:

          native/tools/setup-signing-secrets.sh --emit ~/ssb-secrets"
    fi
fi

if [ -z "$repo" ]; then
    origin="$(git remote get-url origin 2>/dev/null || true)"
    case "$origin" in
        *github.com[:/]*) repo="$(echo "$origin" | sed -E 's#.*github\.com[:/]##; s#\.git$##')" ;;
    esac
    if [ -z "$repo" ] && [ "$check_only" = false ]; then
        fail "could not work out the repository. Set REPO=owner/name."
    fi
fi
[ -n "$repo" ] && say "repository: $repo"

[ -r "$p12" ] || fail "no readable .p12 at $p12 (set P12_PATH)"

# The .p8 by glob, but only when there is exactly one — guessing between two signing keys is how
# you sign a release with the wrong account and find out months later.
key="${NOTARY_KEY_PATH:-}"
if [ -z "$key" ]; then
    matches=""
    for candidate in "$HOME"/Downloads/AuthKey_*.p8; do
        [ -e "$candidate" ] && matches="$matches$candidate"$'\n'
    done
    count=0
    [ -n "$matches" ] && count="$(printf '%s' "$matches" | grep -c . || true)"
    if [ "$count" -eq 1 ]; then
        key="$(printf '%s' "$matches" | head -1)"
    elif [ "$count" -gt 1 ]; then
        fail "several AuthKey_*.p8 files in ~/Downloads. Set NOTARY_KEY_PATH to the right one."
    fi
fi

key_id="${NOTARY_KEY_ID:-}"
if [ -n "$key" ] && [ -z "$key_id" ]; then
    # AuthKey_XXXXXXXXXX.p8 — Apple's own naming carries the key ID, so it need not be retyped.
    base="$(basename "$key")"
    key_id="${base#AuthKey_}"
    key_id="${key_id%.p8}"
fi
issuer_id="${NOTARY_ISSUER_ID:-}"

# A local, gitignored file so the issuer ID is typed once rather than every time. It is not a
# secret — it identifies an account and is useless without the .p8 — but it is also not something
# to commit to a repository that publishes to GitHub Pages.
signing_env="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.signing.env"
if [ -z "$issuer_id" ] && [ -r "$signing_env" ]; then
    # shellcheck disable=SC1090
    . "$signing_env"
    issuer_id="${NOTARY_ISSUER_ID:-}"
fi

# ------------------------------------------------------------------------------- the password
#
# What was found, before asking for anything. Typing a password to authorise a check against a
# file you did not mean is a small thing, but it is avoidable and it is your signing key.
say "certificate: $p12"
if [ -n "$key" ]; then
    say "notary key:  $key  (id $key_id)"
fi
say ""

# Not secret, so a plain visible prompt — and offered for saving, because nobody remembers a UUID
# and looking it up in App Store Connect every time is a small tax on every release.
if [ -n "$key" ] && [ -z "$issuer_id" ]; then
    say "The issuer ID is the UUID above the key list in"
    say "App Store Connect ▸ Users and Access ▸ Integrations ▸ App Store Connect API."
    printf 'Issuer ID: '
    read -r issuer_id
    [ -n "$issuer_id" ] || fail "no issuer ID given"
    if [ ! -e "$signing_env" ]; then
        printf 'NOTARY_ISSUER_ID=%s\n' "$issuer_id" > "$signing_env"
        chmod 600 "$signing_env"
        say "saved to native/.signing.env (gitignored) so this is the last time you type it"
    fi
    say ""
fi
if [ -n "$issuer_id" ]; then
    say "issuer:      $issuer_id"
    say ""
fi

# `read -s` keeps it off the screen; being a prompt rather than an argument keeps it out of the
# shell history and out of `ps`.
#
# Optional in --emit mode. Encoding a .p12 does not need its password, and the identity string can
# be read from the login keychain — so the only thing the password buys there is verification.
# Worth having, worth skipping, not worth insisting on.
p12_password=""
if [ -n "$emit_dir" ]; then
    printf 'Export password for %s (optional — blank skips verification): ' "$(basename "$p12")"
else
    printf 'Export password for %s: ' "$(basename "$p12")"
fi
read -r -s p12_password
printf '\n'
if [ -z "$p12_password" ] && [ -z "$emit_dir" ]; then
    fail "no password given"
fi

# ------------------------------------------------------------------------------- verify the p12
#
# Imported into a throwaway keychain that is never added to the search list. That is the whole
# trick to doing this safely: `security list-keychain -s` *replaces* the search list rather than
# appending to it, so a script that adds itself and then restores badly can leave a machine
# looking as though its signing certificate has vanished. Passing the keychain path straight to
# find-identity avoids needing the search list at all.
say ""
if [ -z "$p12_password" ]; then
    # No password, so no import test. The identity comes from the login keychain instead, which
    # is the same certificate — it is where the .p12 was exported from.
    say "no password given: skipping the import test."
    identity="${MACOS_SIGN_IDENTITY:-}"
    if [ -z "$identity" ]; then
        identity="$(security find-identity -v -p codesigning 2>/dev/null \
            | grep "Developer ID Application" | sed -E 's/.*"(.*)".*/\1/' | head -1 || true)"
    fi
    [ -n "$identity" ] || fail "no Developer ID Application identity in the login keychain either.
       Set MACOS_SIGN_IDENTITY, or give the password so the .p12 can be read."
    say "  identity from the login keychain: $identity"
    team_id="$(printf '%s' "$identity" | sed -E 's/.*\(([A-Z0-9]{10})\)$/\1/')"
else

say "checking the certificate…"
scratch="$(mktemp -d)"
keychain="$scratch/verify.keychain-db"
keychain_password="$(openssl rand -base64 24)"
cleanup() {
    security delete-keychain "$keychain" 2>/dev/null || true
    rm -rf "$scratch"
}
trap cleanup EXIT

security create-keychain -p "$keychain_password" "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"

if ! security import "$p12" -k "$keychain" -P "$p12_password" \
        -T /usr/bin/codesign -T /usr/bin/security >/dev/null 2>&1; then
    fail "the .p12 would not import. Wrong password, or exported by OpenSSL 3 without -legacy
       (macOS cannot read its default AES-256/SHA-256 PKCS#12; Keychain Access exports are fine)."
fi
security set-key-partition-list -S apple-tool:,apple:,codesign: \
         -s -k "$keychain_password" "$keychain" >/dev/null 2>&1 || true

identity="$(security find-identity -v -p codesigning "$keychain" 2>/dev/null \
    | grep "Developer ID Application" | sed -E 's/.*"(.*)".*/\1/' | head -1 || true)"
if [ -z "$identity" ]; then
    say "  what the .p12 does contain:"
    security find-identity "$keychain" 2>/dev/null | sed 's/^/    /'
    fail "no *valid* Developer ID Application identity in the .p12.

       If the identity is listed above with CSSMERR_TP_NOT_TRUSTED, the private key is present
       but the chain is not: export the certificate *and* its private key together (select both
       rows in Keychain Access), and make sure the Apple intermediates are installed."
fi
say "  ok  $identity"

# The team ID is the parenthesised suffix, and it is what notarisation wants for the Apple ID
# route — worth reporting so it never has to be looked up.
team_id="$(printf '%s' "$identity" | sed -E 's/.*\(([A-Z0-9]{10})\)$/\1/')"

expiry="$(security find-certificate -c "Developer ID Application" -p "$keychain" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
[ -n "$expiry" ] && say "      expires $expiry"

fi

# ------------------------------------------------------------------------------- verify the key
if [ -n "$key" ]; then
    say ""
    say "checking the notarisation key…"
    if xcrun notarytool history --key "$key" --key-id "$key_id" --issuer "$issuer_id" \
            >/dev/null 2>&1; then
        say "  ok  App Store Connect key $key_id"
    else
        fail "notarytool rejected the key. Check the key ID and issuer ID against
       App Store Connect ▸ Users and Access ▸ Integrations."
    fi
else
    say ""
    say "note: no .p8 found, so only the signing secrets will be set."
    say "      Without notarisation credentials a release is signed but still shows"
    say "      Gatekeeper's refusal dialog."
fi

# ------------------------------------------------------------------------------- check only
if [ "$check_only" = true ]; then
    unset p12_password
    say ""
    say "--check: everything verified, nothing written and nothing uploaded."
    say "Team ID is $team_id."
    exit 0
fi

# ------------------------------------------------------------------------------- emit
#
# For pasting into the web UI, when no GitHub credential should exist on this machine at all.
#
# The .p12 password is deliberately *not* written. It is the one value you can type straight into
# the browser field, so putting a copy on disk would add an exposure that buys nothing.
if [ -n "$emit_dir" ]; then
    mkdir -p "$emit_dir"
    chmod 700 "$emit_dir"

    write_value() {
        target="$emit_dir/$1.txt"
        umask 077
        cat > "$target"
        chmod 600 "$target"
        say "  wrote  $1.txt  ($(wc -c < "$target" | tr -d ' ') bytes)"
    }

    say ""
    say "writing values to $emit_dir …"
    base64 -i "$p12" | write_value MACOS_CERTIFICATE_P12
    printf '%s' "$identity" | write_value MACOS_SIGN_IDENTITY
    if [ -n "$key" ]; then
        base64 -i "$key" | write_value NOTARY_KEY_P8
        printf '%s' "$key_id" | write_value NOTARY_KEY_ID
        printf '%s' "$issuer_id" | write_value NOTARY_ISSUER_ID
    fi
    unset p12_password

    say ""
    say "Paste each into https://github.com/$repo/settings/secrets/actions"
    say "as a secret named after its file, minus the .txt."
    say ""
    say "MACOS_CERTIFICATE_PASSWORD is not among them on purpose — type the export"
    say "password straight into the browser rather than leaving a copy on disk."
    say ""
    say "Then shred the directory:  rm -rf '$emit_dir'"
    say ""
    say "Team ID is $team_id."
    exit 0
fi

# ------------------------------------------------------------------------------- upload
say ""
say "setting repository secrets on $repo…"

set_secret() {
    name="$1"
    # Value on stdin, never as an argument: `gh secret set --body` would put it in `ps`.
    if gh secret set "$name" --repo "$repo" >/dev/null 2>&1; then
        say "  set  $name"
    else
        fail "could not set $name.

       The token needs the \"Secrets: Read and write\" permission on $repo. A fine-grained
       token also has to have that repository selected under Repository access."
    fi
}

base64 -i "$p12" | set_secret MACOS_CERTIFICATE_P12
printf '%s' "$p12_password" | set_secret MACOS_CERTIFICATE_PASSWORD
printf '%s' "$identity" | set_secret MACOS_SIGN_IDENTITY

if [ -n "$key" ]; then
    base64 -i "$key" | set_secret NOTARY_KEY_P8
    printf '%s' "$key_id" | set_secret NOTARY_KEY_ID
    printf '%s' "$issuer_id" | set_secret NOTARY_ISSUER_ID
fi

unset p12_password

say ""
say "done. Team ID is $team_id."
say ""
say "The token has served its purpose and can be deleted now:"
say "  https://github.com/settings/tokens"
say ""
say "Prove the whole path before a tag depends on it:"
say "  gh workflow run 'Plugins' --repo $repo -f notarize=true"
say ""
say "Then release with a tag:"
say "  git tag v0.1.0 && git push origin v0.1.0"
say ""
say "Both files in ~/Downloads are secrets living in a directory that collects things."
say "The .p8 in particular cannot be downloaded twice — move it somewhere you back up:"
say "  mkdir -p ~/.appstoreconnect/private_keys"
say "  mv '$key' ~/.appstoreconnect/private_keys/"
