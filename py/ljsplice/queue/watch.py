import time
import os
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from queue import Queue, Empty
from threading import Thread

class Watcher:
    def __init__(self, directory_to_watch, processing_script):
        self.observer = Observer()
        self.directory_to_watch = directory_to_watch
        self.processing_script = processing_script

    def run(self):
        event_handler = Handler()
        self.observer.schedule(event_handler, self.directory_to_watch, recursive=True)
        self.observer.start()
        try:
            while True:
                time.sleep(5)
        except:
            self.observer.stop()
            print("Observer Stopped")

        self.observer.join()

    def get_queue_items(self):
        items = []
        try:
            while True:
                # Non-blocking get from the queue
                items.append(file_queue.get_nowait())
        except Empty:
            pass
        return items

    def remove_item_from_queue(self, item_to_remove):
        items = self.get_queue_items()  # Get all items
        # Put back all items except the one to remove
        for item in items:
            if item != item_to_remove:
                file_queue.put(item)

class Handler(FileSystemEventHandler):
    @staticmethod
    def on_any_event(event):
        if event.is_directory:
            return None

        elif event.event_type == 'created':
            print(f"Received file - {event.src_path}")
            file_queue.put(event.src_path)

def process_file_from_queue():
    while True:
        file_path = file_queue.get()
        print(f"Processing {file_path}")
        os.system(f"python {processing_script} {file_path}")
        file_queue.task_done()

file_queue = Queue()
watch_directory = "./drop"
processing_script = "./process/exec.py"
processing_thread = Thread(target=process_file_from_queue)
processing_thread.daemon = True
processing_thread.start()
w = Watcher(watch_directory, processing_script)

# Example usage of new methods
#print("Current queue items:", w.get_queue_items())
#w.remove_item_from_queue('/path/to/remove/item')
#print("Queue items after removal:", w.get_queue_items())

# Start watching
w.run()

