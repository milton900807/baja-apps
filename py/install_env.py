





def write_string_to_file(file_path, content):
    """Write a given string to a file specified by the file path."""
    with open(file_path, 'w') as file:
        file.write(content)
        print(f"Content written to {file_path}")



# export LJL_TENTANT_ID="b543ef7e-428b-4226-ad00-99b67b843915"
# export LJL_CLIENT_ID="c3e5ffbc-9b1c-44a5-93b6-7cb909b42481"
# export THUMPRINT=76997E3BB9E4E73D414C7F2F002E8BF903F49444
# export APP_CERT_PATH=/etc/ssl/certs/app.pem
import os

# Set environment variables





os.environ['LJL_TENTANT_ID'] = "b543ef7e-428b-4226-ad00-99b67b843915"
os.environ['LJL_CLIENT_ID'] = "c3e5ffbc-9b1c-44a5-93b6-7cb909b42481"
os.environ['THUMPRINT'] = "76997E3BB9E4E73D414C7F2F002E8BF903F49444"
os.environ['APP_CERT_PATH'] = "/etc/ssl/certs/app.pem"

# Verify that the variables are set (for demonstration purposes)
print("Environment Variables Set:")
print("LJL_TENTANT_ID:", os.environ.get('LJL_TENTANT_ID'))
print("LJL_CLIENT_ID:", os.environ.get('LJL_CLIENT_ID'))
print("THUMPRINT:", os.environ.get('THUMPRINT'))
print("APP_CERT_PATH:", os.environ.get('APP_CERT_PATH'))

# Your script's functionality that requires these environment variables goes here


tv = """-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA6YKXxcKQ1UJ0na0J0piNntFzBGmCv26xoQGPLi0lmcH4C9yn
mHfh9jI5iqtZBIBtgF18omdLh8Sik4VZ6i7sUGVzPdxSd/t0TA5STkL3vpyt/Cfr
W46ZCmGLf6CLTiOZaqC6cc/z4ZysWD9qUcZgOXBnf3kn9WUaPbB2yMk9JPrCdO6q
MbWt95kUWS85dN2e2s3+3NN5WIl/AMG0fZ4sHqTM+fVic2GP+KTp6264QIHGnkjM
0XaadzncRWrQs3oY/Iu5iJruprXSjRQfx4S5jUM1Tvqnot98FKJdmaLTNwpvW7c4
KGUmDo1IEMTb6TffuWzoLWLQMX2EXCvx7qOkzQIDAQABAoIBAQC0NQ2OGC6P9l5r
BQyMkyDQTVHXONonhHTfDYYDG+Jlu/UCqoJIv1QKHQ6dPslPGRHou70g1FjM6WqS
MJqIiTfkf7alKfAXGl7RB0hrj3EEkIQREnmnSfA/u7Hdh/eaEQ0n5eydQuAy4Cd9
X0tc2pyOF3o4PTciQakzrIivQebHLqi9At9Zo2gGVg3TADKu9eS2LKpJiDhHlxU1
nueDjMnl57JGriQp7afvddU6MZGgotOiT+WkWoXxZ0zlxsAikTrrRagcEkKvR/gU
Q8U348HVVfxOicADd+mpzI3NnukgDp3wLH+KFkaQ3tBZLNN41PHWfli7MdhM+u5i
3sRBzAtdAoGBAP+hoA1pG7tz4yd9hNpZkemVs/5M2JnlRLwTWMfyHVJ8r+O+iw2m
t3sTk9VpfIUU/WaLYgd/BzVIsBgtM3huDQ+yVhM1B5kB0kgFALDEx78UfJS2PfRm
DLaIF2DN6WWeufe1dIzvE8d12cYWgfYiDWp9lE/wGoGSH72wDS7w2kZ/AoGBAOnY
zQYXqiQb98krJHlMrw218qLJDUhl8dVXyzRGhb9au2fKSBsGsPx/UeAGGu+7v/V9
wk/5DTv9rrWBt3gh3c0MozIdHv7CWVpVeySlxakSIgGJ4Y0AUUUu+Sj483nHRFWz
0sIwv+A6ZZVdEApetS1ytnfjVcibkvI6c4cIsqazAoGBALhdNvO1FL0zLWbzzfc0
llmjEHedsLH9en8ybNt3sNIm/yv/5oXn8XigfAR02cuZgdCNQhwp72bsj6RAJVj7
9guWESI1Is+lUqWChib3JSCYg+k1LqWvXAfhSwsUNvqFaZZPlkl2vAsk4fVNklmT
4Z0mCOtGPbepTZ8e88MhDiu9AoGATf4zE08dPgHd+Mhc1+ANmoMOs+Bef8EQkVlA
uuSygwnd61X6CpmGuhA03ITswvxZn6UcA9RK57FKbdsft/+DnHoUjAhOaCWl640L
D0QC0srrcJvuEDsE4BA0pceyXPFrBzJ8nqvnsv+HFfP9/5dq0geqd/3ohInuzr9T
/LuX6iUCgYB39n2XsftQ3QP+IdnV0BWR3vutoxymOcBRzSRlcHjbMtfZhDsZ+yBv
pIxfWQXeYjsZt/SZkCuTZOKkVE7/IWoUDfXcUtS5RKfU7m0iIh2odFjHalzzMa4A
v86iOdzUfVlwEbgG8RFozT2w8wWCWy4jvb14CmSto9P7LjNMLV8Sug==
-----END RSA PRIVATE KEY-----"""


write_string_to_file ( os.environ.get('APP_CERT_PATH'),  tv )
write_string_to_file ( "./hts-app.pem",  tv )
