import os
import json

# Return the installed news/message list. Stored server-side at BIG_DATA/news.json.
# On first run the file does not exist, so we seed it with the default messages and
# write it out — thereafter the server admin can edit news.json to change the list.
#   let r = await exec('py/bio/get-news.py', em)
#   let messages = JSON.parse(r.messages)   // string[]

from ion import works

_BD = os.environ.get("BIGDATA") or os.environ.get("BIG_DATA") or os.path.expanduser("~/baja-bd")
news_file = os.path.join(_BD, "news.json")

# Only used to SEED news.json on a host that has none; once the file exists the
# admin edits that, not this. Kept current anyway, because a fresh install
# otherwise announces something that already shipped.
DEFAULT = [
    "Target discovery modules are now installed under Analyze: allele-selective targets, "
    "synthetic lethality, paralog partners, and the loss matrix they all reason from.",
    "Allele-selective targets: where the two copies of a gene differ in SEQUENCE, an oligo "
    "can destroy one and leave the other. Three mechanisms - a tumor that kept one allele, "
    "a phased disease haplotype, or the mutation itself - over any gene, selection or "
    "region. Analyze > Allele-Selective Targets.",
    "Synthetic lethality: BAJA-3 screens DepMap live for the gene a tumor cannot survive "
    "losing given the losses it already carries, lineage-corrected and with the therapeutic "
    "window beside it, plus the published catalogue for the same losses. Analyze > "
    "Synthetic Lethality.",
    "Paralog partners: a trained classifier predicts which paralog becomes the copy the "
    "cell cannot then do without - answering for genes the DepMap panel has too few cell "
    "lines to screen. Analyze > Synthetic Lethality > Paralog partners.",
    "Loss of heterozygosity now reads out the genes in its tracts and splits them into "
    "complete two-hit losses and single-copy candidates, with copy number tested rather "
    "than assumed.",
    "Every module carries its own documentation: what it reads, what each number means, and "
    "where it is known to be wrong.",
]

messages = None
try:
    if os.path.exists(news_file):
        with open(news_file) as f:
            data = json.load(f)
        if isinstance(data, list):
            messages = [str(m) for m in data if str(m).strip()]
        elif isinstance(data, dict) and isinstance(data.get("messages"), list):
            messages = [str(m) for m in data["messages"] if str(m).strip()]
except Exception:
    messages = None

if not messages:
    messages = DEFAULT
    # First installation — seed the file with the defaults.
    try:
        os.makedirs(_BD, exist_ok=True)
        with open(news_file, "w") as f:
            json.dump(messages, f, indent=2)
    except Exception:
        pass

works.resolve({"messages": json.dumps(messages)})
