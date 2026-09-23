# Signing, notarising and publishing

What has to exist for a release to open on someone else's Mac without a warning, and how to put
it in place. Everything here is one-time setup; after it, a `v*` tag is the whole release process.

Signing and notarising are **two separate credentials for two separate steps**, and having one
does not give you the other:

| Step | What it does | Needs |
| --- | --- | --- |
| **Sign** | Stamps the bundles with your identity, enables the hardened runtime, attaches an Apple timestamp | a **Developer ID Application** certificate, as a `.p12` |
| **Notarise** | Uploads to Apple, who scan and issue a ticket; the ticket is then stapled to each bundle | an **App Store Connect API key** *or* an **Apple ID + app-specific password** |

A signed-but-not-notarised build still shows Gatekeeper's "cannot be opened" dialog. Both steps
are needed, in that order.

Three bundles go through both: `SSB.component` (AU), `SSB.vst3` and `SSB.app` (standalone).

---

## The short version

One script verifies both credentials and pushes every secret (it is the same one jamin and
Waveshape use, so the values are the same too):

```
native/tools/setup-signing-secrets.sh --check      # verify only, no GitHub access needed
GH_TOKEN=github_pat_... native/tools/setup-signing-secrets.sh
```

It finds `~/Downloads/Certificates.p12` and `~/Downloads/AuthKey_*.p8` on its own, reads the key
ID out of Apple's filename, asks for the export password at a prompt (so it never reaches your
shell history or a process list), and verifies everything **before** uploading anything — a wrong
secret is worse than a missing one, because the workflow then gets far enough to look like it is
working and fails twenty minutes into a release.

There is deliberately no `gh auth login` in that flow. It takes account-wide scopes and leaves a
long-lived token in your keychain, which is a lot of standing authority to acquire in order to
write six repository secrets once. Use a fine-grained token scoped to this one repository with
the single *Secrets: Read and write* permission and a short expiry, or skip GitHub credentials
entirely with `--emit DIR` and paste the values into the web UI.

`--check` needs no GitHub access at all, which makes it the thing to run when a release fails in
the signing step and you want to know whether the credentials or the workflow is at fault.

The rest of this page is what that script does, and what to do when it complains.

---

## 1 · The signing certificate (`.p12`)

You already have `Developer ID Application: Anthony Germaneri (89NT2R3S2T)` in your login
keychain, which is why `native/tools/macos-sign.sh` works locally with no setup at all. CI has no
keychain, so it needs the identity as a file.

**Keychain Access ▸ login ▸ My Certificates**, find the Developer ID Application certificate,
expand it so the private key shows underneath, select **both rows**, right-click ▸ *Export 2
items…*, save as `identity.p12` and set an export password.

> Exporting a private key always asks for authorisation — that is macOS doing its job, and it is
> why this step cannot be scripted for you.

Then base64 it for the secret. GitHub secrets are text, and a `.p12` is not:

```
base64 -i identity.p12 | pbcopy
```

If you would rather export with `openssl` than Keychain Access, pass **`-legacy`**. OpenSSL 3
defaults to AES-256 with a SHA-256 MAC, which macOS's Security framework cannot read; the import
fails with `MAC verification failed during PKCS12 import (wrong password?)`, which is a misleading
message for a format problem.

Delete `identity.p12` once it is in the secret. It is your signing key.

---

## 2 · Notarisation credentials

**What this repository uses — an App Store Connect API key.** Scoped to notarisation, revocable
on its own, and not tied to a person's Apple ID, so it survives someone leaving or turning on a
new 2FA device.

App Store Connect ▸ **Users and Access ▸ Integrations ▸ App Store Connect API**, create a key with
the **Developer** role. You get:

- the `.p8` file — **downloadable exactly once**
- the **Key ID**, on the same row
- the **Issuer ID**, a UUID above the key list

```
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
```

The `.p8` cannot be downloaded twice. Move it somewhere backed up rather than leaving it in
`~/Downloads`, which is a directory that collects things:

```
mkdir -p ~/.appstoreconnect/private_keys && mv ~/Downloads/AuthKey_*.p8 $_
```

**Fallback — Apple ID and an app-specific password.** No extra setup, and what you already have
if you have a developer account at all. Generate an app-specific password at
[appleid.apple.com](https://appleid.apple.com) ▸ Sign-In and Security ▸ App-Specific Passwords.
It is **not** your account password, and your team ID is the ten characters in the parentheses of
your signing identity — `89NT2R3S2T`.

`macos-notarize.sh` prefers the API key when both are set.

---

## 3 · Repository secrets

`setup-signing-secrets.sh` sets these. This is what it sets, for when you would rather do it by
hand — **Settings ▸ Secrets and variables ▸ Actions ▸ New repository secret**.

| Secret | Required | What |
| --- | --- | --- |
| `MACOS_CERTIFICATE_P12` | for signing | base64 of `identity.p12` |
| `MACOS_CERTIFICATE_PASSWORD` | for signing | the export password you chose |
| `MACOS_SIGN_IDENTITY` | optional | `Developer ID Application: Anthony Germaneri (89NT2R3S2T)`. Only needed if the certificate ever shares a keychain with another Developer ID Application certificate — with one, the script finds it; with two, it refuses to guess. |
| `NOTARY_KEY_P8` | API key route | base64 of the `.p8` |
| `NOTARY_KEY_ID` | API key route | the Key ID |
| `NOTARY_ISSUER_ID` | API key route | the Issuer UUID |
| `NOTARY_APPLE_ID` | Apple ID route | your Apple ID email |
| `NOTARY_PASSWORD` | Apple ID route | the **app-specific** password |
| `NOTARY_TEAM_ID` | Apple ID route | `89NT2R3S2T` |

Set either the three `NOTARY_KEY_*` secrets or the three `NOTARY_APPLE_ID`/`PASSWORD`/`TEAM_ID`
ones — not both, unless you want the API key to win. This repository has the first three.

Nothing here breaks a fork or a pull request. The workflow asks what credentials it has before it
uses any, and a run with none still builds, validates and uploads unsigned artefacts. That is
what the `signed` / `notarised` table in each job summary is reporting.

---

## 4 · Releasing

```
git tag v0.1.0 && git push origin v0.1.0
```

That builds universal, signs, runs `auval` and `pluginval` **against the signed bundles**, notarises, staples, packages and publishes a GitHub release.

The tag has to agree with `package.json` and `project(SsbNative VERSION …)` in
`native/CMakeLists.txt`; the `Page` job checks this on tag refs and fails the run if they
disagree, because nothing else in the pipeline would notice a release labelled v0.2.0 whose
plugin reports 0.1.0 to the host.

To prove the notarisation path before a tag depends on it, run the workflow by hand: **Actions ▸
Plugins ▸ Run workflow**, with **notarize** ticked, or

```
gh workflow run 'Plugins' --repo TonyGermaneri/ssb -f notarize=true
```

Notarisation is otherwise skipped on ordinary pushes, because it is a several-minute round trip
to Apple and nothing on `main` needs a ticket.

---

## Doing it by hand

The scripts CI runs are the scripts you run; there is no workflow-only path, because a signing
path that only exists inside a workflow is a signing path you cannot debug.

```
npm run build
cmake --build native/build
native/tools/macos-sign.sh native/build/plugin

export NOTARY_KEY_PATH=~/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8
export NOTARY_KEY_ID=XXXXXXXXXX
export NOTARY_ISSUER_ID=........-....-....-....-............
export VERSION=v0.1.0
native/tools/macos-notarize.sh native/build/plugin release-zips
```

Locally the signing script uses your login keychain and imports nothing. `NOTARY_KEY_PATH` is the
local shape of the same credential CI holds base64 in `NOTARY_KEY_P8`.

---

## What "it worked" looks like

`macos-sign.sh` should report, for each of the three bundles, `valid on disk` and `satisfies its
Designated Requirement`, and then a Gatekeeper assessment of **`source=Unnotarized Developer
ID`**. That last line is the *correct* answer at that point: the signature is good and the ticket
does not exist yet.

Order matters here in a way it does not for most plugins. The build copies the page into each
bundle's `Contents/Resources/web` **after** CMake has signed it, which breaks that signature — so
`macos-sign.sh` runs last and is the signing that counts. `codesign --verify --strict` is what
catches the order being wrong: it names the added files.

Worth checking once by hand:

```
codesign -dvvv native/build/plugin/SsbInstrument_artefacts/RelWithDebInfo/AU/SSB.component \
  2>&1 | grep -E 'flags|Authority|Timestamp'
```

- `flags=0x10000(runtime)` — the hardened runtime. Without it, notarisation is rejected twenty
  minutes later inside a JSON log. SSB needs no entitlements alongside it: the page's JavaScript
  runs in WebKit's own processes, so the hardened runtime has nothing in SSB to object to.
- `Authority=Developer ID Application: …` → `Developer ID Certification Authority` → `Apple Root CA`
- `Timestamp=…` — a real Apple timestamp, not the local clock. Without one, every signature stops
  verifying the day the certificate expires rather than staying valid for what was signed while
  it was live. It needs network access, which is why signing offline appears to work.

After `macos-notarize.sh`, the assessment becomes `source=Notarized Developer ID` and
`stapler validate` passes — which is what makes the bundles open on a machine with no network.

---

## Windows

Not signed yet, so SmartScreen warns on first run. The two routes are Azure Trusted Signing
(no hardware token, per-signature billing) and a traditional OV/EV certificate on a hardware
token, which does not work in CI without a cloud HSM. Neither is wired up; the hook is the same
`steps.creds` pattern the macOS job uses.

The Windows job is `continue-on-error` while the MSVC build is being brought up, and the release
job publishes macOS alone when there is no Windows artefact to publish. Take both off once the
job goes green — from then on a Windows regression is a failure worth having.
