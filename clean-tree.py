import os

def remove_empty_folders_and_files(root_dir):
    for dirpath, dirnames, filenames in os.walk(root_dir, topdown=False):
        # Remove CSV, XLSX, and XLS files
        for filename in filenames:
            if filename.endswith(('.csv', '.xlsx', '.xls')):
                file_path = os.path.join(dirpath, filename)
                try:
                    os.remove(file_path)
                    print(f"Removed file: {file_path}")
                except Exception as e:
                    print(f"Error removing file {file_path}: {e}")
        
        # Remove empty folders
        if not os.listdir(dirpath):
            try:
                os.rmdir(dirpath)
                print(f"Removed empty folder: {dirpath}")
            except Exception as e:
                print(f"Error removing folder {dirpath}: {e}")

if __name__ == "__main__":
    root_directory = os.getcwd()  # Change this to the desired root directory if needed
    remove_empty_folders_and_files(root_directory)
