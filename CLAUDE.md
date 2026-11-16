# baja-apps

The gene.clinic editor: lionscript modules under `baja/` and `flexigraph/`, Python under
`py/`, the Angular shell elsewhere. Work happens on branch **`fix/motif-lanes-clickable`**,
not `main` — a fresh clone lands on the default branch, so check out that one first or the
work will look like it vanished.

## Deploying to production

**Never connect to the production server.** No SSH, no `~/.ssh/baja.pem`, no
`ubuntu@<prod-host>`, no running anything there. A change reaches production when **Jeff**
runs it, not when an agent does.

So the end of every piece of work is: commit, push, and hand over this, with the SHA filled
in:

```bash
SHA=<the commit you just pushed>
curl -fsSL "https://raw.githubusercontent.com/milton900807/baja-apps/$SHA/tools/ops/deploy-all.sh" -o /tmp/deploy-all.new \
  && head -1 /tmp/deploy-all.new | grep -q '^#!' \
  && mv /tmp/deploy-all.new ~/deploy-all.sh \
  && sudo env REF="$SHA" bash ~/deploy-all.sh
```

`deploy-all.sh` runs on the server, pulls each file from that SHA, and is idempotent.

## A changed file does not deploy unless it is listed

`deploy-all.sh` installs files named in `install_group` entries, each a `"path:marker"` pair
where the marker is text that must appear in the file. **A file you changed but did not list
stays in git and never reaches the server**, silently.

So for every change:

1. Add or extend an `install_group` in `tools/ops/deploy-all.sh`.
2. Give each file a marker that is unique to *this* change — a distinctive phrase from a
   comment you just wrote. A marker both versions share lets a stale cached copy pass the
   script's served-check.
3. Run `bash tools/ops/check-deploy-markers.sh`. It verifies every marker against the
   checkout and must print that all of them match. It has caught stale markers repeatedly:
   rewording a comment breaks its marker and silently disables that whole group.

A group is all-or-none. One missing marker and the group installs nothing, reporting
"predates the change; skipped".

## lionscript modules

Files under `baja/` and `flexigraph/` are anonymous `function (args) {...}` bodies run via
`exec(path, ...args)` — not ES modules. Verify both ways before committing:

```bash
node tools/hotfix/lioncheck.js . <files>          # name clashes with lib/core.js
node -e "const fs=require('fs');const core=fs.readFileSync('lib/core.js','utf8');
new (Object.getPrototypeOf(async function(){}).constructor)('exec','args',
  core+'\nreturn ('+fs.readFileSync('<file>','utf8')+')');console.log('ok')"
```

Some files (`baja/bio/track.js`, `compounds-editor.js`) are statement bodies rather than
expressions: drop the `return (...)` wrapper for those.

Menus: a caption is `{label, header: true}` with no `click`. A label with an empty `click`
renders as a button that does nothing when pressed.

## Commit messages

No attribution lines, no session links, no co-author trailers. Say what changed and why it
was wrong before.
