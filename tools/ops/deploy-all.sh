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
REF="${REF:-58a43bbeb0aa643b86abf2733b95a20de9b21023}"
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
    "baja/manchester/menu/snp-menu.js:header: true" \
    "baja/manchester/menu/track-layers-side-menu.js:header: true" \
    "baja/manchester/menu/menu-for-single-aso.js:header: true" \
    "baja/manchester/menu/allele-selective-design.js:header: true" \
    "baja/bio/splicing/clinvar-splice-variants.js:header: true" \
    "baja/data/rnaseq-hierarchy-menu.js:header: true" \
    "baja/manchester/menu/sample-compare.js:header: true"
  install_group "the hover handler does not take the first click" \
    "baja/manchester/menu/design-or-place.js:THE HOVER HANDLER WOULD TAKE THE FIRST CLICK" \
    "baja/manchester/menu/design-or-place.js:AND THE SELECTION WOULD TAKE IT BEFORE ANY LISTENER SAW IT"
  install_group "a chemistry editor, not two canned templates" \
    "baja/manchester/menu/chemistry-builder.js:BUILD A COMPOUND'S CHEMISTRY" \
    "baja/manchester/menu/design-or-place.js:Build a chemistry"
  install_group "place an ASO by hand, or design across the target" \
    "baja/manchester/menu/design-or-place.js:DESIGN THE SITE, OR CHOOSE THE SITE YOURSELF" \
    "baja/manchester/menu/track-design-menu.js:PLACE IT, OR DESIGN IT"
  install_group "analyse and map off-targets from the selection page" \
    "flexigraph/gene.js:WHAT THE SCREEN FOUND, once it has been run" \
    "baja/manchester/menu/map-off-targets.js:PUT THE COMPOUND ON THE GENE IT SHOULDN"
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
  install_group "selected sequence: ML menu, and which RBP wins the stretch" \
    "baja/manchester/menu/selected-sequence-menu.js:The models that take a SPAN" \
    "baja/bio/rbp/rbp-competition.js:WHICH RBP WINS THIS STRETCH" \
    "py/bio/rbp/rbp-competition.py:WHY A COMPETITION RATHER THAN A SCORE"
  install_group "cis-regulatory: a bin too small to scramble is said, not swallowed" \
    "baja/bio/splicing/cis-attribution.js:THE SMALLEST BIN THAT MEASURES ANYTHING" \
    "py/bio/splice/cis-profile.py:The smallest bin that measures anything"
  install_group "BajaSplice in place of LJSplice v2, opened at the pointer" \
    "manchester/editor.js:in place of the old LJSplice v2 window" \
    "baja/manchester/menu/menu-factory.js:openMenuAtPointer(__bajaSplice"
  install_group "editor loading notice" \
    "manchester/editor.js:baja-loading-notice"
  install_group "baja-project: progress bar first, Add to a fundraising campaign" \
    "cpd/baja-project.js:__bajaOpening"
  install_group "baja-analytics: progress bar first" \
    "cpd/baja-analytics.js:__bajaOpening"
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
  # All four or none: the catalogue entry and the track menu would both open onto a
  # layer that is not there, and the layer would call a scan that is not there.
  install_group "linear motifs (ELM)" \
    "baja/bio/protein/slim-motif-layer.js:SHORT LINEAR MOTIFS AS A LAYER" \
    "baja/bio/protein/slim-motif-panel.js:The description window for one linear motif" \
    "py/bio/protein/motif-lookup.py:Describe one ELM motif class when the catalogue has no description" \
    "baja/bio/protein/motif-impact.js:MOTIF IMPACT OF ONE MISSENSE VARIANT" \
    "py/bio/protein/slim-scan.py:SLIM scan -- short linear motifs" \
    "baja/manchester/menu/mouse-over-highlight.js:LINEAR MOTIFS (ELM), the sibling" \
    "baja/ml/models-catalogue.js:title: 'Linear motifs', badge: 'ELM', ready: true"
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

  # THIS TREE NEEDS --legacy-peer-deps, and saying so is better than discovering it.
  #
  # ngx-monaco-editor-v2 asks for Angular 18 peers while the application is on Angular 17,
  # and the committed lock holds @angular/core at 17.3.8 beside an @angular/animations
  # 17.3.12 that demands core 17.3.12 exactly. Neither is new and neither breaks the build:
  # the tree was installed with peer checking off, which is how it has always been built.
  # So npm ci is tried honestly first, and the flag is the fallback rather than the habit.
  # Aligning the versions properly is a separate job; it is not one to do inside a deploy.
  say "Installing dependencies (this is the slow part)…"
  npm_in() { ( cd "$SRC_DIR" && npm "$@" --no-audit --no-fund ); }
  if [[ -f "$SRC_DIR/package-lock.json" ]]; then
    npm_in ci || {
      say "npm ci would not resolve the peers; retrying with --legacy-peer-deps, which is"
      say "how this tree has always been installed."
      npm_in ci --legacy-peer-deps || npm_in install --legacy-peer-deps
    }
  else
    npm_in install || npm_in install --legacy-peer-deps
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
