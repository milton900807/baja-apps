import os
from ion import works


def read_from_file(file_path):
    try:
        with open(file_path, 'r') as file:
            return file.read()
    except FileNotFoundError:
        return "File not found."
    
def write_to_file(file_path):
    content = input("Enter content to write to the file: ")
    with open(file_path, 'w') as file:
        file.write(content)
    return "Content written to file."

def check_and_create_file(file_path):
    if not os.path.exists(file_path):
        open(file_path, 'w').close()  # Create the file if it does not exist
        print(f"File '{file_path}' created.")
    else:
        print(f"File '{file_path}' already exists.")

def main():
    try: 
        folder_path = works.param (1)
        user = works.param (2)
        duser = works.aes_encrypt ( user )
        console.log ( ' \t' + duser );
        base_user_folder = '../trailscript/users' 
        folder_path = os.path.join(base_user_folder, duser, folder_path)
        folder_path = input("Enter the path to the folder: ")
        file_path = os.path.join(folder_path, '.share')
        check_and_create_file(file_path)
        choice = input("Do you want to read from or write to the file? (read/write): ").lower()
        if choice == 'read':
            content = read_from_file(file_path)
            print("Content of the file:")
            print(content)
        elif choice == 'write':
            message = write_to_file(file_path)
            print(message)
            works.resolve ( {'message':message })
        else:
            print("Invalid choice.")
            works.resolve ( {'message':'failed' })
    except Exception as e:
        works.resolve({'status':'failed'})
        print (e)

if __name__ == "__main__":
    main()