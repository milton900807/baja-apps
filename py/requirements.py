import os
import ast
import sys
from collections import defaultdict

def get_imports_from_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        node = ast.parse(file.read(), filename=file_path)
    
    imports = set()
    for n in ast.walk(node):
        if isinstance(n, ast.Import):
            for name in n.names:
                imports.add(name.name.split('.')[0])
        elif isinstance(n, ast.ImportFrom):
            imports.add(n.module.split('.')[0])
    
    return imports

def get_all_python_files(directory):
    py_files = []
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.py'):
                py_files.append(os.path.join(root, file))
    return py_files

def generate_requirements(directory):
    all_imports = set()
    python_files = get_all_python_files(directory)

    for file_path in python_files:
        imports = get_imports_from_file(file_path)
        all_imports.update(imports)
    
    # Standard library modules to exclude
    stdlib_modules = set(sys.builtin_module_names)
    excluded_prefixes = {'__future__', 'builtins', 'contextlib', 'dataclasses', 'encodings', 'importlib', 'io', 'marshal', 're', 'sys', 'typing', 'unittest', 'warnings'}
    
    dependencies = [dep for dep in all_imports if dep not in stdlib_modules and not any(dep.startswith(prefix) for prefix in excluded_prefixes)]

    with open('requirements.txt', 'w', encoding='utf-8') as f:
        for dep in sorted(dependencies):
            f.write(dep + '\n')

if __name__ == "__main__":
    directory = '.'  # You can specify the directory you want to scan here
    generate_requirements(directory)
