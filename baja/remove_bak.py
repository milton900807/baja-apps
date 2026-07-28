import os

def remove_bak_files(base_dir):
    """
    Recursively removes all .bak files from the given directory.
    """
    removed = 0
    for root, _, files in os.walk(base_dir):
        for file in files:
            if file.endswith(".bak"):
                path = os.path.join(root, file)
                try:
                    os.remove(path)
                    print(f"🗑️  Removed: {path}")
                    removed += 1
                except Exception as e:
                    print(f"⚠️ Could not remove {path}: {e}")
    print(f"\n✅ Done. Removed {removed} .bak file(s).")

if __name__ == "__main__":
    directory = input("Enter folder path to clean .bak files: ").strip()
    if not os.path.isdir(directory):
        print("❌ Invalid folder path.")
    else:
        print(f"🔍 Scanning recursively in: {directory}\n")
        remove_bak_files(directory)

