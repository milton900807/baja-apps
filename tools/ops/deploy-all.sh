#!/usr/bin/env bash
# =============================================================================
#  deploy-all.sh — put everything that is waiting on the server, on the server.
#
#  Run it ON the server:
#
#      curl -fsSL https://raw.githubusercontent.com/milton900807/baja-apps/REF/tools/ops/deploy-all.sh -o deploy-all.sh
#      sudo bash deploy-all.sh                 # the API and the lionscript modules
#      sudo bash deploy-all.sh --frontend      # those, and build and install the Angular app
#
#  WHAT IT DEPLOYS
#    1. baja-server    the fundraising endpoints, including the two-Stripe-key split,
#                      patched into dist/index.js (and src/index.ts when it is there).
#    2. baja-apps      the lionscript modules: the home screen, whose doors answer a
#                      press and open a page of their own on a phone, the fundraising
#                      console, viewer, admin and icons, and the Apps menu entries. Then
#                      Home and the funds options into the header menu, which lives in
#                      env.js on the server rather than in the bundle.
#                      And single files copied whole (step 2b): the timeline point side
#                      panel, and the editor's corner loading notification.
#    3. the frontend   (--frontend only) the Angular shell: the widget markup that stops
#                      being rebuilt several times a second, the header's authoring
#                      buttons behind one account, and the landing page that scrolls on
#                      a phone. This one is a BUILD, which the other two are not.
#
#  Every step is idempotent: run it twice and the second run says there is nothing to do.
#  Nothing is overwritten without a backup beside it.
#
#  Options:
#      --frontend          also build and install the Angular app (needs node and npm)
#      --frontend-only     only that
#      --no-menu           leave the header menu in env.js alone
#      --no-restart        leave the service alone
#      SERVER_DIR=/opt/baja-server  APPS_DIR=/opt/baja-apps  PORT=8080
#      WEB_DIR=<where the built app is served from>   SRC_DIR=<a git checkout of baja>
#      ENVJS=<path to the deployed assets/env.js>
#      REF=<git sha of baja-apps>   BRANCH=<frontend branch, default main>
# =============================================================================
set -euo pipefail

SERVER_DIR="${SERVER_DIR:-/opt/baja-server}"
APPS_DIR="${APPS_DIR:-/opt/baja-apps}"
PORT="${PORT:-8080}"
BRANCH="${BRANCH:-main}"
RAW="https://raw.githubusercontent.com/milton900807/baja-apps"
# THE COMMIT THE FILES ARE FETCHED FROM, which is not necessarily the commit this script
# came from. It cannot be: a pin can never name the commit that sets it. So bump it when
# you add a group, and fetch the script itself at the SAME commit you bump it to --
# downloading the script at an older ref hands you an older pin and the new group is
# fetched at a ref that predates it, where every marker fails and install_group skips the
# whole group with one line and a zero exit. That is not a loud failure. It reads as a
# clean run.
REF="${REF:-3b908a352d5bfc36020ee7cee765ad00397179d5}"
DO_API=1; DO_WEB=0; DO_RESTART=1; DO_MENU=1

while [[ $# -gt 0 ]]; do case "$1" in
  --frontend)      DO_WEB=1; shift ;;
  --frontend-only) DO_WEB=1; DO_API=0; shift ;;
  --no-restart)    DO_RESTART=0; shift ;;
  --no-menu)       DO_MENU=0; shift ;;
  -h|--help)       sed -n '2,35p' "$0"; exit 0 ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac; done

# WHERE THE BUILT APP LIVES. A fixed list of likely paths was not enough -- this box
# serves it from somewhere else -- so the app is found by what it IS: an index.html with
# <app-root> in it, which is the Angular shell and nothing else on a web server. The search
# is bounded to the places a site is served from, skips this script's own backups, and
# refuses to choose when it finds more than one.
find_web_dir() {
  local hits d out=() cand
  # FIRST, ASK NGINX. It is the only thing that actually knows, and on this box the answer
  # was /eln -- a directory straight off the root, which no list of likely places was ever
  # going to contain. Every root it declares that holds an Angular index.html is a
  # candidate.
  if command -v nginx >/dev/null; then
    while IFS= read -r cand; do
      [[ -n "$cand" && -f "$cand/index.html" ]] || continue
      grep -q 'app-root' "$cand/index.html" 2>/dev/null || continue
      case " ${out[*]-} " in *" $cand "*) ;; *) out+=("$cand") ;; esac
    done < <(nginx -T 2>/dev/null | sed -n 's/^[[:space:]]*root[[:space:]]\+\([^;]*\);.*/\1/p' | tr -d '"' | sort -u)
  fi
  # THEN LOOK, for a box with no nginx or a config that names no root: the app is found by
  # what it IS, an index.html with <app-root> in it, which on a web server is the Angular
  # shell and nothing else. Backups, node_modules and source trees are skipped.
  if [[ ${#out[@]} -eq 0 ]]; then
    hits="$(grep -rl --include=index.html -m1 'app-root' \
              /eln /opt /var/www /srv /usr/share/nginx /home 2>/dev/null | head -40 || true)"
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      case "$f" in *.before-*|*/node_modules/*|*/src/*) continue ;; esac
      d="$(dirname "$f")"
      case " ${out[*]-} " in *" $d "*) ;; *) out+=("$d") ;; esac
    done <<< "$hits"
  fi
  [[ ${#out[@]} -eq 1 ]] || return 1
  printf '%s' "${out[0]}"
}

say()  { printf '%s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
die()  { printf '%s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this with sudo: it writes under /opt and restarts the service."
command -v curl >/dev/null || die "curl is not installed."
command -v python3 >/dev/null || die "python3 is not installed."

TMP="$(mktemp -d)"; chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT INT TERM

say "Deploying from baja-apps ${REF:0:12}"

# ---- 1 and 2: the two installers -------------------------------------------
if [[ $DO_API -eq 1 ]]; then
  [[ -d "$SERVER_DIR" ]] || die "Not found: $SERVER_DIR  (set SERVER_DIR=…)"
  [[ -d "$APPS_DIR" ]]   || die "Not found: $APPS_DIR  (set APPS_DIR=…)"

  step "The API endpoints"
  curl -fsSL "$RAW/$REF/tools/hotfix/install-donation-endpoint.py" -o "$TMP/a.py" \
    || die "Could not download install-donation-endpoint.py"
  python3 "$TMP/a.py" "$SERVER_DIR"

  # The credit gate and the status route used to answer "is this person entitled" with two
  # different implementations, and only one of them knew about the early-access year. One
  # function answers it now, and it reads EVERY Stripe customer record at the address: Stripe
  # makes a new record per Checkout unless told to reuse one, so a payment can sit on a record
  # that is not the first one returned. A patch rather than a copy, because /opt/baja-server
  # is not a git checkout. It refuses to write anything that does not parse.
  step "The credit gate honours the early-access year, across duplicate Stripe customers"
  if curl -fsSL "$RAW/$REF/tools/hotfix/install-subscription-entitlement.py" -o "$TMP/sub.py" 2>/dev/null; then
    python3 "$TMP/sub.py" "$SERVER_DIR" || say "  Not applied (see above). Everything else carries on."
  else
    say "  install-subscription-entitlement.py is not at ${REF:0:12}; skipped."
  fi

  step "The lionscript modules"
  curl -fsSL "$RAW/$REF/tools/hotfix/install-fundraise-app.py" -o "$TMP/b.py" \
    || die "Could not download install-fundraise-app.py"
  python3 "$TMP/b.py" "$APPS_DIR"

  # The header menu lives in env.js on the server, not in the bundle: a list of labels and
  # module paths the shell execs. Adding Home and the funds options is a file edit, so it
  # happens here rather than waiting for a frontend build. Not finding env.js is a thing to
  # say and carry on from, not a reason to stop: everything above it is already installed.
  if [[ $DO_MENU -eq 1 ]]; then
    step "The header menu"
    ENVJS="${ENVJS:-}"
    if [[ -z "$ENVJS" ]]; then
      W="${WEB_DIR:-$(find_web_dir || true)}"
      for d in "$W" /eln /opt/baja/eln /opt/baja /var/www/eln /var/www/html/eln /usr/share/nginx/html/eln /srv/eln; do
        [[ -n "$d" && -f "$d/assets/env.js" ]] && { ENVJS="$d/assets/env.js"; break; }
      done
    fi
    if [[ -n "$ENVJS" ]]; then
      curl -fsSL "$RAW/$REF/tools/ops/set-menu.py" -o "$TMP/m.py" || die "Could not download set-menu.py"
      python3 "$TMP/m.py" "$ENVJS"
    else
      say "No assets/env.js found, so the menu was left alone."
      say "Find it and run:  sudo python3 set-menu.py <path to env.js>   (or set ENVJS=…)"
    fi
  fi
fi

# ---- 2b: single lionscript files, copied whole from REF ------------------------
#
#   baja/plots/point-side-panel.js, baja/plate/plate-track.js
#       a click on a timeline point opens its options in a side panel, not a modal menu
#   manchester/editor.js
#       the editor's loading screen is a small corner notification, not the newspaper
#   cpd/baja-project.js, cpd/baja-analytics.js
#       the progress bar goes up before the megabytes of code load, and tells the home
#       page's "Opening..." card it can go; Build > Add to a fundraising campaign
#   baja/manchester/menu/run-off-targets.js, run-off-target-tool.js, run-off-target-tool-seed-seq.js
#       an off-target run asks whether to rerun all compounds or only those with no result yet
#   baja/io/pdf-writer.js, baja/io/aso-report-pdf.js, manchester/io/download-hub.js
#       (and baja/chem/structure/idt/idt-format.js)
#       the detailed ASO report is drawn in the browser: a page per compound, a map of the
#       track broken into rows with the 5' and 3' ends marked, and a zoomed panel for each
#       window where compounds pile up on a variant
#       the download hub also offers an IDT order file, and the IDT formatter writes the
#       inline codes (+A, mA, rA, fA) instead of dropping or mangling them
#
# Each FILE:MARKER pair is downloaded from REF and installed only if it carries its marker,
# so a REF that predates the change is said and skipped rather than installing an older
# file over a newer one. A file that is already the same is left alone; one that differs is
# kept beside the new one as <file>.before-<stamp>.
if [[ $DO_API -eq 1 ]]; then
  step "Lionscript files"
  FL_STAMP="$(date +%Y%m%d%H%M%S)"
  SERVED_CHECK=()
  install_group() {   # install_group "label" file:marker ...  (all or none)
    local label="$1"; shift
    local pair f mk src dst owner i=0
    for pair in "$@"; do
      f="${pair%%:*}"; mk="${pair#*:}"; src="$TMP/fl.$i"; i=$((i+1))
      # ONE FILE PER ENTRY. Several paths were once packed into a single entry separated
      # by spaces; everything before the first colon is the path, so that became one
      # filename with spaces in it, the fetch missed, and the group returned 0 -- a whole
      # feature skipped on every run, saying only that it was not at the ref. A malformed
      # entry is a mistake in this script and has to read like one.
      case "$f" in *" "*) say "  $label: MALFORMED entry '$f' -- one file per entry; skipped."; return 0 ;; esac
      curl -fsSL "$RAW/$REF/$f" -o "$src" 2>/dev/null || { say "  $label: $f is not at ${REF:0:12}; skipped."; return 0; }
      grep -q -- "$mk" "$src" || { say "  $label: $f at ${REF:0:12} predates the change; skipped."; return 0; }
    done
    i=0
    for pair in "$@"; do
      f="${pair%%:*}"; mk="${pair#*:}"; src="$TMP/fl.$i"; dst="$APPS_DIR/$f"; i=$((i+1))
      if [[ -f "$dst" ]] && cmp -s "$src" "$dst"; then say "  $f: already current"; continue; fi
      mkdir -p "$(dirname "$dst")"
      if [[ -f "$dst" ]]; then
        cp -p "$dst" "$dst.before-$FL_STAMP"; owner="$(stat -c '%u:%g' "$dst")"
      else
        owner="$(stat -c '%u:%g' "$(dirname "$dst")")"
      fi
      cp "$src" "$dst"; chmod 644 "$dst"; chown "$owner" "$dst" 2>/dev/null || true
      say "  $f: installed"
      # Remember it, so the end of this run can ask the SERVER for it and find out whether
      # what it serves is what we just wrote. See "Proving the server serves it".
      SERVED_CHECK+=("$f|$mk")
    done
  }
  # The AI credit meter asked a marker directory, not Stripe, and an unset $LJLSUBSCRIPTIONS
  # read as "not subscribed" -- so every paying user was metered against the free allowance,
  # refused inside python before the server's own gate was consulted. Both files go together:
  # the meter now asks the server and treats could-not-ask as "do not meter", which needs
  # works.py able to SAY it cannot answer.
  install_group "the AI credit meter asks the server, not a marker directory" \
    "py/ion-lib/claude_usage.py:WHERE THE SUBSCRIPTION ANSWER COMES FROM" \
    "py/ion-lib/ion/works.py:NONE IS NOT NO, and the difference is the whole point"

  install_group "timeline side panel" \
    "baja/plots/point-side-panel.js:baja-point-side-panel" \
    "baja/plate/plate-track.js:point-side-panel"
  install_group "editor: rescue tracks keep each VCF apart" \
    "baja/data/load-transcripts-with-variants.js:GROUPED VARIANTS KEEP THEIR OWN TRACKS HERE TOO"
  install_group "a menu caption is a caption, not a button that does nothing" \
    "baja/manchester/menu/design-or-place.js:A CAPTION, NOT A ROW" \
    "baja/bio/rbp/rbp-competition.js:Captions, not rows" \
    "baja/manchester/menu/compound-ai-filter.js:Captions, not rows" \
    "baja/manchester/menu/map-off-targets.js:Captions, not rows" \
    "baja/manchester/menu/selected-sequence-menu.js:header: true" \
    "baja/manchester/menu/snp-menu.js:HIDE INFO, AND ONLY WHILE THERE IS SOMETHING TO HIDE" \
    "baja/manchester/menu/track-layers-side-menu.js:header: true" \
    "baja/manchester/menu/menu-for-single-aso.js:header: true" \
    "baja/manchester/menu/allele-selective-design.js:header: true" \
    "baja/bio/splicing/clinvar-splice-variants.js:header: true" \
    "baja/data/rnaseq-hierarchy-menu.js:header: true" \
    "baja/manchester/menu/sample-compare.js:header: true"
  install_group "the draw menu opens on the release, not the press" \
    "baja/manchester/menu/draw-oligos.js:THE PRESS LOCKS THE WINDOW"
  install_group "a tool that owns the canvas keeps its clicks" \
    "flexigraph/gene.js:A TOOL OWNS THE CANVAS ONLY WHILE ITS LISTENERS DO" \
    "baja/manchester/menu/draw-oligos.js:THIS TOOL OWNS THE CANVAS"
  install_group "the hover handler does not take the first click" \
    "baja/manchester/menu/design-or-place.js:THE HOVER HANDLER WOULD TAKE THE FIRST CLICK" \
    "baja/manchester/menu/design-or-place.js:AND THE SELECTION WOULD TAKE IT BEFORE ANY LISTENER SAW IT"
  install_group "the built chemistry is actually used" \
    "baja/manchester/menu/chemistry-builder.js:THE TYPE DECIDES WHETHER THE TEMPLATE IS READ AT ALL"
  install_group "a chemistry editor, not two canned templates" \
    "baja/manchester/menu/chemistry-builder.js:BUILD A COMPOUND'S CHEMISTRY" \
    "baja/manchester/menu/design-or-place.js:Build a chemistry"
  install_group "place an ASO by hand, or design across the target" \
    "baja/manchester/menu/design-or-place.js:DESIGN THE SITE, OR CHOOSE THE SITE YOURSELF" \
    "baja/manchester/menu/track-design-menu.js:PLACE IT, OR DESIGN IT"
  install_group "analyse and map off-targets from the selection page" \
    "flexigraph/gene.js:WHAT THE SCREEN FOUND, once it has been run" \
    "baja/manchester/menu/map-off-targets.js:PUT THE COMPOUND ON THE GENE IT SHOULDN"
  install_group "open an off-target gene from the table, where coordinates were kept" \
    "baja/manchester/menu/selected-off-target-genes.js:WHICH ONES CAN BE PUT ON THE GENE" \
    "baja/manchester/menu/map-off-targets.js:ONE GENE, NAMED BY THE CALLER"
  install_group "off-target genes of the selected compounds, with downloads" \
    "baja/manchester/menu/selected-off-target-genes.js:THE OFF-TARGET GENES OF THE SELECTED COMPOUNDS" \
    "baja/manchester/menu/compound-editor.js:WHICH GENES, not how many"
  install_group "filter compounds by description (AI), on one shared definition" \
    "baja/bio/compound-filter.js:WHAT A COMPOUND FILTER MEANS, in one place" \
    "py/bio/compounds/filter-prompt.py:THE MODEL DOES NOT JUDGE ANY COMPOUND" \
    "baja/manchester/menu/compound-ai-filter.js:FILTER THE COMPOUNDS BY DESCRIBING THEM" \
    "baja/manchester/menu/select-compounds-by.js:ONE DEFINITION OF WHAT THESE WORDS MEAN" \
    "baja/manchester/menu/track-design-menu.js:Filter by description"
  install_group "select compounds by criteria" \
    "baja/manchester/menu/select-compounds-by.js:SELECT COMPOUNDS BY WHAT THEY ARE" \
    "baja/manchester/menu/compounds-editor.js:Select by criteria" \
    "baja/manchester/menu/mouse-over-highlight.js:Scoped to this track, since that is the set"
  install_group "select the flagged compounds on their own" \
    "baja/manchester/menu/compounds-editor.js:Select warnings only (red)" \
    "baja/manchester/menu/mouse-over-highlight.js:THE RED ONES ON THEIR OWN"
  install_group "ASO warnings hide when the compound is too narrow to carry them" \
    "flexigraph/oligo.js:ONLY WHILE THERE IS ROOM FOR IT"
  install_group "designers say why they refused, instead of answering with nothing" \
    "py/ssaso/design-steric-blocking.py:A RAISE HERE REACHED THE CLIENT AS NOTHING AT ALL" \
    "py/ssaso/design.py:A RAISE HERE REACHED THE CLIENT AS NOTHING AT ALL" \
    "py/sirna/design.py:A RAISE HERE REACHED THE CLIENT AS NOTHING AT ALL" \
    "baja/manchester/menu/track-design-menu.js:THE DESIGNER'S OWN REASON, SHOWN" \
    "baja/manchester/menu/aso-design-dialog.js:CHECKED HERE, WHERE THE NUMBER WAS TYPED"
  install_group "Select all is a button, and listening before the list loads" \
    "baja/lib/shelf.js:BUTTONS, NOT ANCHORS" \
    "baja/bio/rbp/rbp-profile.js:Buttons rather than anchors"
  install_group "selected sequence: microRNA site scan, and a Data submenu" \
    "baja/bio/mirna/mirna-seeds.js:MIRNA SEEDS, AND THE SITE CLASSES THEY MAKE" \
    "baja/bio/mirna/mirna-sites.js:MICRORNA SITES IN A SELECTED STRETCH" \
    "baja/manchester/menu/selected-sequence-menu.js:The same datasets the Data toolbar loads"
  install_group "selected sequence: ML menu, and which RBP wins the stretch" \
    "baja/manchester/menu/selected-sequence-menu.js:The models that take a SPAN" \
    "baja/bio/rbp/rbp-competition.js:WHICH RBP WINS THIS STRETCH" \
    "py/bio/rbp/rbp-competition.py:WHY A COMPETITION RATHER THAN A SCORE"
  install_group "cis-regulatory: a bin too small to scramble is said, not swallowed" \
    "baja/bio/splicing/cis-attribution.js:THE SMALLEST BIN THAT MEASURES ANYTHING" \
    "py/bio/splice/cis-profile.py:The smallest bin that measures anything"
  # THE MARKERS HERE MOVED when the Exon -> AI Models list stopped being inline. This group
  # was written against the inline copy in each file -- "in place of the old LJSplice v2
  # window" in editor.js, openMenuAtPointer(__bajaSplice in menu-factory.js -- and neither
  # phrase exists any more: both files now call baja/bio/splicing/exon-ai-models.js, which
  # is the one definition of that list. Left as they were, both markers fail and this group
  # skips silently, which is the failure this file keeps being bitten by.
  #
  # The guarantee is unchanged: these two files reach the box offering BajaSplice rather
  # than LJSplice v2. It is just carried by the call now, so the markers name the call.
  # That makes this group a narrower repeat of "BajaSplice on an exon", which ships the
  # same two files plus the module and the python behind it -- kept rather than deleted
  # because a group that re-asserts a guarantee costs one curl and removing one is a
  # judgement about someone else's intent.
  install_group "BajaSplice in place of LJSplice v2, opened at the pointer" \
    "manchester/editor.js:exec('baja/bio/splicing/exon-ai-models.js'" \
    "baja/manchester/menu/menu-factory.js:exec('baja/bio/splicing/exon-ai-models.js'"
  install_group "editor loading notice" \
    "manchester/editor.js:baja-loading-notice"
  # Ask: the toolbar box, the catalogue of operations it may choose from, the planner that
  # chooses, and the answerer for questions. ONE GROUP, because they only work together:
  # the box reads the catalogue by path and calls both scripts by path, the planner is
  # handed the catalogue rather than carrying its own copy, and an editor.js offering the
  # button without the rest is a button that errors. Splitting them would let a half
  # install pass its served-check and fail on the first click.
  # Find published miRs: the shelf card, the reader that aggregates miRTarBase over the
  # track, and the model that says what is published about each entry. All three, because
  # the card calls the reader by path and the reader calls the script by path.
  # A menu row with nothing behind it is drawn as a caption, not a button. Both DOM menu
  # renderers, because a list is handed to whichever one the context picks and the two
  # disagreeing about what a row is would be worse than either one being wrong.
  # Off-target criteria in the compound filter. The markers here are phrases from THIS
  # change, not the ones the older groups match: those are shared by both versions, so a
  # stale cached copy would pass the served-check and the new criteria would silently not
  # be there. All four files, because the contract, the two UIs that fill it and the
  # script that fills it from a sentence have to agree on what the fields mean.
  # Exporting compounds to a file: the exporter and the catalogue entry that reaches it.
  # The IDT code table. Ships with the exporter that calls formatStrict: an export-compounds
  # that calls it against an idt-format without it writes no codes at all.
  # Down arrows marking where compounds sit. The shape lives in the draw registry, the
  # module that creates the annotations calls it by type, and the catalogue reaches the
  # module: an annotation of a type the registry does not know draws nothing at all.
  # "load dnm1": ask whether that is a gene or a file, with both as things to click.
  # editor.js moves with it because the toolbar's own no-track guard had to go: loading is
  # the one request that needs no track, and it was the one the box would not take.
  install_group "load by name" \
    "baja/manchester/menu/load-by-name.js:IS THAT A GENE OR A FILE" \
    "baja/manchester/menu/editor-capabilities.js:load_by_name" \
    "baja/manchester/menu/editor-command.js:NO TRACK IS NOT A REASON TO REFUSE TO OPEN" \
    "manchester/editor.js:No track check here"
  install_group "show compound locations" \
    "flexigraph/gene-draw.js:BIG, OUTLINED, AND ONE" \
    "flexigraph/gene-draw2.js:the same mark flexigraph/gene-draw.js draws" \
    "baja/manchester/menu/mark-compound-locations.js:ANNOTATION HAS TO BE ASKED FOR" \
    "baja/manchester/menu/editor-capabilities.js:HIGHLIGHT THE COMPOUNDS"
  # "create mRNA track from DNM3" was refused as not something the editor can do, while the
  # track menu had offered Convert to mRNA all along. Both were right: the planner is handed
  # editor-capabilities.js as its entire vocabulary, so an operation missing from that file
  # cannot be reached from the box however plainly it is asked for.
  #
  # ONE FILE, and the marker is the new capability's own name rather than a phrase the older
  # groups already match. Those are shared by both versions of the file, so a box still
  # holding the 25-operation copy would pass their served-check and the box would go on
  # refusing the request with nothing to show why.
  install_group "Ask: splice a track into an mRNA" \
    "baja/manchester/menu/editor-capabilities.js:convert_to_mrna"
  # A request in flight has to look like one: the only sign was grey 12px text, so a slow
  # answer read as a box that had ignored Enter -- and a second Enter execs a second copy of
  # the module, which used to start a second request beside the first.
  install_group "the command box shows that it is working" \
    "baja/manchester/menu/editor-command.js:ONE REQUEST AT A TIME, ACROSS INSTANCES"
  install_group "pick which steps of a plan to run" \
    "baja/manchester/menu/editor-command.js:THE BUTTON SAYS GO, and the step count rides along"
  install_group "the command box is a box you type in" \
    "baja/manchester/menu/editor-command.js:NO BUTTONS. Enter sends it"
  # The project's command field keeps taking formulas exactly as before; a SENTENCE is now
  # matched against the app's own live menubar and the item that does it is offered. Three
  # files, all or none: the router decides which path the text takes, the panel asks and
  # offers, and the python picks an index out of the menu it is given.
  # plate.js was in no install_group at all, so a change to it stayed in git. Resizing is
  # now the right and bottom edges only: the old hit region was a 60px square on the
  # bottom-right corner, reaching 30px inside the table, so working in the last column or row
  # started a resize instead.
  # Typing into a cell can now be read as an instruction instead of stored as a value, with
  # Save text still first so Ctrl+Enter is unchanged and nothing can run by accident.
  install_group "a table resizes from its edges; a cell can be told what to do" \
    "baja/plate/plate.js:NO DEBUG PRINTING FROM A ROW DELETE" \
    "baja/plate/ops/diagnose-formula.js:WHY A CELL IS RED, AND WHAT WOULD FIX IT" \
    "baja/plate/ops/format-cells.js:HOW THE SELECTED CELLS ARE SHOWN" \
    "baja/plate/ops/derive-from-new-table.js:OPEN AT THE BOTTOM" \
    "baja/plate/ops/new-timeline.js:A NAME GIVEN IN THE REQUEST IS USED" \
    "baja/draw/place-timeline-with-time-range.js:A NAME THAT WAS ALREADY GIVEN IS NOT ASKED FOR AGAIN" \
    "baja/plate/ops/timeline-add.js:A DATE, OR A DATE AND A TIME" \
    "baja/plate/ops/timeline-pick.js:WHICH TIMELINE A REQUEST IS ABOUT, WORKED OUT ONCE" \
    "baja/plate/ops/timeline-range.js:ONLY WHAT IS VISIBLE NOW CAN BE HIDDEN BY THIS" \
    "baja/plate/menu/is-sentence.js:IS THIS A REQUEST, OR IS IT A FORMULA" \
    "cpd/main-timeline.js:A PROMPT BOX OF ITS OWN, UNDER THE BAR" \
    "manchester/controls/navigation-panel-plates2.js:PUBLISHED ON THE TRACK"

  # A panel over the canvas used to let its clicks through: the canvas takes presses from
  # its own element but releases from the window, so a button pressed on a panel moved
  # what was underneath, and the click that dismissed it landed out there afterwards.
  # prompt-text.js has never been listed here, so until now a change to it never shipped.
  # The table carries the same Ask button the timeline does, and the first thing asked
  # through it -- a cell that totals another table -- had no operation behind it.
  install_group "a table can be asked for things from its own bar" \
    "baja/plate/ops/table-ask.js:ASKING A TABLE FOR SOMETHING, FROM ITS OWN TITLE BAR" \
    "baja/plate/ops/cell-from-table.js:A TABLE WITH NO NUMBERS IN IT IS COUNTED, NOT REFUSED" \
    "baja/plate/ops/frun-object.js:THE LEADING '=' IS NOT PART OF THE EXPRESSION" \
    "baja/plate/ops/resolve-missing-references.js:count_rows" \
    "baja/plate/menu/project-capabilities.js:WHERE THE ROWS GO"

  # Far out, a table is a bar with a name on it and its menu offered no way to simply go
  # and look at it. And the canvas behind a maximized object was still taking presses
  # through the backdrop, at its own world coordinates.
  install_group "zoom into a table from its bar; a maximized object keeps the clicks" \
    "baja/plate/plate-track.js:A FORMULA THAT IS ONLY WAITING ITS TURN IS NOT A BROKEN ONE" \
    "baja/plate/timeline-track.js:A TABLE NAME IS WHATEVER IS IN FRONT OF THE BRACKETS" \
    "baja/plate/plate-track-view.js:A TABLE NAME IS WHATEVER IS IN FRONT OF THE BRACKETS"

  # prompt() and infoPrompt() live in core.js, which has never been listed here: their
  # Cancel and Close were clicks the canvas got as well.
  # "Create mRNA from DNM1" found nothing: the item existed in two right-click menus and
  # not in the catalogue the typed command reads from.
  install_group "the editor can be asked to build an mRNA" \
    "baja/bio/orfs/make-mrna.js:BUILD THE SPLICED TRANSCRIPT AS A TRACK OF ITS OWN" \
    "baja/manchester/menu/editor-capabilities.js:THE SPLICED TRANSCRIPT, AS A TRACK" \
    "baja/manchester/menu/edit-current-track.js:One builder, in baja/bio/orfs/make-mrna.js" \
    "baja/manchester/menu/edit-track.js:One builder, in baja/bio/orfs/make-mrna.js"

  install_group "a core dialog keeps its own clicks" \
    "lib/core.js:A PANEL OVER THE CANVAS KEEPS ITS OWN MOUSE EVENTS"
  # The spinner was being added one caller at a time, and the ones nobody had got to yet
  # still ran in silence. Every server call goes through core's exec, so it is answered
  # there: one place, every tool, including the ones not written yet.
  install_group "Every server call that takes time says so" \
    "lib/core.js:EVERY SERVER CALL THAT TAKES TIME SAYS SO, WHEREVER IT WAS STARTED FROM"

  install_group "a panel over the canvas keeps its clicks to itself" \
    "baja/lib/modal-shield.js:MOVING THE MOUSE IS A MOUSE EVENT TOO" \
    "baja/lib/prompt-text.js:NOTHING PRESSED IN HERE REACHES THE CANVAS"

  install_group "a sentence in the project command field does it, or opens where it is done" \
    "flexigraph/plot.js:A BUTTON ON THE TIMELINE'S FRAME, NEXT TO MAXIMIZE" \
    "baja/plate/ops/timeline-ask.js:WHAT THIS WAS ASKED FROM" \
    "baja/plate/menu/project-command.js:A FORMULA IS NOT A REQUEST TO BE INTERPRETED" \
    "baja/plate/ops/set-formula.js:open the cell to see why" \
    "baja/plate/ops/focus-object.js:pick-canvas-object.js, which every operation" \
    "baja/plate/ops/pick-canvas-object.js:ONE ANSWER TO \"WHICH ONE?\", FOR ANYTHING ON THE CANVAS" \
    "baja/plate/ops/share-object.js:SHARE THIS\" OPENS THE SHARE DIALOG. IT DOES NOT SHARE ANYTHING" \
    "baja/plate/collab/share-for-coediting.js:THE SAME SERIALIZER AS EVERY OTHER SAVE" \
    "baja/plate/collab/workbook-json.js:A REPEATED REFERENCE IS NOT A CYCLE" \
    "baja/plate/collab/collab-session.js:AN EMPTY WORKBOOK IS NEVER SENT OVER A FULL ONE" \
    "baja/plate/ops/table-size.js:WHAT POINTS AT THE ROWS THAT ARE GOING" \
    "baja/plate/ops/shift-formulas.js:DELETING ROWS IS THE SAME MOVE BACKWARDS" \
    "baja/plate/ops/fill-table.js:FILLING A TABLE THAT ALREADY HAS ITS COLUMNS" \
    "baja/plate/ops/change-values.js:ARITHMETIC ON THE CELLS THAT ARE SELECTED" \
    "baja/plate/ops/calendar-import.js:A CALENDAR ON A TIMELINE" \
    "baja/plate/ops/text-to-timeline.js:MILESTONES AND INTERVALS READ OUT OF TEXT" \
    "baja/plate/ops/gmail-connect.js:A FAILED CALL IS NOT A RESULT" \
    "baja/plate/ops/gmail-to-timeline.js:THE FIRST REASON IS KEPT" \
    "py/bio/project/text-events.py:each event resolves against ITS" \
    "py/bio/project/ical-read.py:WHY ICS AND NOT A GOOGLE SIGN-IN" \
    "py/bio/project/table-fill.py:THE TABLE'S OWN COLUMNS ARE THE SHAPE" \
    "baja/plate/menu/project-capabilities.js:SHARING IS A DIALOG, NOT AN ACT" \
    "baja/plate/ops/new-table.js:WELL.JS FIRST" \
    "baja/plate/ops/show-new-object.js:PUT WHAT WAS JUST MADE ON SCREEN" \
    "baja/plate/ops/rename-table.js:RENAME A TABLE, AND EVERY FORMULA THAT NAMES IT" \
    "baja/plate/ops/set-column-values.js:const IO = await exec" \
    "baja/plate/ops/shift-column-values.js:MOVE WHAT IS ALREADY IN A COLUMN" \
    "baja/plate/ops/column-io.js:THE TABLE WHOSE OWN ASK BUTTON WAS PRESSED" \
    "baja/plate/ops/rearrange-column.js:THE VALUES REVERSE AND THE CELLS THEY SIT IN" \
    "baja/plate/ops/move-column.js:WHOLE COLUMNS, COPIED ONTO ANOTHER" \
    "py/bio/project/menu-pick.py:ARE THINGS THE USER CAN SEE"
  install_group "IDT codes: an explicit sugar table" \
    "baja/chem/structure/idt/idt-format.js:THE SUGAR TABLE. One place, and nothing outside it is guessed" \
    "baja/manchester/menu/export-compounds.js:formatStrict, not format"
  install_group "export compounds" \
    "baja/manchester/menu/export-compounds.js:IT REPORTS WHAT IT COULD NOT WRITE" \
    "baja/manchester/menu/editor-capabilities.js:THE SKIPPED ONES ARE NAMED"
  install_group "compound filter: off-target counts" \
    "baja/bio/compound-filter.js:SCREENED-AND-ZERO IS NOT THE SAME AS NEVER-SCREENED" \
    "baja/manchester/menu/editor-capabilities.js:never swept up by one" \
    "baja/manchester/menu/select-compounds-by.js:Off-target sites" \
    "py/bio/compounds/filter-prompt.py:off-target SITES: places in the genome the oligo hits"
  install_group "menu rows with no action are captions" \
    "baja/manchester/menu/floating-menu.js:WHAT IS A CAPTION RATHER THAN A BUTTON" \
    "baja/manchester/menu/popup-menu.js:A ROW WITH NOTHING BEHIND IT IS NOT A BUTTON"
  install_group "Find published miRs" \
    "baja/data/data-resources-library.js:First, because it answers the question the other two" \
    "baja/data/find-published-mirs.js:THE REASON FOR THAT LINE" \
    "py/bio/mirna/published-mirs.py:THE MODEL NEVER SUPPLIES A miRNA, A SITE OR A SEQUENCE"
  install_group "Ask: plan against the editor's own catalogue of operations" \
    "manchester/editor.js:THE TOOLBAR IS THE COMMAND BOX" \
    "baja/manchester/menu/editor-command.js:ASK: SAY WHAT YOU WANT DONE" \
    "baja/manchester/menu/editor-capabilities.js:WHAT THE EDITOR CAN BE ASKED TO DO, DECLARED" \
    "baja/bio/track-regions.js:COORDINATES ARE GENOMIC ORDER, ORIENTATION IS NOT" \
    "py/bio/editor/plan.py:THE CATALOGUE IS SENT IN, NOT WRITTEN HERE" \
    "py/bio/editor/variant-question.py:EVERY VERDICT IS INDEXED, NOT NAMED"
  install_group "Ask: a shelf instead of a dead end, and copying a track" \
    "baja/manchester/menu/editor-command.js:A SHELF BEATS A REFUSAL, AND THE CATALOGUE ALREADY SAYS SO" \
    "py/bio/editor/plan.py:A NAME YOU CANNOT PLACE IS THE STRONGEST REASON TO OPEN THE SHELF" \
    "baja/manchester/menu/editor-capabilities.js:COPYING A TRACK IS AN ORDINARY THING TO WANT" \
    "baja/bio/copy-track.js:COPY A TRACK, AS ITS OWN TRACK ON THE CANVAS" \
    "baja/bio/track-flexi.js:A COPY OF THIS TRACK, SEPARATE FROM IT"
  install_group "baja-project: progress bar first, Add to a fundraising campaign" \
    "cpd/baja-project.js:__bajaOpening"
  install_group "baja-analytics: progress bar first" \
    "cpd/baja-analytics.js:__bajaOpening"
  # Off-targets: rerun all, or only the compounds that have no off-target result yet. The
  # three runners are independent of one another, so each is its own group.
  install_group "off-targets: rerun all or only compounds without (editor runner)" \
    "baja/manchester/menu/run-off-targets.js:__hasOffResult"
  install_group "off-targets: rerun all or only compounds without (tool panel)" \
    "baja/manchester/menu/run-off-target-tool.js:onlyMissing"
  install_group "off-targets: rerun all or only compounds without (seed tool panel)" \
    "baja/manchester/menu/run-off-target-tool-seed-seq.js:onlyMissing"
  # The detailed ASO report. All three together: the hub calls the report module, which
  # needs the page builder the writer only gained for this.
  install_group "detailed ASO report with a track map" \
    "baja/io/pdf-writer.js:the low-level page builder" \
    "baja/io/aso-report-pdf.js:THE DETAILED ASO REPORT, drawn rather than tabulated" \
    "manchester/io/download-hub.js:aso-report-pdf.js"
  # The IDT order file. The hub is in the group above as well; whichever group gets there
  # first installs it and the other reports it current.
  install_group "IDT order file, and the IDT inline modification codes" \
    "baja/chem/structure/idt/idt-format.js:WHAT IS NOT IN THIS TABLE IS REFUSED, NOT GUESSED" \
    "manchester/io/download-hub.js:IDT order file"
  # The Research panel: Home > Tools > Research reads the indication-market store rather
  # than running any research. All four or none, so Home never gets a live tile with
  # nothing behind it.
  # THE VARIANT'S STRAND, in every path that writes an allele into a sequence an oligo is
  # built from. A record that arrived by genomic coordinate carries only the plus-strand
  # alleles, and those were being written into transcript-orientation windows uncomplemented:
  # right flanks, one wrong base, and an oligo matching neither allele at the only position
  # that discriminates. All four together or none.
  # Protein residue indexing: parse_p hands back a 0-based index rather than the HGVS
  # number, so no consumer writes its own -1. The HGVS number itself is unchanged.
  # The residue number under the amino-acid row. Both files or neither: they are the two
  # halves of the same ORF builder and they must agree on the base.
  # The exon menu answers only a click near the line the exon is drawn on. Same two files
  # as the residue numbering, so they travel together.
  # The exon hover and its menu: annHit was transforming the pointer's SCREEN y through
  # graph.Y(), which maps world to screen, so the hit band landed mirrored about the
  # origin and the menu opened from well above the bar.
  install_group "exon hover hit test" \
    "baja/manchester/menu/mouse-over-highlight.js:BOTH SIDES IN SCREEN PIXELS"
  install_group "exon click target" \
    "baja/bio/track.js:THE DRAWN SHAPE, and never the row above it" \
    "baja/bio/track-flexi.js:THE DRAWN SHAPE, and never the row above it" \
    "baja/manchester/menu/annotation/edit-exon.js:has to be ON the exon" \
    "baja/manchester/menu/annotation/edit-exons.js:has to be ON the exon" \
    "baja/manchester/menu/annotation/edit.js:has to be ON the exon" \
    "baja/manchester/menu/annotation/exon-inclusion-scan-.js:has to be ON the exon" \
    "baja/manchester/menu/protein-menu-options.js:has to be ON the exon"
  install_group "peptide residue numbering" \
    "baja/bio/track.js:0-BASED, like every other builder of cdsi" \
    "baja/bio/track-flexi.js:0-BASED, like every other builder of cdsi"
  install_group "protein residue indexing" \
    "py/bio/genetic-file.py:return {\"ref\": ref, \"index\": n - 1"
  install_group "no green per-base overlay on a compound with beads" \
    "flexigraph/oligo.js:SUPERSEDED FOR THE POLYMER TYPES"
  install_group "no duplicate sequence label beside a lettered compound" \
    "flexigraph/chem-draw.js:WHETHER THE LETTERS ARE ALREADY ON THE COMPOUND" \
    "flexigraph/oligo.js:__lettersOnBeads" \
    "flexigraph/sirna.js:__lettersOnBeads"
  install_group "track-wide allele design: drop candidates that bind both copies" \
    "py/ssaso/design.py:THE HONEST TEST OF ALLELE SELECTIVITY" \
    "baja/manchester/menu/design-scope-from-workbench.js:THE SEQUENCE AS DESIGNED, and the same window UNTOUCHED" \
    "baja/manchester/menu/track-design-menu.js:AND THE COPY THAT HAS TO SURVIVE"
  install_group "a register that spans a deletion covers one more track base" \
    "baja/manchester/annotation/tile-variant.js:WHERE THIS REGISTER SITS ON THE TRACK"
  install_group "a compound that spans an applied deletion" \
    "flexigraph/chem-draw.js:A COMPOUND THAT SPANS AN APPLIED DELETION" \
    "baja/bio/track.js:HOW MANY TRACK BASES THIS COMPOUND COVERS" \
    "baja/bio/track-flexi.js:shorter than its own genomic footprint"
  install_group "allele-selective design: say how many registers were possible" \
    "baja/bio/repeat-context.js:THE REPEAT A VARIANT SITS IN" \
    "baja/manchester/menu/allele-selective-design.js:THE SEQUENCE CONTEXT THAT DECIDES HOW MANY REGISTERS CAN EXIST" \
    "baja/manchester/annotation/tile-variant.js:WHY they read the same on both copies"
  install_group "allele-selective design: a track that already carries the variant" \
    "baja/bio/track-strand.js:THE TRACK MAY HOLD THE VARIANT RATHER THAN THE REFERENCE" \
    "baja/manchester/menu/allele-selective-design.js:WHEN THE TRACK IS THE MUTANT"
  install_group "allele-selective design: the variant's strand" \
    "baja/bio/track-strand.js:allelesInFrame" \
    "baja/manchester/menu/allele-selective-design.js:allelesInFrame" \
    "baja/manchester/annotation/tile-variant.js:AND WHICH STRAND THE RECORD IS WRITTEN ON" \
    "py/bio/allele-selective-targets.py:def context_for("
  # Linear motifs (ELM) on a peptide track, and what a variant does to them.
  # All seven or none: the catalogue entry and the track menu would both open onto a
  # layer that is not there, and the layer would call a scan that is not there.
  #
  # The three baja/bio/protein files used to share one pair, space-joined before the
  # marker. install_group reads everything left of the first colon as ONE filename, so
  # that pair asked for a path with spaces in it, the download failed, and the whole
  # group took the "not at REF; skipped" branch -- silently, every run, which is why
  # models-catalogue.js never reached the server. One pair per file, each with a marker
  # of its own.
  install_group "linear motifs (ELM)" \
    "baja/bio/protein/slim-motif-layer.js:SHORT LINEAR MOTIFS AS A LAYER" \
    "baja/bio/protein/slim-motif-panel.js:The description window for one linear motif" \
    "py/bio/protein/motif-lookup.py:Describe one ELM motif class when the catalogue has no description" \
    "baja/bio/protein/motif-impact.js:MOTIF IMPACT OF ONE MISSENSE VARIANT" \
    "py/bio/protein/slim-scan.py:SLIM scan -- short linear motifs" \
    "baja/manchester/menu/mouse-over-highlight.js:LINEAR MOTIFS (ELM), the sibling" \
    "baja/ml/models-catalogue.js:title: 'Linear motifs', badge: 'ELM', ready: true"
  # Transposons / repeats on a track, under Data -> Repeats. The loader asks Ensembl for
  # the elements over the track's region and labels each sense or antisense TO THE GENE,
  # which is the field that matters: an antisense SINE presents a poly-T tract that reads
  # as a polypyrimidine tract, so a cryptic 3' splice site can be selected downstream of
  # it, and the same element the other way round does not do that.
  #
  # This group is larger than the feature because of what it found: of the ten scripts the
  # Data toolbar opens, exactly one was under deploy management. The rest are whatever the
  # original install left on the box, drifting from git ever since. Shipping the new
  # toolbar alone would point its OTHER items at those stale copies, so the toolbar moves
  # together with everything it opens. That is the point of the group, and it is a bigger
  # change than adding a menu entry: it brings the whole Data menu up to date at once.
  install_group "repeats track and the Data menu it joins" \
    "baja/data/repeat-track.js:Transposable elements and repeats on a track, as annotations" \
    "py/bio/repeats/ensembl-repeats.py:Repeat / transposable-element features for a region, from Ensembl" \
    "baja/data/data-loading-toolbar.js:Data toolbar (menu bar) docked in the button panel" \
    "baja/data/bed-hits.js:Transcript-keyed BED hits" \
    "baja/data/layer-sets.js:Every /bd/ interval dataset that can be dropped onto a track as a layer" \
    "baja/data/load-variants.js:Load variants from a major variant database" \
    "baja/data/patents.js:Patents — click a track, read patent_hg38_transcript_hits.bed.gz" \
    "baja/data/rnaseq-library.js:RNASeq Library — every RNASeq dataset under BIG_DATA/RNASeq" \
    "baja/lib/shelf.js:Reusable \"bookshelf\" overlay" \
    "baja/manchester/menu/protein-domains.js:Protein Domains: prompt the user to SELECT A TRACK" \
    "baja/manchester/menu/track-layers-side-menu.js:MENUS AT THE POINTER, NOT IN THE CORNER"

  # BajaSplice under Exon -> AI Models: splice-site strength, PSI, the cis-regulatory
  # windows at the acceptor and at the donor, and intron retention. The submenu replaces
  # the old LJSplice v2 window, which posted to /ljdonor TF-serving; these run through
  # exec into bajasplice-lib instead. None of this chain had ever been installed, which
  # is why the server still offered LJSplice: the code was in git, not on the box.
  # The list itself now lives in ONE file, baja/bio/splicing/exon-ai-models.js, which both
  # menu-factory.js and manchester/editor.js call. It had been inlined in both, and only
  # menu-factory.js was updated to BajaSplice -- while editor.js is the copy that actually
  # ships, so the editor kept offering LJSplice v2.
  # All of them or none: editor.js calling a module that is not there breaks the exon menu,
  # and a menu entry whose script is missing is worse than no entry.
  install_group "BajaSplice on an exon" \
    "baja/bio/splicing/exon-ai-models.js:FRAME, STATED BEFORE THE MODELS ARE RUN" \
    "baja/manchester/menu/menu-factory.js:exec('baja/bio/splicing/exon-ai-models.js'" \
    "manchester/editor.js:exec('baja/bio/splicing/exon-ai-models.js'" \
    "baja/bio/splicing/splicing-profile.js:Splicing profile — pick a magnitude mode" \
    "baja/bio/splicing/cis-attribution.js:Cis-regulatory attribution — pick the tool" \
    "baja/bio/splicing/intron-retention.js:Intron-retention propensity (BajaIR) as a track layer" \
    "baja/bio/splicing/cryptic-exons.js:generateCrypticExons" \
    "py/bio/splice/splicing-profile.py:Splicing profile for a raw sequence, via the bajasplice-lib models" \
    "py/bio/splice/cis-profile.py:Cis-regulatory profile around one splice site, via bajasplice-lib" \
    "py/bio/splice/intron-retention.py:Intron-retention propensity for a gene, via bajair"
  # BajaNMD under Exon -> AI Models: what including or skipping a cassette exon does to
  # the transcript, and the steric-block ASOs that switch it. A sibling model family to
  # BajaSplice, so it ships as its own group rather than being folded into that one: the
  # two share only the menu file.
  #
  # The library's modules are listed one by one, the way py/ion-lib/indication_store.py
  # is, so the entry scripts' sys.path fallback finds them even on a box where the
  # package has not been pip-installed into the venv. If it HAS been installed there, the
  # installed copy wins and these are inert.
  #
  # All of them or none: a menu entry whose script is missing is worse than no entry, and
  # an entry script whose library is missing fails at import with nothing useful on screen.
  #
  # The three Machine Learning Models surfaces ride in THIS group, not in the groups that
  # already carry them for other reasons. models-catalogue.js also ships with the ELM and
  # uniqueness groups, so either of those could put the BajaNMD card on a box where
  # bajanmd.js never arrived -- the card would open onto a missing script, which is the
  # exact failure this group's all-or-none rule exists to prevent. Listing it here as well
  # means the card and the script it opens travel together; whichever group runs first
  # installs the same file and the others are inert.
  # Predict effect of removing, in the exon menu, and everything it opens. The menu
  # item shipped; NONE of the modules behind it ever did, so on the server the exec
  # threw and the item reported its fallback, "Could not assess this exon.", for every
  # exon. codons.js and retranslate-after-exon-change.js go with it: the first is what
  # exon-removal-impact.js translates with, the second is what Remove exon re-translates
  # with, and both were equally unlisted. Shipping the item without them would only move
  # the failure.
  #
  # All of them or none: the menu item calling a module that is not there is exactly the
  # state this group exists to end.
  # Per-exon splicing reliability: the tag drawn on each exon in a PSI run, the score
  # behind it, and the ranking that reads it. The score lives in splicing-profile.js,
  # the tag is drawn in track-layer.js and the ranking is a BajaSplice submenu entry,
  # so all three move together or the tag appears with no ranking behind it, or the
  # ranking finds a layer that carries no score.
  #
  # track.js rides along because the marked-region rectangle was calling the theme's
  # gene-BODY draw class, which stroked the exon edge around whatever was selected: a
  # black box around the selection that read as a feature boundary. It now calls mark(),
  # which keeps the theme's colour and drops the outline.
  # "run bajasplice on dnm3" from the Ask bar. Both splicing operations declared
  # needs: 'selection' and refused without a drag, while splicing-profile.js has run on
  # a whole track all along -- the same fault rbp_profile already carries a comment
  # about. Worse for PSI, which ignores the range outright because it needs the track's
  # exon structure rather than a stretch of sequence, so the drag it demanded was for
  # something the model never read.
  install_group "Ask: run BajaSplice on a named track, with no selection" \
    "baja/manchester/menu/editor-capabilities.js:SAME FAULT AS rbp_profile HAD"
  # PSI read for brain rather than averaged over all 54 GTEx tissues. PSINet always
  # had a per-tissue head; splicing-profile.py called .mean(dim=1) on it and threw the
  # per-tissue predictions away, so a neural target was always reported as a whole-body
  # average. No model changes, only which columns are read.
  install_group "PSI for a chosen tissue" \
    "py/bio/splice/splicing-profile.py:WHICH TISSUES THE PSI IS FOR" \
    "baja/bio/splicing/splicing-profile.js:TISSUE, FOR PSI ONLY" \
    "baja/bio/splicing/exon-ai-models.js:THE SAME MODEL, READ FOR BRAIN"
  install_group "exon reliability: tag, score and ranking" \
    "baja/bio/splicing/splicing-profile.js:HOW RELIABLY EACH EXON IS SPLICED IN" \
    "baja/bio/track-layer.js:AN OPAQUE CHIP, NOT A HALO" \
    "baja/bio/splicing/exon-ai-models.js:Rank exons by how unreliably they splice" \
    "baja/bio/track.js:A MARKED REGION IS NOT A GENE BODY"
  install_group "exon menu: Predict effect of removing, and the modules it opens" \
    "baja/manchester/menu/menu-factory.js:THE PANEL OPENS BEFORE THE WORK, not after it" \
    "baja/bio/orfs/exon-removal-impact.js:What removing (skipping) one exon would do to the transcript" \
    "baja/bio/aa/codons.js:aminoDict" \
    "baja/bio/orfs/retranslate-after-exon-change.js:Re-derive a track"
  install_group "BajaNMD on an exon" \
    "baja/bio/splicing/exon-ai-models.js:FRAME, STATED BEFORE THE MODELS ARE RUN" \
    "baja/bio/splicing/bajanmd.js:GIVEN AN EXON, IT ANSWERS ABOUT THAT EXON" \
    "baja/ml/models-catalogue.js:title: 'NMD consequence of a cassette exon', badge: 'BajaNMD'" \
    "baja/ml/institute-of-models-library.js:headline: 'What including or skipping a cassette exon does" \
    "baja/lib/library-of-libraries.js:BajaCLIP, BajaSplice, BajaIR, BajaNMD and " \
    "py/bio/nmd/bajanmd-exons.py:ONE EXON, WHEN THE CALLER CLICKED ONE" \
    "py/bio/nmd/bajanmd-aso.py:Resolve the libraries from this file's own location first" \
    "py/bajanmd-lib/bajanmd/__init__.py:BajaNMD: what happens to a transcript when a cassette exon" \
    "py/bajanmd-lib/bajanmd/consequence.py:NMD consequence of every cassette-eligible exon of a gene" \
    "py/bajanmd-lib/bajanmd/design.py:Steric-block ASOs that push a cassette exon toward being skipped" \
    "py/bajanmd-lib/bajanmd/offtarget.py:Off-target screening for designed oligos"
  # Uniqueness / repeat gradient on a transcript track. All three or none: the catalogue
  # entry would otherwise open onto a loader that is not there, and the loader would
  # call a scorer that is not there.
  install_group "uniqueness / repeat gradient" \
    "baja/data/uniqueness-gradient.js:Uniqueness / repeat gradient laid over a transcript track" \
    "py/sequence/offtarget/uniqueness-gradient.py:Uniqueness / repeat gradient along a transcript" \
    "baja/ml/models-catalogue.js:title: 'Uniqueness / repeat gradient', badge: 'k-mer'" 
  # THE COMPOUND SEQUENCE LABEL SPANS TWO FILES, so they ship together or not at all.
  # oligo.js decides what a compound spells out and where; the renderer that draws it in
  # register with the beads, drawAlignedSeqLabel, lives on the graph in gene.js. Shipped
  # apart, a new oligo.js on an older gene.js finds no renderer, falls back to a CENTRED
  # pill, and the label stops sitting over the residues it describes -- which looks like a
  # drawing bug in the compound and is really a version skew. They were in two different
  # groups until this was noticed.
  install_group "compound sequence label (spans oligo.js, sirna.js, chem-draw.js and gene.js)" \
    "flexigraph/chem-draw.js:GENOMIC ORIENTATION" \
    "baja/bio/track-flexi.js:THE REFERENCE SEQUENCE UNDER ONE COMPOUND" \
    "baja/bio/track.js:The reference sequence under one compound" \
    "baja/chem/ui/pick-chem-part.js:SLOT -> MONOMER" \
    "baja/chem/ui/chem-part-press.js:SLOT -> MONOMER" \
    "flexigraph/oligo.js:THE TARGET GOES UNDER THE COMPOUND" \
    "flexigraph/sirna.js:Same geometry the duplex is drawn with" \
    "flexigraph/gene.js:CLEARANCE IS THIS FUNCTION'S ALONE"
  # Ask a question about the selected variants. All four or none: the menu entry is the
  # only way in, the panel needs the search module's record builder, and the python is
  # where the gene-versus-variant guard actually lives.
  install_group "ask about selected variants (AI)" \
    "py/bio/variants/variant-association.py:gene-level contamination" \
    "baja/data/variant-association.js:ASK A QUESTION ABOUT THE SELECTED VARIANTS" \
    "baja/lib/model-panel.js:OPTIONAL COLOUR CONTROLS" \
    "baja/data/variant-search.js:SEARCH THE VARIANTS ON THE OPEN TRACKS" \
    "flexigraph/gene.js:ASK ABOUT THE SELECTED VARIANTS"
  # Text search over the variants on the open tracks, with wildcards.
  # Both or neither: the menu entry is the only way in, and the module is the search.
  install_group "variant search (text, wildcards)" \
    "baja/data/variant-search.js:SEARCH THE VARIANTS ON THE OPEN TRACKS" \
    "baja/manchester/menu/variant-tools-finder.js:Search variants (text, wildcards)"
  # Newly added variants blink for a minute so they can be found before the view settles.
  # All three or none: the two loaders are the only callers and the module is the pulse.
  install_group "new variants pulse" \
    "baja/data/variant-pulse.js:PULSE THE VARIANTS THAT JUST ARRIVED" \
    "baja/data/variant-arrival.js:EVERY VARIANT THAT ARRIVES ON A TRACK PASSES THROUGH HERE" \
    "baja/bio/track-flexi.js:THE ONE PLACE EVERY ARRIVAL PASSES THROUGH" \
    "baja/bio/track.js:THE ONE PLACE EVERY ARRIVAL PASSES THROUGH"
  # A batch of newly loaded variants, told apart from the ones already on the track.
  # All three or none: load-variants.js makes the batch, variant-batch.js is what a batch
  # IS, and the layers menu is the only way to turn one off again.
  install_group "variant batches: shape by kind, colour by LOF" \
    "baja/data/variant-batch.js:TOLD APART FROM THE ONES ALREADY THERE" \
    "baja/data/load-variants.js:tell the new ones from the ones already there" \
    "baja/data/variant-from-prompt.js:tell what was just described from what was already there" \
    "baja/manchester/menu/track-layers-side-menu.js:— variants added —"
  # ALLELE-SELECTIVE ASO DESIGN, the whole chain. These five files were reaching the
  # server only through two one-off installers (install-allele-selective-tiling.py and
  # install-allele-indels.py), so whether the strategy works at all depended on whether
  # someone remembered to run them, and nothing said so when they had not. The symptom is
  # quiet and looks like a design problem rather than a deploy one: the dialog still
  # offers the strategy and still counts the mutations, because that count is worked out
  # in the browser, but the designer never receives cover_spans and returns ASOs that do
  # not sit over a mutation -- reference oligos, in other words.
  #
  # All five or none: track-design-menu.js sends cover_spans, design.py is what honours
  # them, design-scope-from-workbench.js is what rebuilds the mutant sequence they are
  # indexed against, and a mismatched pair is worse than an old pair that agrees.
  # The allele-selective annotation: which residue does the discriminating, recorded at
  # design time and drawn on the compound. All three or none -- the menu reads the field
  # track-design-menu writes and chem-draw draws it.
  install_group "allele-selective: mark the discriminating residue" \
    "baja/manchester/menu/track-design-menu.js:WHICH RESIDUES DO THE DISCRIMINATING" \
    "flexigraph/chem-draw.js:THE RESIDUE THAT DOES THE DISCRIMINATING" \
    "baja/manchester/menu/menu-for-single-aso.js:WHERE THE SELECTIVITY IS"
  install_group "allele-selective ASO design" \
    "py/ssaso/design.py:THE CALLER'S ORDER IS THE PRIORITY ORDER" \
    "baja/manchester/menu/track-design-menu.js:BACK FROM THE DESIGNED SEQUENCE TO THE TRACK" \
    "baja/manchester/menu/design-scope-from-workbench.js:HOW FAR THIS ALLELE IS FROM THE REFERENCE" \
    "baja/manchester/menu/aso-design-dialog.js:use_track_alleles" \
    "flexigraph/oligo.js:__seqDisp2"
  # Conserved domains and functional sites answer a click, like the motifs do.
  # All four or none: the layer registers the bars, mouse-over-highlight finds one from a
  # pixel, the panel is what opens, and the lookup is the only thing with prose in it.
  install_group "CDD domains: clickable, with a description" \
    "baja/bio/protein/cdd-domain-layer.js:CLICK TARGETS" \
    "baja/bio/protein/cdd-domain-panel.js:The description window for one CDD domain" \
    "py/bio/protein/domain-lookup.py:Describe one CDD domain or functional site" \
    "baja/manchester/menu/mouse-over-highlight.js:A CLICK ON A CONSERVED DOMAIN"
  # Linear motifs: every lane stays on the track, and every bar answers a click.
  # Both files or neither: the layer asks the TrackLayer to stack intervals that share a
  # span, and without that half the bars are dropped before they are ever drawn.
  install_group "linear motifs: lanes on the track, bars clickable" \
    "baja/bio/track-layer.js:allowStackedIntervals" \
    "baja/bio/protein/slim-motif-layer.js:EVERY LANE STAYS ON THE TRACK"
  install_group "Research panel" \
    "py/ion-lib/indication_store.py:def browse(" \
    "py/analytics/indication-browse.py:Reading the indication-market store" \
    "baja/research.js:baja-research" \
    "baja/home.js:data-door=\"research\""
  # Remove SNPs by phase: the remove-SNPs menu lists each phase on the track (or selection)
  # and deletes every SNP/indel of the one chosen.
  install_group "remove SNPs by phase" \
    "baja/manchester/menu/remove-snps-menu.js:REMOVE BY PHASE"
  # Ask: "goto c.778" goes to the base on each track it exists on, zoomed in to read it.
  # All three or none: the card offers choices the operation produces, and the operation
  # resolves c. positions with position() from track-regions.js.
  install_group "Ask: go to a position" \
    "baja/bio/track-regions.js:ONE POSITION FROM WHAT SOMEONE TYPES" \
    "baja/manchester/menu/editor-capabilities.js:name: 'go_to_position'" \
    "baja/manchester/menu/editor-command.js:ONE GO PER TRACK"
  # Ask: select / remove variants by phase. The search engine gains the field and the
  # operation docs tell the planner it exists; either alone leaves "phase 1" matching nothing.
  install_group "Ask: variants by phase" \
    "baja/data/variant-search.js:PHASE IS A NUMBER, NOT TEXT" \
    "baja/manchester/menu/editor-capabilities.js:is the variant's phase number"
  # Remove the top or bottom phase (the lollipops above or below the track line), from the
  # remove-SNPs menu and from the Ask box; and "zoom into the pathogenic variant", which
  # finds matching objects and offers a GO per match. editor-command.js draws that card.
  install_group "Ask: top/bottom phase, zoom to objects" \
    "baja/data/variant-search.js:WHICH SIDE OF THE TRACK THE LOLLIPOP IS DRAWN ON" \
    "baja/manchester/menu/remove-snps-menu.js:REMOVE THE TOP OR BOTTOM SIDE" \
    "baja/manchester/menu/editor-capabilities.js:name: 'zoom_to_objects'" \
    "baja/manchester/menu/editor-command.js:CHOICE_MAX"
  # Ask: "design asos" opens the ASO designer (track-design-menu.js -> aso-design-dialog.js,
  # both already deployed) instead of a tiling path that needs a selection first.
  install_group "Ask: design asos opens the ASO designer" \
    "baja/manchester/menu/editor-capabilities.js:OPENS THE ASO DESIGNER"
  # The Variant designer: variants ranked by divergence from the reference over a window,
  # with the compounds tiled on each and a GO. The panel and the three ways to open it.
  install_group "Variant designer" \
    "baja/manchester/menu/variant-designer.js:VARIANT DESIGNER -- every variant on the canvas" \
    "baja/manchester/menu/editor-capabilities.js:name: 'open_variant_designer'" \
    "baja/manchester/menu/snp-tools-mouse-menu.js:label: 'Variant designer'" \
    "baja/manchester/menu/edit-snps-menu.js:label: 'Variant designer'"
  # Bookmarks: "bookmark this site <name>" saves the view, "go to <name>" returns to it, and
  # a panel lists them. Both files or neither -- the operations are the only way in.
  install_group "Ask: bookmark this site" \
    "baja/lib/bookmarks.js:BOOKMARKS -- named places on the canvas" \
    "baja/manchester/menu/editor-capabilities.js:BOOKMARK THIS SITE"
  # Download a generated report as a PDF. Both files or neither: the button is in the viewer
  # and the prose rendering it calls is in the writer. The writer's table path changed too
  # (ASCII output, escaping fixed), which run-off-targets.js and snp-more-info.js also use.
  install_group "Report viewer: PDF download" \
    "baja/io/pdf-writer.js:ADVANCE WIDTHS PER 1000 UNITS" \
    "baja/lib/report-view.js:A report is usually written to be sent on"
  # "generate aso report" from the Ask box, and the allele-selectivity section the report
  # gains: compounds built on a variant allele, ordered by divergence from the reference.
  install_group "Ask: generate the design report" \
    "baja/manchester/menu/design-report.js:ORDERED BY DIVERGENCE FROM THE REFERENCE" \
    "baja/manchester/menu/editor-capabilities.js:name: 'generate_design_report'"
  # Tools > Track > Design: the whole design library plus a card per designer. editor.js
  # carries the cards, track-design-menu.js the 'assay' preset they open for primer probes.
  install_group "Tools > Track: Design" \
    "manchester/editor.js:DESIGN, reachable from Tools > Track" \
    "baja/manchester/menu/track-design-menu.js:ASSAY rather than a therapeutic modality"
  # Off-target screening from the Ask box, with an "unscreened" scope the screens did not
  # have. All three or none: the operation passes a scope the two tools must understand.
  # The off-target options panel. All three or none: the two run tools now ask it for
  # the reference, the scope and the edit distance instead of building their own.
  # "show me the off-target report" from the box. Both files, so the operation never
  # ships without the panel it opens.
  install_group "Ask: show the off-target report" \
    "baja/manchester/menu/editor-capabilities.js:name: 'show_offtarget_report'" \
    "baja/manchester/menu/selected-off-target-genes.js:THE OFF-TARGET GENES OF THE SELECTED COMPOUNDS"
  # One sequence label per place on a tiled design. Both files: track.js empties the list
  # at the top of each frame, oligo.js checks and fills it.
  # The arrows stand down once the compound is visible, and the sequence label comes back
  # at the same threshold. All three together: gene-draw without oligo would hide the
  # arrows while the labels stayed suppressed, losing both at once.
  # The target row under each compound shows only the column that does not pair.
  # An annotation whose name is just a nucleotide run draws no label.
  # The arrows hang from the top of the track and are translucent. Both renderers.
  install_group "compound arrows: top of the track, translucent" \
    "flexigraph/gene-draw.js:HUNG FROM THE TOP OF THE TRACK" \
    "flexigraph/gene-draw2.js:Hung from the top of the track"
  install_group "annotations: no label for a sequence name" \
    "flexigraph/annotation.js:A NAME THAT IS JUST A SEQUENCE IS NOT A LABEL"
  install_group "chemistry: target row is the mismatch only" \
    "flexigraph/chem-draw.js:ONLY THE COLUMN THAT DOES NOT PAIR"
  install_group "compound arrows: stand down when the compound is visible" \
    "flexigraph/gene-draw.js:AT A ZOOM WHERE THE COMPOUND ITSELF IS VISIBLE" \
    "flexigraph/gene-draw2.js:AT A ZOOM WHERE THE COMPOUND ITSELF IS VISIBLE" \
    "flexigraph/oligo.js:COMPOUND_VISIBLE_PX in flexigraph/gene-draw.js"
  install_group "sequence labels: one per place" \
    "flexigraph/oligo.js:ONE SEQUENCE LABEL PER PLACE" \
    "baja/bio/track.js:Same idea for the per-compound sequence labels"
  # Run screen actually starting, and saying so when it cannot.
  install_group "off-target run: start it, and report a failure" \
    "baja/manchester/menu/run-off-target-tool.js:START IT, AND SAY SO IF IT CANNOT START" \
    "baja/manchester/menu/run-off-target-tool-seed-seq.js:START IT, AND SAY SO IF IT CANNOT START"
  install_group "off-target options panel" \
    "baja/lib/canvas-overlay-panel.js:THE CANVAS OVERLAY PANEL" \
    "baja/manchester/menu/off-target-options.js:THE OFF-TARGET SCREEN" \
    "baja/manchester/menu/run-off-target-tool.js:THE OPTIONS, asked in the editor" \
    "baja/manchester/menu/run-off-target-tool-seed-seq.js:THE OPTIONS, asked in the editor"
  install_group "Ask: run off-target screen" \
    "baja/manchester/menu/editor-capabilities.js:name: 'run_offtarget_screen'" \
    "baja/manchester/menu/run-off-target-tool.js:SCOPE, which arrives two ways" \
    "baja/manchester/menu/run-off-target-tool-seed-seq.js:SCOPE, which arrives two ways"
  # More than one selected region on a track. All five or none: the track holds the extra
  # regions and draws them, gene.js clears them, the capability adds them and the planner
  # splits the request that asks for them. A track that can hold a second region while the
  # clear still only drops the first would leave a selection nobody can see.
  # Protein motifs from the Ask box, and limited to the selection when there is one. Both
  # or neither: the capability passes `within` and the layer is what honours it, so a new
  # capability against an old layer would quietly scan the whole protein instead.
  # The vertical half of the hit test, for both layers that use the registry idiom. All
  # four or none: the renderer records the rectangle, addInterval hands the interval back,
  # the two layers carry it, and the hit test reads it. An old renderer with a new hit test
  # records nothing, and every bar falls to the fallback path.
  # Comparing two tracks from the Ask box, over a named region if the request names one.
  # All three or none: the capability passes `ranges`, compare-track-sequences is what
  # honours them, and a new capability against the old module would compare whole tracks
  # and report a believable number for the wrong question.
  # compare-track-sequences.js has never been listed here before.
  # Put tracks together, and the mRNA-track group selector. The capability and the layout
  # module go together: the capability resolves which tracks, the module is what moves them.
  # The fly, across every backend table that names a species. All or none, deliberately:
  # a species known to the gene lookup and not to the off-target screen resolves for one
  # and vanishes for the other, which looks like a broken screen rather than a missing
  # name. Five of these files have never been listed here before.
  install_group "Drosophila is a species the backend knows" \
    "py/bio/karyotype.py:Drosophila melanogaster, UCSC dm6" \
    "py/bio/gene-locus.py:Drosophila melanogaster, UCSC dm6" \
    "py/bio/build-karyotype.py:Drosophila melanogaster. Its chromosomes are named" \
    "py/sequence/prompt-to-transcript.py:Drosophila keeps FlyBase ids rather than ENS" \
    "py/sequence/offtarget/uniqueness-gradient.py:\"fly\": [\"fly_cdna\"]" \
    "py/sequence/extract-entities.py:Ensembl serves the fly under this name today" \
    "py/sequence/extract-entities-file.py:Ensembl serves the fly under this name today" \
    "py/bio/genome-sequence.py:Listed so a fly request is answered with what is missing"
  install_group "Ask: put tracks together, lined up" \
    "baja/bio/put-tracks-together.js:WHICH WAY IS DOWN" \
    "baja/manchester/menu/editor-capabilities.js:MOVING TRACKS IS NOT MERGING THEM"
  # Proteins aligned on the backend, for the mRNA tracks as a group. All four or none: the
  # capability picks the tracks and routes protein work to the client module, which calls
  # the python aligner. A client half without the python half asks a script that is not
  # there, falls back to the browser every time, and nothing says why.
  # One region searched against a whole track, hits ranked. Both halves or neither: the
  # capability resolves the region and the two tracks, the client module carries the
  # target's left edge so hits come back in real coordinates, and the python script does
  # the search. A client half without the python half asks for a script that is not there.
  install_group "Ask: search one region against a whole track" \
    "baja/manchester/menu/editor-capabilities.js:SEARCHING IS NOT COMPARING, AND THE REFUSAL WAS RIGHT" \
    "baja/bio/search-region.js:DRAWN, NOT JUST LISTED" \
    "baja/bio/match-layer.js:ONE WAY TO DRAW A SET OF MATCHING REGIONS ON A TRACK" \
    "py/bio/search-region-in-track.py:TWO DIFFERENT MASKS, and neither is a base" \
    "py/bio/editor/plan.py:FINDING IS NOT COMPARING"
  # The similarity map: layers on both tracks. The capability, the client module and the
  # backend go together, and the backend is shared with the region search above, so both
  # groups name it. A client half against the old backend gets a minus-strand block's
  # query coordinates mirrored, which looks like a real position in the right track.
  # Taking layers off a track, and the shelf no longer answering a request to remove one.
  install_group "Ask: remove layers from a track" \
    "baja/manchester/menu/editor-capabilities.js:UNLOADING HAD NO OPERATION WHILE LOADING HAD ONE" \
    "baja/bio/remove-layers.js:WHAT IS REMOVED IS NAMED BEFORE IT GOES" \
    "baja/manchester/menu/editor-command.js:NOT FOR A REQUEST TO TAKE SOMETHING AWAY" \
    "py/bio/editor/plan.py:TAKING SOMETHING AWAY IS NOT BROWSING FOR IT"
  install_group "Ask: draw a map of the similar regions between two tracks" \
    "baja/manchester/menu/editor-capabilities.js:A MAP IS DRAWN, NOT REPORTED" \
    "baja/bio/similarity-map.js:A MAP OF WHERE TWO TRACKS ARE THE SAME, DRAWN ON BOTH OF THEM" \
    "baja/bio/match-layer.js:ONE WAY TO DRAW A SET OF MATCHING REGIONS ON A TRACK" \
    "py/bio/search-region-in-track.py:FOR A MAP, GAPS HAVE TO BE EXPENSIVE"
  install_group "Ask: compare the proteins between the mRNA tracks" \
    "baja/manchester/menu/editor-capabilities.js:THE mRNA TRACKS, WITHOUT BEING NAMED ONE BY ONE" \
    "baja/bio/protein/compare-proteins.js:COMPARE THE PROTEINS OF THESE TRACKS, ALIGNED ON THE BACKEND" \
    "py/bio/protein/align-proteins.py:A PROTEIN ALIGNMENT IS NOT A STRING COMPARISON" \
    "baja/bio/track-flexi.js:WORLD Y RUNS THE OPPOSITE WAY TO SCREEN Y"
  install_group "Ask: compare the sequences of two tracks" \
    "baja/manchester/menu/editor-capabilities.js:COMPARING IS NOT SELECTING" \
    "baja/manchester/menu/compare-track-sequences.js:A STRETCH OF EACH TRACK RATHER THAN ALL OF IT" \
    "py/bio/editor/plan.py:COMPARING IS NOT SELECTING"
  # Arrows between the matched blocks on two tracks: the renderer's third pass, the one
  # description of a matched region that hangs them, and the two tools that ask for them.
  # Comparing two proteins now draws where they are alike as well as reporting how much:
  # the aligner returns the blocks, the client puts them on the codons that encode them,
  # and match-layer draws and links them. The backend and the client go together -- an old
  # backend returns no blocks and the client draws nothing, silently.
  # "remove rnaseq layers from X" now also finds the unlabelled bigwig traces, by their
  # shape, and asks before taking anything it inferred or anything sweeping. The matcher,
  # the removal, the card and the confirmation all go together: an old confirm.js reports
  # no cancel, and an old capabilities file previews a different set than the one removed.
  # A layer deleted on a child track was mirrored straight back by syncFromParent on the
  # next redraw tick, so both the layer menu and the remove operation looked like they did
  # nothing. track.js remembers the delete; both removers have to tell it, so all three
  # files go together.
  # Two heads on every match arrow, the browser comparison drawing what it found, and
  # iterating over a track's exons as one operation. The renderer, the shared block finder
  # and the callers go together: an old renderer draws one head, and an old planner has no
  # rule pointing at the new operation.
  # The exon match is shown as a picture of the two tracks rather than a table, and the
  # fields it reads from the searcher are the ones the searcher actually sends: t0/t1 and
  # coverage do not exist, which put NaN-NaN and 0.0% on every row.
  # Two things that lost a request outright: a planner reply with anything after its JSON
  # took the whole plan down, and "add rna binding proteins to the spag9_mrna" was refused
  # for want of a selection it does not need.
  # A table asked for in one sentence is made, put in front of the user, and then filled.
  install_group "Create the table, centre it, then fill it in" \
    "baja/plate/ops/fill-table.js:A TABLE THAT IS NOT THERE YET IS MADE, CENTRED, AND THEN FILLED" \
    "baja/plate/menu/project-capabilities.js:CREATE a table of something"
  # Totalling the column you are standing under.
  install_group "Total the cells above this one" \
    "baja/plate/ops/sum-above.js:TOTAL THE CELLS ABOVE THIS ONE" \
    "baja/plate/menu/project-capabilities.js:THE COMMONEST THING ANYBODY DOES TO A COLUMN OF NUMBERS"
  # A total row asked for before its column is filled: the word, the formula, and an engine
  # that adds an unwritten cell as nothing. An old engine turns that total red.
  install_group "Total row written before the figures" \
    "baja/plate/ops/sum-above.js:A TOTAL ROW IS WRITTEN BEFORE THE FIGURES AS OFTEN AS AFTER THEM" \
    "baja/plate/menu/project-capabilities.js:A TOTAL ROW IS ASKED FOR AS A ROW" \
    "baja/plate/ops/frun-object.js:AN EMPTY CELL ADDS NOTHING, WHATEVER EMPTY LOOKS LIKE"
  # A table worked out from another table reads it with formulas. The operation sends the
  # source table's numbers, the python is what asks for formulas back, and the catalogue is
  # what tells the planner to say which table: any one of them old and the cells are values.
  install_group "A table worked out from another table reads it, with formulas" \
    "baja/plate/ops/fill-table.js:A TABLE WORKED OUT FROM ANOTHER TABLE READS IT, WITH FORMULAS" \
    "py/bio/project/table-fill.py:A TABLE WORKED OUT FROM ANOTHER TABLE IS THE ONE EXCEPTION" \
    "baja/plate/menu/project-capabilities.js:WORKED OUT FROM ANOTHER TABLE MEANS READING IT"
  # "=sum the cells above" is a request for a formula, not a formula. The field's router is
  # what lets it reach the command handler at all, and the handler calls the totalling
  # operation as it now stands, so the three go together.
  install_group "Words after an = become the formula they describe" \
    "baja/plate/menu/project-command.js:WORDS AFTER AN \"=\" ARE A REQUEST FOR A FORMULA, NOT A FORMULA" \
    "baja/plate/menu/is-sentence.js:AN \"=\" IN FRONT OF A SENTENCE DOES NOT MAKE IT A FORMULA" \
    "baja/plate/ops/sum-above.js:A TOTAL ROW IS WRITTEN BEFORE THE FIGURES AS OFTEN AS AFTER THEM"
  # The project card raises the same timed spinner the editor card does.
  install_group "The project card says an operation is running" \
    "baja/plate/menu/project-command.js:EVERY OPERATION THAT TAKES TIME SAYS SO, HERE AS IN THE EDITOR" \
    "baja/lib/working.js:ABOVE THE CARD THAT ASKED FOR THE WORK"
  # Enter on a red cell works its text out into a formula. The field decides to ask, the
  # card routes it, the operation checks and writes it, the python proposes it, and the
  # catalogue lets a plain sentence reach the same operation: an old copy of any one of
  # them and Enter writes the broken text back again.
  install_group "Enter on a red cell works out the formula it was meant to be" \
    "manchester/controls/navigation-panel-plates2.js:ENTER ON A RED CELL IS A REQUEST TO FIX IT, NOT TO WRITE IT AGAIN" \
    "baja/plate/menu/project-command.js:EVERYTHING ELSE IS WORKED OUT, AND SO IS A FORMULA THAT IS ALREADY RED" \
    "baja/plate/ops/formula-from-words.js:A FORMULA WORKED OUT FROM WORDS, OR FROM A FORMULA THAT DID NOT WORK" \
    "py/bio/project/formula-write.py:A CELL HOLDING WORDS AFTER AN \"=\" IS A DESCRIPTION OF A FORMULA" \
    "baja/plate/menu/project-capabilities.js:A FORMULA DESCRIBED RATHER THAN WRITTEN" \
    "baja/plate/ops/sum-above.js:A cell that was red for what it used to hold is not red for this"
  # The same repair when Enter is pressed on the cell itself, which is where it is usually
  # pressed. The track installs the listener; the card and both operations take the cell
  # by name, because the table moves the selection on before the repair runs.
  install_group "Enter pressed on a red cell itself repairs it" \
    "baja/plate/ops/repair-on-enter.js:ENTER ON A RED CELL, PRESSED ON THE CELL ITSELF" \
    "baja/plate/plate-track.js:ENTER ON A RED CELL ASKS FOR IT TO BE REPAIRED" \
    "baja/plate/menu/project-command.js:cell: o.cell || null, table: o.table || ''" \
    "baja/plate/ops/sum-above.js:A cell named by the caller is the cell, whatever is selected by now" \
    "baja/plate/ops/formula-from-words.js:A cell named by the caller is the cell, whatever is selected by now"
  # The row of round buttons beside a selected cell is one button and a named drop-down.
  # Both table classes hand their old buttons to the menu module, so all three go together:
  # a table class without the module has a button that opens nothing.
  install_group "The cell's buttons are one drop-down" \
    "baja/plate/menu/cell-menu.js:THE CELL'S ACTIONS, AS ONE DROP-DOWN INSTEAD OF A ROW OF DISCS" \
    "baja/plate/plate.js:ONE BUTTON AND A DROP-DOWN, NOT A ROW OF DISCS" \
    "baja/plate/plate-transparent.js:ONE BUTTON AND A DROP-DOWN, NOT A ROW OF DISCS"
  install_group "The cell's menu button has an orange glow" \
    "baja/plate/plate.js:AN ORANGE GLOW BEHIND THE CELL'S MENU BUTTON" \
    "baja/plate/plate-transparent.js:AN ORANGE GLOW BEHIND THE CELL'S MENU BUTTON"
  install_group "No row or column selection offered over several cells" \
    "baja/plate/menu/cell-menu.js:WITH SEVERAL CELLS SELECTED THERE IS NO \"THIS ROW\" OR \"THIS COLUMN\""
  # Paralogs: the lookup, the screen every row loads from, and the operation that joins
  # them. All three go together -- an old capabilities file has no way to reach either.
  # Where a gene is conserved, built from Ensembl's own pairwise alignments. The lookup
  # needs the homologs module's species restriction and its sequence= switch, so those
  # two go together, and the screen needs the button that reaches the map.
  # Asked for in a sentence, shown as a protein map with the source transcript's exons
  # and the track's missense variants on it, and with a panel while it runs.
  # The same answer on the track, for a selected region, measured against the rest of the
  # protein, from one lookup shared with the map.
  install_group "Conservation drawn on the track, for the region you selected" \
    "baja/bio/conservation-layer.js:CONSERVATION, ON THE TRACK, IN THE TRACK" \
    "baja/manchester/menu/editor-capabilities.js:THE ANSWER FOR THIS REGION, WHERE THE REGION IS" \
    "baja/manchester/menu/editor-capabilities.js:LOOKED UP ONCE PER GENE"
  install_group "Conservation map: its own operation, labelled, with exons and variants" \
    "baja/manchester/menu/editor-capabilities.js:ONE TRACK, MANY SPECIES" \
    "baja/manchester/menu/editor-capabilities.js:THE VARIANTS ON THE TRACK, CARRIED ONTO THE PROTEIN" \
    "baja/bio/conservation-map.js:IT IS A PROTEIN MAP, AND IT SAYS SO" \
    "py/bio/editor/plan.py:CONSERVATION ACROSS SPECIES IS conservation_map"
  # Going somewhere by name, and pulling back from where you are. Both are refusals the
  # catalogue produced for requests the editor could already answer, so the words and the
  # operations go together: an old capabilities file cannot read a named region, and an old
  # track-regions cannot tell it one was asked for.
  install_group "Go to a named region; zoom in and out from where you are" \
    "baja/bio/track-regions.js:A NAMED REGION IS A PLACE TOO" \
    "baja/manchester/menu/editor-capabilities.js:A NAMED REGION IS A STRETCH, SO IT IS FRAMED, NOT POINTED AT" \
    "baja/manchester/menu/editor-capabilities.js:A NAMED REGION IS NOT A FAILED POSITION" \
    "baja/manchester/menu/editor-capabilities.js:\"ZOOM OUT\" IS NOT \"FIT\""
  # A model asked for with several tracks open is a choice, and a model that cannot be
  # placed at all is still a request for that model.
  install_group "BajaSplice offers a track, or the shelf it lives on" \
    "baja/manchester/menu/editor-capabilities.js:A MODEL WITH SEVERAL TRACKS OPEN IS A CHOICE, NOT A REFUSAL" \
    "baja/manchester/menu/editor-capabilities.js:THE SHELF OF MODELS, as the answer when one of them cannot be placed" \
    "baja/manchester/menu/editor-capabilities.js:WHAT TO OFFER WHEN IT CANNOT RUN" \
    "baja/manchester/menu/editor-command.js:A REFUSAL WITH A WAY FORWARD"
  # The design reading rooms are called what they are.
  install_group "Design tools, not the Institute for GeneTx Design" \
    "baja/lib/institute-rna-design.js:serif;\">Design tools</div>" \
    "baja/lib/library-of-libraries.js:serif;\">Design tools</div>"
  # The exon number stays on the exon; what the exon has to say is drawn clear of it, and
  # PSI now says how stably each exon splices. The two go together -- the label is placed
  # against the disc's reach, so shipping one without the other puts them back on top of
  # each other.
  install_group "Exon stability on the exon, clear of its number" \
    "baja/bio/track-layer.js:HOW STABLY EACH EXON SPLICES, said on the exon itself" \
    "flexigraph/gene-draw.js:ON THE EXON, WHICH IS WHERE IT IS READ" \
    "flexigraph/gene-draw.js:FALLS BACK TO A COLOR, NOT TO ITSELF"
  # A plan the server could not make used to be the end of the ask box. The planner's own
  # context and the client's fallback are one change: either alone leaves the dead end.
  install_group "A failed plan offers what the editor has" \
    "py/bio/editor/plan.py:WHAT THE EDITOR IS, said plainly, because a planner that does not know" \
    "baja/manchester/menu/editor-capabilities.js:WHAT THE EDITOR ITSELF THINKS A REQUEST IS ABOUT" \
    "baja/manchester/menu/editor-command.js:A PLAN THAT COULD NOT BE MADE IS NOT THE END OF THE ASK BOX"
  # The scored rows can fail to number the arcs against the exons, and the report then had
  # nothing to show while the arcs sat over those exons on screen.
  install_group "Exon stability off the arcs when the scored rows are missing" \
    "baja/bio/splicing/exon-stability.js:HOW STABLY EACH EXON SPLICES, FROM WHATEVER THE PSI LAYER ACTUALLY HAS" \
    "baja/bio/match-regions.js:Which reading this is -- the scored rows, or the weaker one" \
    "baja/bio/compare-view.js:WHICH READING IT IS. Taken off the arcs by position"
  # Pressing GO on anything slow gave a closed card and a silent canvas, and the stability
  # row told the user to go and run PSI instead of running it.
  install_group "The spinner is not opt-in, and PSI runs itself" \
    "baja/manchester/menu/editor-command.js:EVERY OPERATION THAT TAKES TIME SAYS SO, WITHOUT BEING ASKED TO" \
    "baja/bio/match-regions.js:AND RUN IT IF IT HAS NOT BEEN RUN" \
    "baja/manchester/menu/editor-capabilities.js:RUN WHAT THE PICTURE NEEDS RATHER THAN ASKING FOR IT" \
    "baja/bio/compare-view.js:WHAT IS ON SCREEN DECIDES WHAT THE LINE SAYS"
  # The wait panel said where the work was happening rather than what was running.
  install_group "The wait panel names the model, not the server" \
    "lib/core.js:described where the work was happening, which is"
  # The comparison ran behind a modal panel for a minute and then drew everything at once.
  install_group "The comparison window opens first and fills in" \
    "baja/bio/compare-view.js:THE WINDOW OPENS WHEN THE WORK STARTS, NOT WHEN IT ENDS" \
    "baja/bio/match-regions.js:THE PICTURE OPENS NOW AND FILLS IN"
  # splicing-profile resolved as soon as the run was STARTED, so the exon comparison read
  # the track before the model had finished and reported that PSI had never been run.
  install_group "A preset PSI run is the promise, not the start of one" \
    "baja/bio/splicing/splicing-profile.js:A CALLER THAT WAITED GOT ITS ANSWER BEFORE THE MODEL HAD RUN"
  # The panel destroyed whatever was up before it, so an operation that ran another one
  # lost its own panel partway through and reported the rest into a detached node.
  install_group "A nested panel does not end the one under it" \
    "baja/lib/working.js:A NESTED PANEL DOES NOT END THE ONE UNDER IT" \
    "baja/bio/match-regions.js:WHAT CAME BACK, BEFORE THE PICTURE REPLACES IT" \
    "baja/bio/match-regions.js:THE TRACK BEHIND THE PICTURE CARRIES THE SAME FIGURES"
  # The report announced "PSI ran but matched no arcs to the annotated exons" for runs that
  # were refused outright, and the lower lane carried figures only where a match landed.
  install_group "A figure on every exon, and the real reason when there is none" \
    "baja/bio/compare-view.js:EACH TRACK SCORES ITS OWN EXONS, NOT THE MATCHED ONES" \
    "baja/bio/match-regions.js:EVERY EXON OF THAT TRACK, at its own coordinates" \
    "baja/bio/match-regions.js:WHAT THE RUN SAID, KEPT" \
    "baja/bio/splicing/exon-stability.js:AN EMPTY ANSWER SAYS WHY IT IS EMPTY"
  # Reported three times as giving no feedback at all: every earlier version of the
  # spinner had to load, or claim a singleton, or win a race, before it could appear.
  install_group "GO says what it is doing with nothing to load first" \
    "baja/manchester/menu/editor-command.js:NOTHING TO LOAD, NOTHING TO RACE: THE STRIP IS BUILT HERE"
  # A long comparison said nothing until it finished, and the exon labels were dark type
  # on a dark lane wherever the bar was narrower than the label.
  install_group "The comparison says it is running, and its labels can be read" \
    "baja/manchester/menu/editor-capabilities.js:SAYS THAT IT IS RUNNING. Comparing three tracks" \
    "baja/bio/protein/compare-proteins.js:SAYS WHERE IT HAS GOT TO" \
    "baja/bio/compare-view.js:LIGHT TYPE WITH A DARK OUTLINE, not dark type on the bar"
  # The comparison says which exons correspond; stability says whether they are reliably
  # in the message at all. Carried and drawn: the model and the view ship together.
  install_group "Exon stability in the comparison picture" \
    "baja/bio/match-regions.js:HOW STABLY EACH EXON SPLICES, CARRIED INTO THE PICTURE" \
    "baja/bio/compare-view.js:HOW STABLY EACH EXON SPLICES, beside the exon it belongs to"
  # A 571 kb gene track was refused by the searcher and the refusal was reported as "no
  # match". The limit goes and the caller stops turning errors into negative results: both
  # halves, or one of them still lies about the other.
  install_group "Search a long track instead of refusing it" \
    "py/bio/search-region-in-track.py:NO LIMIT ON HOW MUCH TARGET THERE IS" \
    "py/bio/search-region-in-track.py:SEEDS FIRST, THE WHOLE THING IF THEY FIND NOTHING" \
    "py/bio/search-region-in-track.py:A FAST PATH THAT IS NOT CONVINCING IS WORSE THAN NO FAST PATH" \
    "baja/bio/match-regions.js:A FAILURE IS NOT A NEGATIVE RESULT"
  # Two open tracks were handled and three were not.
  install_group "Compare across every open track" \
    "baja/manchester/menu/editor-capabilities.js:THREE OPEN TRACKS ARE NOT FEWER THAN TWO"
  # A selection over an exon meant dragging it by hand.
  install_group "Select exon sequence, from the exon menu" \
    "baja/manchester/menu/menu-factory.js:SEQUENCE, which is what half the other"
  # The facility existed and the ask box could not reach it, so the planner said the editor
  # does not do this at all. The operation and the planner's context go together.
  install_group "Place a variant named in the request" \
    "baja/manchester/menu/editor-capabilities.js:PLACE A NAMED VARIANT ON THE TRACK" \
    "py/bio/editor/plan.py:SAY WHAT IT CAN DO, NOT ONLY WHAT IT CANNOT"
  # The editor carries out its own advertised phrase when the planner cannot. The matcher
  # and the card that uses it ship together.
  install_group "Load the pathogenic variants without asking anything" \
    "baja/manchester/menu/editor-capabilities.js:THE ONE REQUEST THE EDITOR ADVERTISES, PLANNED WITHOUT ASKING ANYTHING" \
    "baja/manchester/menu/editor-capabilities.js:SINGULAR AND PLURAL ARE THE SAME WORD" \
    "baja/manchester/menu/editor-capabilities.js:AND THE OPPOSITE OPERATION IS NOT THE ANSWER" \
    "baja/manchester/menu/editor-command.js:THE EDITOR PLANS ITS OWN ADVERTISED REQUEST"
  # The gene-level coupling number has no exon in it. This asks the same question per exon,
  # from the skip isoform. Two new modules and the operation that drives them: all or none,
  # or the operation calls something that is not there.
  install_group "What skipping each exon does to the protein" \
    "baja/bio/orfs/exon-consequence-map.js:WHAT SKIPPING EACH EXON WOULD DO TO THE PROTEIN" \
    "baja/bio/orfs/exon-consequence-screen.js:WHAT EACH EXON IS WORTH TO THE PROTEIN, AS A SCREEN" \
    "baja/manchester/menu/editor-capabilities.js:WHAT EACH EXON IS WORTH TO THE PROTEIN. The coupling readout"
  # Going to one region was an operation; going to all of them in turn was not. The module
  # is new, so it ships with the capability that drives it or the operation calls nothing.
  install_group "Step through every exon in turn" \
    "baja/bio/region-tour.js:frame each one in turn, hold it long enough to read" \
    "baja/manchester/menu/editor-capabilities.js:SHOW ME EACH EXON. Going to one region is an operation"
  # Which track exon 12 is on is the user's call, so each one that has it gets a Go.
  install_group "A named region is offered on every track that has one" \
    "baja/manchester/menu/editor-capabilities.js:A NAMED REGION GETS ONE GO PER TRACK, LIKE EVERY OTHER PLACE"
  # The panel that reports slow work was drawn under the card that asked for it.
  install_group "The working panel is drawn above the card that asked for the work" \
    "baja/lib/working.js:ABOVE THE CARD THAT ASKED FOR THE WORK"
  install_group "A panel while something slow is running" \
    "baja/lib/working.js:SOMETHING IS HAPPENING, AND HERE IS WHAT" \
    "baja/manchester/menu/editor-capabilities.js:A FORTY-SECOND WAIT NEEDS A PANEL" \
    "baja/bio/match-regions.js:COUNTED OUT LOUD"
  install_group "A conservation map across every species at once" \
    "py/bio/homolog-conservation.py:NOTHING IS ALIGNED HERE" \
    "py/bio/homologs.py:sequence=protein brings back both rows" \
    "baja/bio/conservation-map.js:WHERE A GENE IS CONSERVED, ACROSS EVERY SPECIES AT ONCE" \
    "baja/bio/homologs-screen.js:WHERE, NOT JUST HOW MUCH"
  install_group "The homologs of a track, as a screen you load from" \
    "py/bio/homologs.py:PARALOGS AND ORTHOLOGS ARE ONE LOOKUP" \
    "py/bio/homologs.py:ASKED FOR THE SPECIES THIS EDITOR CAN OPEN" \
    "baja/bio/homologs-screen.js:THE HOMOLOGS OF A TRACK, AS A SCREEN YOU LOAD FROM" \
    "baja/manchester/menu/editor-capabilities.js:PARALOGS AND ORTHOLOGS ARE ONE OPERATION" \
    "py/bio/editor/plan.py:A HOMOLOG IS A LOOKUP, NOT A GAP IN THE CATALOGUE"
  install_group "A planner answer is read however it arrives; RBPs on a named track" \
    "py/bio/editor/plan.py:The first JSON object in a reply, whatever follows it" \
    "baja/manchester/menu/editor-capabilities.js:A SELECTION IS A SCOPE, NOT A PRECONDITION"
  install_group "Track comparisons are shown as a picture" \
    "baja/bio/compare-view.js:A FULL WINDOW, NOT A POPUP" \
    "baja/bio/compare-view.js:IT LEAVES AS A FILE" \
    "baja/bio/match-regions.js:THE FIELDS THE SEARCHER ACTUALLY RETURNS"
  install_group "Two-headed arrows, and every exon matched in one step" \
    "baja/bio/track-layer.js:in CANVAS PIXELS, which" \
    "baja/bio/align-blocks.js:THE BLOCKS AN ALIGNMENT IS MADE OF" \
    "baja/bio/match-regions.js:EXONS ARE ONE KIND OF REGION, NOT THE ONLY ONE" \
    "baja/manchester/menu/compare-track-sequences.js:WHERE A UNIT OF THE COMPARED SEQUENCE SITS ON THE TRACK" \
    "baja/manchester/menu/editor-capabilities.js:ITERATING IS AN OPERATION, NOT A REASON TO REFUSE" \
    "py/bio/editor/plan.py:EVERY ONE OF THEM IS ONE STEP, NOT A REFUSAL"
  install_group "A layer deleted on a child track stays deleted" \
    "baja/bio/track.js:A LAYER DELETED ON A CHILD TRACK STAYS DELETED" \
    "baja/bio/remove-layers.js:A CHILD TRACK MIRRORS ITS PARENT" \
    "baja/manchester/menu/track-layer-popup.js:A CHILD TRACK MIRRORS ITS PARENT"
  # Filled polygons are asked about first and the rest of what is known about a layer is
  # reported beside it, and a removal with no track named now acts on every track that has
  # one instead of refusing. The matcher and the capability go together: the capability
  # calls evidence() and resolves the tracks through the matcher.
  install_group "Remove rnaseq: filled polygons first, across every track" \
    "baja/bio/layer-match.js:FILLED POLYGONS FIRST" \
    "baja/bio/remove-layers.js:WHY THIS ONE LOOKS LIKE RNA-SEQ, on the row itself" \
    "baja/manchester/menu/editor-capabilities.js:WHICH TRACKS A REMOVAL ACTS ON"
  install_group "Remove rnaseq layers: found by shape, asked about first" \
    "baja/bio/layer-match.js:the last resort is WHAT THE LAYER IS DRAWN AS" \
    "baja/bio/remove-layers.js:ASKED FIRST WHEN THE MATCH IS A GUESS" \
    "baja/lib/confirm.js:A CANCEL THAT CAN BE HEARD" \
    "baja/manchester/menu/editor-capabilities.js:ONE DESCRIPTION OF WHICH LAYERS A REQUEST MEANS"
  install_group "Ask: compare the proteins, and draw where they are alike" \
    "py/bio/protein/align-proteins.py:THE BLOCKS THE ALIGNMENT IS MADE OF" \
    "baja/bio/protein/compare-proteins.js:THE ANSWER IS ALSO DRAWN" \
    "baja/bio/match-layer.js:LINK TWO DRAWN SETS TOGETHER, block n to block n"
  install_group "Matched blocks are linked by arrows" \
    "baja/bio/track-layer.js:THIRD PASS: ARROWS TO THE MATCHING BLOCK ON ANOTHER TRACK" \
    "baja/bio/match-layer.js:LINK TWO DRAWN SETS TOGETHER, block n to block n" \
    "baja/bio/similarity-map.js:The arrows, hung on one of the two layers so each pair is drawn once" \
    "baja/bio/search-region.js:An arrow from the region searched with to each place it was found"
  # What is on each track reaches the planner, so a layer can be named the way the user sees
  # it, and what was removed is named with its kind.
  install_group "The planner is told which layers each track carries" \
    "baja/manchester/menu/editor-command.js:name is what the user points at and the kind is what they mean" \
    "baja/bio/remove-layers.js:WITH THEIR KINDS. A list of names is not enough to retry with"
  # Deleting a layer from its popup menu: it did nothing at all when the track's layers had
  # been rebuilt underneath the confirmation, and nothing at all when no graph was stashed.
  install_group "Delete layer on the popup menu actually deletes it" \
    "baja/manchester/menu/track-layer-popup.js:DELETE BY WHAT THE LAYER IS, NOT BY THE OBJECT WE OPENED ON"
  install_group "Layer bars are hit where they were painted" \
    "baja/bio/track-layer.js:WHERE THIS BAR ACTUALLY LANDED" \
    "baja/manchester/menu/mouse-over-highlight.js:THE TEST IS AGAINST THE RECTANGLE THAT WAS PAINTED" \
    "baja/bio/protein/slim-motif-layer.js:The interval itself travels with the record" \
    "baja/bio/protein/cdd-domain-layer.js:painted rectangle on the interval"
  install_group "Ask: load protein motifs, within the selection" \
    "baja/manchester/menu/editor-capabilities.js:PROTEIN MOTIFS ARE A LAYER THE EDITOR ALREADY DRAWS" \
    "baja/bio/protein/slim-motif-layer.js:WITHIN THE SELECTION, WHEN ONE WAS ASKED FOR"
  # PSI THAT MUST NOT BE BELIEVED. SMN2 exon 7 was being drawn as "96% constitutive"
  # on an ASO target. The model was not wrong: cassette.tsv labels that exon 0.84 and
  # the truth is about 0.10, because SMN1 is 99.9% identical and short reads do not
  # separate the two, so the label is a blend and PSINet reproduced it. No retraining
  # changes that, so the editor now LOOKS THE EXON UP and declines to state a PSI for
  # one that sits in duplicated sequence.
  #
  # The intervals are a BED the server points at (bajasplice config --untrusted-bed);
  # with none configured nothing is flagged, and the ranking says so in as many words
  # rather than letting "nothing flagged" read as "clean".
  #
  # All of them or none, and the reason is specific here: track-layer.js suppresses the
  # percentage on the strength of layer.untrustedSpans, which only the launcher sets and
  # only the backend fills. Install the drawing without the backend and every exon keeps
  # its old number; install the backend without the drawing and the flag is computed and
  # never shown. Either half alone is the silent-wrong-number bug it is meant to fix.
  # The stability tag moved BELOW the exon. Above the capsule are the codon-number row
  # and the amino-acid letters, and the tag was being read through them; underneath,
  # gene-draw.js keeps the lower part of the track clear. Measured from the exon index
  # disc (40px, opaque, centred on the exon) rather than from the 14px capsule, or 10px
  # down would land the text under the disc.
  #
  # Its own group with its own marker, not folded into the group below: that group's
  # marker is from the previous change and track-layer.js already carries it, so a box
  # still serving the older copy would pass the served-check with the tag in the wrong
  # place. The marker has to be text that only this version has.
  # A PUBLISHED MEASUREMENT, where the model cannot be right. The group above
  # withholds PSI at duplicated loci; withholding is the most inference can do, and
  # for the exons that matter most someone has already measured the answer. SMN2
  # exon 7 is about a tenth, against the 96% the model learned from a label blended
  # with SMN1's reads. Shown as a measurement, in violet, with its range and its
  # citation, and never as corrected model output.
  #
  # measured_psi.tsv rides with the code: it is the data the three other files read,
  # and a box with the lookup but not the table shows nothing while reporting
  # success. The library files are listed one by one as the BajaNMD group does it,
  # so the entry script's sys.path fallback finds them on a box where the package
  # has not been pip-installed into the venv.
  install_group "Published exon-inclusion measurements, shown as measurements" \
    "py/bajasplice-lib/bajasplice/measured.py:A SEPARATE QUANTITY, not a correction" \
    "py/bajasplice-lib/bajasplice/data/measured_psi.tsv:KEYED ON THE EXON START" \
    "py/bio/splice/splicing-profile.py:PUBLISHED MEASUREMENTS for the same exons" \
    "baja/bio/splicing/splicing-profile.js:A PUBLISHED MEASUREMENT, where one exists" \
    "baja/bio/track-layer.js:A MEASUREMENT OUTRANKS BOTH" \
    "baja/bio/splicing/exon-ai-models.js:WHERE A MEASURED NUMBER CAME FROM"
  # ONE ARGUMENT SHORT IS NOT "NOTHING IN THE EDITOR DOES THAT". "add pathologic
  # mutations to selected sequence" is load_variants over the selection with no db:
  # the planner dropped the step and reported only the refusal, so the card had no
  # step to talk about. The step now travels incomplete and the card offers the four
  # databases as buttons. Nothing is filled in on the way -- the value is the user's
  # to pick, which is the rule the plan fallback above already states.
  #
  # All three together: plan.py sending the step with no card able to offer the
  # choice is the same dead end with an extra step in it, and the card offering a
  # choice it never receives is dead code.
  # THE VARIANT GOES INTO THE SEQUENCE THE MODEL SCORES. A ClinVar variant loaded
  # onto a track is an annotation: it marks a position and changes nothing, so a PSI
  # run scored the reference and the exon kept "98% stable" with a pathogenic
  # lollipop under it. Read as "this mutation does not affect splicing" that is the
  # wrong conclusion and an easy one. Each variant is now written into the sequence
  # and its cassette event scored again, and the tag says the move.
  #
  # The three travel together: the launcher gathering variants that the backend does
  # not score sends them nowhere, the backend scoring variants the launcher never
  # sends is dead code, and the tag is where the answer is read.
  # THE EXON STABILITY REPORT: every exon on the canvas in one ranked table, folding in
  # everything the PSI run already works out -- reliability weighted by conservation and
  # functional sites, exons in duplicated sequence that carry no trustworthy number,
  # published measurements, and what each variant does to inclusion. The per-track
  # ranking answers "which exon on this transcript"; choosing a target asks "which exon
  # anywhere", which meant reading five panels side by side.
  #
  # Both files or neither: the capability is how the report is reached from the ask box,
  # and without the module behind it the entry opens onto a missing script -- the failure
  # the all-or-none rule exists for.
  # DRAW BEFORE YOU AWAIT. A floating menu ends its session ~80 ms after an item's click
  # returns, and an async click returns the moment it first awaits, so an item that awaits
  # its work and only then draws is drawing into a closed session and does nothing at all.
  # Redirect acceptor (AG scan) had this outright; AI Models has it intermittently, saved
  # only by its module usually being cached. Both now draw a placeholder first.
  #
  # Its own group: menu-factory.js already carries markers from the earlier fix to
  # Predict effect of removing, and a box serving that copy would pass their served-check
  # with these two items still broken.
  install_group "Exon menu items draw before they await" \
    "baja/manchester/menu/menu-factory.js:DRAWS BEFORE IT AWAITS, like its neighbours below"
  install_group "The exon stability report, across every track" \
    "baja/bio/splicing/exon-stability-report.js:TYPESET FOR PAPER, not a screenshot of the panel" \
    "baja/bio/splicing/splicing-profile.js:WHY A RUN DID NOT PRODUCE A LAYER, left on the track" \
    "baja/manchester/menu/editor-capabilities.js:frameRange is this module"
  # Every panel that holds a table has the same problem: fitted to the canvas rect, the
  # exon stability report showed about ten rows of forty and clipped its chart. The
  # toggle lives in the shared shell rather than in one caller because fitToCanvas runs
  # again on every resize -- a caller styling the panel itself would lose its sizing the
  # first time the window moved.
  install_group "Overlay panels can be maximized" \
    "baja/lib/canvas-overlay-panel.js:MAXIMIZED: the whole viewport, not the canvas rect"
  install_group "A variant on the track is scored, not just drawn" \
    "py/bio/splice/splicing-profile.py:_BASE IS A LOOKUP TABLE, NOT A DICT" \
    "baja/bio/splicing/splicing-profile.js:Variant scoring failing is not the run failing" \
    "baja/bio/track-layer.js:THE WORST A VARIANT DOES TO THIS EXON"
  install_group "A missing argument is asked for, not refused" \
    "py/bio/editor/plan.py:A STEP ONE ARGUMENT SHORT IS STILL THE RIGHT STEP" \
    "baja/manchester/menu/editor-capabilities.js:A MISSING ARGUMENT IS A QUESTION, NOT A DEAD END" \
    "baja/manchester/menu/editor-command.js:ONE WORD SHORT IS NOT"
  install_group "The exon stability tag reads below the exon" \
    "baja/bio/track-layer.js:MEASURED FROM THE LINE THE EXON IS ON"
  install_group "PSI is withheld where the reads were not uniquely assignable" \
    "py/bajasplice-lib/bajasplice/untrusted.py:WHY A LOOKUP AND NOT A BETTER MODEL" \
    "py/bajasplice-lib/bajasplice/config.py:Exons whose PSI is not trustworthy because the reads behind it were not" \
    "py/bajasplice-lib/bajasplice/cli.py:export / check the low-mappability exon intervals" \
    "py/bio/splice/splicing-profile.py:WHICH CHROMOSOME, FOR THE MAPPABILITY LOOKUP ONLY" \
    "baja/bio/splicing/splicing-profile.js:THE CHROMOSOME, FOR THE MAPPABILITY LOOKUP" \
    "baja/bio/track-layer.js:NO NUMBER WHERE THE NUMBER IS NOT ABOUT THIS EXON" \
    "baja/bio/splicing/exon-ai-models.js:WHETHER MAPPABILITY WAS CHECKED AT ALL"
  install_group "A track can hold more than one selected region" \
    "baja/bio/track-flexi.js:MORE THAN ONE SELECTED REGION, WITHOUT MOVING THE ONE EVERYTHING READS" \
    "flexigraph/gene.js:THE EXTRA REGIONS GO TOO" \
    "baja/manchester/menu/editor-capabilities.js:IS TWO STEPS, the second one adding" \
    "py/bio/editor/plan.py:SEVERAL REGIONS IS SEVERAL STEPS"
  # BajaSpliceMM. Species became a setting of bajasplice rather than a fork of it, so these
  # go together or not at all: config.py alone would be harmless (it still answers as
  # human), but scan.py or weights/__init__.py without it would not import. No mouse
  # weights ride along -- *.pt is not in git -- so on the server this changes nothing until
  # a mouse model is trained and copied in; the human path is the same code as before.
  # The bajasplicemm command itself needs `pip install -e py/bajasplice-lib` once, to
  # register the entry point; `python -m bajasplicemm` works without it.
  install_group "BajaSpliceMM: bajasplice runs as mouse" \
    "py/bajasplice-lib/bajasplice/config.py:A SPECIES OWNS ITS OWN ROOT, CONFIG FILE AND" \
    "py/bajasplice-lib/bajasplice/__init__.py:Mouse (BajaSpliceMM) is the same package run as another species" \
    "py/bajasplice-lib/bajasplice/cli.py:A HUMAN-ONLY STEP MUST NOT RUN AS MOUSE" \
    "py/bajasplice-lib/bajasplice/genome.py:THE WRONG GENOME DOES NOT FAIL, IT ANSWERS" \
    "py/bajasplice-lib/bajasplice/index.py:SYMBOL CASE IS A SPECIES CONVENTION, NOT A DIFFERENCE BETWEEN GENES" \
    "py/bajasplice-lib/bajasplice/scan.py:checkpoints written before species existed are human by construction" \
    "py/bajasplice-lib/bajasplice/tracks.py:coordinates mean nothing without the assembly they are in" \
    "py/bajasplice-lib/bajasplice/weights/__init__.py:A BUNDLED WEIGHT BELONGS TO ONE SPECIES" \
    "py/bajasplice-lib/bajasplice/prepare/gencode.py:WHATEVER THE SPECIES" \
    "py/bajasplice-lib/bajasplice/prepare/splicesite.py:Build the splice-site training index from the flattened exon table" \
    "py/bajasplice-lib/bajasplice/train/splicesite.py:ORTHOLOGS CROSS THE SPLIT WHEN THE STARTING WEIGHTS DO" \
    "py/bajasplice-lib/bajasplice/evaluate/zero_shot.py:THIS CONTROL IS GENEROUS TO THE OTHER SPECIES" \
    "py/bajasplice-lib/bajasplice/evaluate/splicesite_report.py:One table for the splice-site task" \
    "py/bajasplice-lib/bajasplicemm/__init__.py:IMPORTING THIS MODULE SWITCHES THE WHOLE PROCESS TO MOUSE" \
    "py/bajasplice-lib/bajasplicemm/cli.py:the bajasplice CLI, as mouse" \
    "py/bajasplice-lib/bajasplicemm/__main__.py:from bajasplicemm.cli import main" \
    "py/bajasplice-lib/pyproject.toml:bajasplicemm.cli"
  # BajaSpliceDM: the same species setting, for fly. A separate group from the mouse one so
  # a ref that has mouse but predates fly still installs mouse. Fly reads an Ensembl GTF
  # and labels neighbouring genes' sites in training windows; neither touches the human
  # or mouse path. No fly weights ride along, for the same reason as mouse.
  install_group "BajaSpliceDM: bajasplice runs as fly" \
    "py/bajasplice-lib/bajasplice/config.py:WHICH NAMES" \
    "py/bajasplice-lib/bajasplice/genome.py:NOT ONE CHROMOSOME OF THIS SPECIES IS IN THE FILE" \
    "py/bajasplice-lib/bajasplice/datasets.py:A WINDOW IS LABELLED FROM ONE TRANSCRIPT BUT COVERS WHATEVER IS THERE" \
    "py/bajasplice-lib/bajasplice/prepare/gencode.py:ENSEMBL SPELLS THE BIOTYPE ATTRIBUTES DIFFERENTLY FROM GENCODE" \
    "py/bajasplice-lib/bajasplice/prepare/splicesite.py:neighbouring same-strand sites are labelled too" \
    "py/bajasplice-lib/bajasplice/evaluate/zero_shot.py:between a mammal and an insect" \
    "py/bajasplice-lib/bajasplice/cli.py:chromosomes named 2L, 3R, X" \
    "py/bajasplice-lib/bajasplicedm/__init__.py:IMPORTING THIS MODULE SWITCHES THE WHOLE PROCESS TO FLY" \
    "py/bajasplice-lib/bajasplicedm/cli.py:the bajasplice CLI, as fly" \
    "py/bajasplice-lib/bajasplicedm/__main__.py:from bajasplicedm.cli import main" \
    "py/bajasplice-lib/pyproject.toml:bajasplicedm.cli"
fi

# ---- 2c: the karyotype view: which variants go to the oligo editor ----------------
#
# A patch rather than a copy (manchester/karyotype.js is 20,000 lines and not otherwise part
# of a deploy). It edits five places in the server's copy, or changes nothing and says why.
# A refusal here is reported and the rest of the deploy carries on.
if [[ $DO_API -eq 1 ]]; then
  step "Karyotype: choose left, right or both variants for the editor"
  if curl -fsSL "$RAW/$REF/tools/hotfix/install-karyotype-side-choice.py" -o "$TMP/k.py" 2>/dev/null; then
    python3 "$TMP/k.py" "$APPS_DIR" || say "  Not applied (see above). Everything else carries on."
  else
    say "  install-karyotype-side-choice.py is not at ${REF:0:12}; skipped."
  fi
  step "Karyotype: the target sequence says which strand it is in"
  if curl -fsSL "$RAW/$REF/tools/hotfix/install-karyotype-allele-strand.py" -o "$TMP/k3.py" 2>/dev/null; then
    python3 "$TMP/k3.py" "$APPS_DIR" || say "  Not applied (see above). Everything else carries on."
  else
    say "  install-karyotype-allele-strand.py is not at ${REF:0:12}; skipped."
  fi
  step "Karyotype: one editor track per VCF, labelled gene · file"
  if curl -fsSL "$RAW/$REF/tools/hotfix/install-karyotype-vcf-tracks.py" -o "$TMP/k2.py" 2>/dev/null; then
    python3 "$TMP/k2.py" "$APPS_DIR" || say "  Not applied (see above). Everything else carries on."
  else
    say "  install-karyotype-vcf-tracks.py is not at ${REF:0:12}; skipped."
  fi
fi

# ---- 3: the Angular app ------------------------------------------------------
#
# This is the only step that compiles anything, and the only one that can fail for
# reasons that have nothing to do with the change being deployed (memory, a registry
# that is not reachable, a node too old). So it is opt-in, it says what it is about to
# overwrite before it does, and it keeps the previous web root beside the new one.
if [[ $DO_WEB -eq 1 ]]; then
  step "The Angular app"

  # Where the built app is served from. A guess here would overwrite a live site, so an
  # ambiguous answer stops rather than picking one.
  if [[ -z "${WEB_DIR:-}" ]]; then
    WEB_DIR="$(find_web_dir)" || true
    if [[ -n "$WEB_DIR" ]]; then
      say "Serving directory: $WEB_DIR (found; set WEB_DIR= to override)"
    else
      say "I could not tell where the built app is served from."
      say "nginx will say. Both of these print it:"
      say "  sudo nginx -T 2>/dev/null | grep -nE 'server_name|root '"
      say "  sudo grep -rl --include=index.html app-root /opt /var/www /srv /usr/share/nginx"
      die "Then re-run with WEB_DIR=<the directory holding index.html>."
    fi
  fi
  [[ -f "$WEB_DIR/index.html" ]] || die "$WEB_DIR has no index.html in it. That is probably not the serving directory."

  # The source. A checkout already on the box is used as it is; otherwise it is cloned
  # into /opt/src, which is this script's own directory and not in anyone's way.
  if [[ -z "${SRC_DIR:-}" ]]; then
    for d in /opt/src/baja /opt/baja-src ~/baja ~/src/baja; do
      [[ -d "$d/.git" && -f "$d/angular.json" ]] && { SRC_DIR="$d"; break; }
    done
  fi
  if [[ -z "${SRC_DIR:-}" ]]; then
    SRC_DIR=/opt/src/baja
    mkdir -p /opt/src
    if [[ ! -d "$SRC_DIR/.git" ]]; then
      say "Cloning milton900807/baja into $SRC_DIR…"
      git clone --depth 50 https://github.com/milton900807/baja.git "$SRC_DIR" \
        || die "Could not clone. If the repository is private, clone it by hand once with credentials this box has, then re-run with SRC_DIR=<that checkout>."
    fi
  fi
  say "Source: $SRC_DIR"
  command -v node >/dev/null || die "node is not installed, so the app cannot be built here. Build it where you normally do and copy dist into $WEB_DIR."
  command -v npm  >/dev/null || die "npm is not installed."
  say "node $(node -v), npm $(npm -v)"

  git -C "$SRC_DIR" fetch --depth 50 origin "$BRANCH" || die "Could not fetch origin/$BRANCH."
  git -C "$SRC_DIR" checkout -q "$BRANCH" 2>/dev/null || git -C "$SRC_DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
  git -C "$SRC_DIR" reset -q --hard "origin/$BRANCH"
  say "At $(git -C "$SRC_DIR" log --oneline -1)"

  # THIS TREE IS INSTALLED WITH --legacy-peer-deps. That is the intended mode, not a
  # workaround applied after something failed.
  #
  # ngx-monaco-editor-v2 asks for Angular 18 peers while the application is on Angular 17,
  # and the tree holds @angular/core at 17.3.8 beside an @angular/animations 17.3.12 that
  # demands core 17.3.12 exactly. Neither is new and neither breaks the build; the versions
  # that are actually installed are the ones the app has always been built against.
  #
  # It used to try a plain `npm ci` first and fall back. That printed forty lines of
  # ERESOLVE across the screen on every single frontend deploy, in the middle of the step
  # that takes longest, and the retry that followed was the real install. A deploy that
  # prints its own expected failure teaches whoever is watching to read errors as noise,
  # which is the opposite of what an error is for. So the flag is passed up front and the
  # reason is stated once.
  say "Installing dependencies with --legacy-peer-deps (this is the slow part)…"
  say "  (Angular 17 app, one package asking for 18 peers: expected, and how this tree builds.)"
  npm_in() { ( cd "$SRC_DIR" && npm "$@" --no-audit --no-fund ); }
  if [[ -f "$SRC_DIR/package-lock.json" ]]; then
    npm_in ci --legacy-peer-deps || {
      say "npm ci could not use the committed lock; installing without it."
      npm_in install --legacy-peer-deps
    }
  else
    npm_in install --legacy-peer-deps
  fi

  say "Building…"
  ( cd "$SRC_DIR" && npm run build ) || die "The build failed. Nothing was copied; $WEB_DIR is untouched."

  OUT="$SRC_DIR/dist"
  [[ -d "$OUT" ]] || die "No dist directory after the build."
  # Angular 17 writes dist/<project>/browser; older layouts write dist/<project>. Take
  # whichever one actually has an index.html in it.
  if [[ ! -f "$OUT/index.html" ]]; then
    CAND="$(find "$OUT" -maxdepth 3 -name index.html -printf '%h\n' 2>/dev/null | head -1)"
    [[ -n "$CAND" ]] || die "Built, but no index.html anywhere under $OUT."
    OUT="$CAND"
  fi
  say "Built into $OUT"

  # env.js is written on the server and is not in the build: it carries the landing-page
  # copy and the client ids for this domain. Losing it blanks the page, so it is put back
  # whatever the build produced.
  KEEP="$TMP/keep"; mkdir -p "$KEEP"
  for f in assets/env.js assets/config.json; do
    [[ -f "$WEB_DIR/$f" ]] && { mkdir -p "$KEEP/$(dirname "$f")"; cp -p "$WEB_DIR/$f" "$KEEP/$f"; say "Keeping $f"; }
  done

  STAMP="$(date +%Y%m%d%H%M%S)"
  BACKUP="$WEB_DIR.before-$STAMP"
  cp -a "$WEB_DIR" "$BACKUP"
  say "Previous site copied to $BACKUP"

  OWNER="$(stat -c '%u:%g' "$WEB_DIR")"
  if command -v rsync >/dev/null; then
    rsync -a --delete --exclude 'assets/env.js' --exclude 'assets/config.json' "$OUT"/ "$WEB_DIR"/
  else
    find "$WEB_DIR" -mindepth 1 -maxdepth 1 ! -name assets -exec rm -rf {} +
    cp -a "$OUT"/. "$WEB_DIR"/
  fi
  for f in assets/env.js assets/config.json; do
    [[ -f "$KEEP/$f" ]] && { mkdir -p "$WEB_DIR/$(dirname "$f")"; cp -p "$KEEP/$f" "$WEB_DIR/$f"; }
  done
  chown -R "$OWNER" "$WEB_DIR" 2>/dev/null || true
  say "Installed into $WEB_DIR"
fi

# ---- restart and prove it ----------------------------------------------------
if [[ $DO_RESTART -eq 1 ]]; then
  step "Restarting baja-server"
  systemctl restart baja-server
  OUT2=""
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    sleep 1
    OUT2="$(curl -fsS "localhost:$PORT/stripe/donation-session" 2>/dev/null || true)"
    [[ -n "$OUT2" ]] && break
  done
  systemctl is-active --quiet baja-server || die "baja-server did not come back. journalctl -u baja-server -n 50"
  if [[ -n "$OUT2" ]]; then
    printf '%s' "$OUT2" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print("  donation endpoint: stripeConfigured=%s  separate account=%s"
      % (d.get("stripeConfigured"), d.get("donationAccountIsSeparate")))
' 2>/dev/null || true
  else
    say "  the endpoint did not answer on port $PORT (re-run with PORT=<port> if the API listens elsewhere)."
  fi
fi

# ---- proving the server serves it --------------------------------------------
#
# A file on disk is not the same claim as a file being served. baja-server hands modules
# out through /script, and between the restart above and that endpoint there is room for
# an in-memory cache, a stale worker, or a path that resolves somewhere other than where
# this script just wrote. Each of those looks identical from the outside: the deploy says
# installed, the browser runs the old code, and the next hour is spent debugging the
# wrong thing.
#
# So every module this run installed is asked for BACK, through the running server, and
# checked for the marker that identifies the new version. A miss here is not fatal -- the
# bytes are on disk and a second bounce usually settles it -- but it is said plainly.
if [[ $DO_API -eq 1 && ${#SERVED_CHECK[@]} -gt 0 && $DO_RESTART -eq 1 ]]; then
  step "Checking the server serves what was installed"
  SERVED_BAD=0
  for entry in "${SERVED_CHECK[@]}"; do
    f="${entry%%|*}"; mk="${entry#*|}"
    # Only lionscript modules go through /script; python is loaded from disk per call.
    case "$f" in *.js) ;; *) continue ;; esac
    dir="${f%/*}"; base="${f##*/}"
    enc="${dir//\//%2F}"
    body="$(curl -fsS "localhost:$PORT/script?spath=$enc&rule_name=$base&v=$(date +%s)" 2>/dev/null || true)"
    if [[ -z "$body" ]]; then
      say "  $f: the server did not answer for it on port $PORT"; SERVED_BAD=$((SERVED_BAD+1)); continue
    fi
    if printf '%s' "$body" | grep -q -- "$mk"; then
      say "  $f: served, current"
    else
      say "  $f: SERVED STALE -- on disk but the server is still handing out the old one"
      SERVED_BAD=$((SERVED_BAD+1))
    fi
  done
  if [[ $SERVED_BAD -gt 0 ]]; then
    say ""
    say "  $SERVED_BAD file(s) are on disk but not being served. Bounce it again:"
    say "      sudo systemctl restart baja-server"
    say "  and if they are still stale, the server is loading them from somewhere other"
    say "  than $APPS_DIR -- check APPS_DIR against the service's own working directory."
  fi
fi

say ""
say "Done. Hard-refresh the browser (the app is cached): Ctrl-Shift-R, or Cmd-Shift-R."
[[ $DO_WEB -eq 1 ]] || say "The Angular app was not touched. Add --frontend to build and install it too."
