import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
# Email settings
sender_email = "milton@lajollalabs.com"
receiver_email = "jeffmilto@gmail.com"
smtp_server = "smtp.sendgrid.net"  # Change to your SMTP server
smtp_port = 465  # Change to your SMTP server's port
smtp_username = "milton@lajollalabs.com"  # SMTP username

directory_to_monitor = "./"

class NewFileHandler(FileSystemEventHandler):
    def on_created(self, event):
        if not event.is_directory:
            new_file = event.src_path
            print(f"New file created: {new_file}")
            self.send_email(new_file)

    def send_email(self, file_name):
 
  # Read the content of the new file
        try:
            png_file_path = file_name
             # Check if the file is a PNG
            if not png_file_path.lower().endswith('.png'):
                with open(file_name, 'r') as file:
                    file_content = file.read()
                    print ( file_content )


                msg = MIMEText(f'{file_content}')
                #msg.attach(MIMEText(file_content, "plain"))
                #msg = MIMEText(f'New file {file_name}')
                msg['From'] = sender_email
                msg['To'] = receiver_email
                msg['Subject'] = f"{file_name}"
                msg['Body']=file_content
            else:
                msg = MIMEMultipart()
                msg.attach(MIMEText(f"{file_name}", "plain"))
                 # Open the PNG file in binary mode and attach it to the email
                with open(png_file_path, "rb") as image_file:
                    image = MIMEImage(image_file.read(), _subtype="png")
                    image.add_header("Content-Disposition", "attachment", filename=png_file_path.split("/")[-1])
                    msg.attach(image)
                    msg['From'] = sender_email
                    msg['To'] = receiver_email
                    msg['Subject'] = f"{file_name}"
        except Exception as e:
            print(f"Failed to read file {file_name}: {e}")
            return
        try:
            
            key = os.environ.get('SENDGRID_API_KEY')
            print ( key )
            with smtplib.SMTP_SSL('smtp.sendgrid.net', 465) as server:
                print ( ' sending..')
                server.login('apikey', key)
                server.send_message(msg)
                print("Email sent successfully.")
        except Exception as e:
            print(f"Failed to send email: {e}")

if __name__ == "__main__":
    event_handler = NewFileHandler()
    observer = Observer()
    observer.schedule(event_handler, path=directory_to_monitor, recursive=False)
    observer.start()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

