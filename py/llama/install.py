import argparse
import os
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--model-dir", default=os.getenv("LLAMA_MODEL_DIR"))
parser.add_argument("--chunk-size", type=int, default=os.getenv("LLAMA_CHUNK_SIZE", 20))
args = parser.parse_args()

LLAMA_MODEL_DIR = Path(args.model_dir).resolve()
LLAMA_CHUNK_SIZE = args.chunk_size