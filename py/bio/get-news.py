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
    "ASO, siRNA and gene-therapy patents 2016-2026 are now installed: 9,252 patents "
    "mapped onto 650,131 transcripts. Load them from Layers > Data > Patents > "
    "ASO / siRNA / gene therapy, then hover a hit for its title, filing and grant dates.",
    "Patents also draw genome-wide in the karyotype: zoom into a chromosome to read "
    "the title and dates beside each one.",
    "Sept 29 release of liver RNASeq data",
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
