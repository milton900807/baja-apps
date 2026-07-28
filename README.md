# Repository Name

## Overview

This repository contains a comprehensive collection of scripts, configurations, and data files used for bioinformatics research and analysis. The structure is organized into several main directories, each focusing on specific aspects of the project, such as bioinformatics alignments (`bio/align`), chemistry configurations (`config/chemistry`).. and more

## Structure

- **bio/**: Contains scripts and utilities for bioinformatics analyses, including alignment algorithms, utility functions, and test scripts.
  - **align/**: Scripts related to sequence alignment, including Smith-Waterman implementations and utilities for matrix operations.
- **clin/**: Scripts for clinical data processing and analysis. (DEPRECATED)
- **config/chemistry/**: JSON and other configuration files for various chemistry-related settings and templates.
- **data/hts/**: High Throughput Screening (HTS) data files for various studies, including FDA-approved treatments and knockdown experiments.
- **flexigraph/**: A collection of scripts for generating and manipulating  graphs for bioinformatics.
- **genome/**: Utilities and editors for genome annotation and manipulation.
- **ljl/**: A comprehensive suite for sequence alignment, chemistry structure editing, and more, following a modular architecture.
- **py/**: A diverse set of Python scripts for bioinformatics analysis, data extraction, machine learning, and chemical compound analysis.

## Getting Started

1. **Clone the Repository**: To get started with the project, clone this repository to your local machine or server environment.


2. **Environment Setup**: Ensure you have the required environments for Python and Node.js. Python 3.x and Node.js 12.x or newer are recommended.

- For Python:
  ```
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt
  ```
- For Node.js: v18.16.1
  ```
  npm install
  ```

3. **Explore the Directories**: Navigate through the directories to find the scripts, data files, or configurations you need. For specific analyses, refer to the readme files within each directory (if available).

# Oligonucleotide Chemistry

This repository contains files defining the chemical structures of oligonucleotide compounds, particularly focusing on their templates for synthesis or modification. Oligonucleotides are short sequences of nucleotides, the basic building blocks of DNA and RNA, essential in genetic research, diagnostics, and therapeutics.

## File Descriptions

### JSON Files

1. **5-9-5-moe-fullPS.json**
   - **Type:** Gapmer
   - **Structure:** 9-5-9
   - **Description:** Defines a gapmer oligonucleotide with a central region (the gap) of DNA nucleotides (`d()sp.`) flanked by modified nucleotides (`moe()sp.`). The "fullPS" indicates a fully phosphorothioated backbone, enhancing nuclease resistance and binding affinity.
   - **Name:** 9-5-9-moe-fullPS

2. **15mer-full-moe.json**
   - **Type:** aso
   - **Structure:** 15 nucleotides long
   - **Description:** Describes a fully modified antisense oligonucleotide with each nucleotide modified with a methoxyethyl (MOE) group, improving the oligonucleotide's stability and affinity for its target RNA.
   - **Name:** 15mer-full-moe

3. **16mer-full-moe.json**
   - **Type:** aso
   - **Structure:** 16 nucleotides long
   - **Description:** full ps backbone.
   - **Name:** 16mer-full-moe

### .ljlchem Files

The following files contain chemical structure definitions or synthesis templates for antisense oligonucleotides with specific modifications:

- **5-10-5-aso-template.ljlchem**: Specifies the synthesis template for an ASO.
- **5-10-5-lna.ljlchem**: Details modifications involving locked nucleic acid (LNA) for increased stability and affinity.
- **5-10-5-moe.ljlchem**: Defines modifications with methoxyethyl (MOE) groups.
- **5-10-5-moe-nl.ljlchem**: Similar to `5-10-5-moe.ljlchem`, but with the n-Lorem PS backbone structure


# Communicating between JS & Python (works.py Utility Script)

## Overview

`works.py` is a Python script that offers a comprehensive set of utilities for facilitating interaction between JavaScript and Python within web or hybrid applications. It provides functionalities for message passing, encryption/decryption, file handling, and progress reporting, making it an essential tool for applications requiring cross-language communication and secure data handling.

## Features

- **Environment Variables:** Utilizes environment variables for configuration, such as `FIG_HOST` for setting up image server URI.
- **Message Passing:** Functions like `resolve()`, `show()`, `msg()`, `progress()`, and `update()` allow for structured message passing between JavaScript and Python.
- **Encryption/Decryption:** Includes `aes_encrypt()` and `aes_decrypt()` functions for secure data handling, using AES encryption with CBC mode.
- **File Handling:** Offers methods for managing temporary files and directories (`tempfile()`, `tempdir()`), along with utilities for converting binary files to JSON format (`binary_file_to_json()`).
- **Parameter Parsing:** Provides functions for parsing and processing command-line arguments (`param()`, `arg()`) with support for recognizing and converting data types.

## Usage

1. **Message Passing:** To send a message from Python to JavaScript, use the `msg()` function with the message string as the argument.
2. **Progress Reporting:** Use the `progress()` function to report operation progress from Python to JavaScript by passing a numeric value.
3. **Encryption/Decryption:** To encrypt or decrypt data, utilize `aes_encrypt()` and `aes_decrypt()` with the appropriate key, IV (Initialization Vector), and data.
4. **File Handling:** For creating temporary files or directories, call `tempfile()` with the desired file extension or `tempdir()` for directories.
5. **Parameter Parsing:** Access command-line arguments in a structured manner using `param()` or `arg()` to facilitate data exchange between JavaScript and Python.

## Example

```python
# Encrypting an email
encrypted_email = aes_encrypt("example@example.com", "your_aes_key", "your_iv")
print(f"Encrypted email: {encrypted_email}")

# Decoding and displaying a message
msg("Hello from Python to JavaScript!")



## Overview

These files support the development of oligonucleotide-based drugs by providing structured templates for designing ASOs with specific chemical modifications. These modifications are tailored to enhance therapeutic efficacy, stability, and resistance to enzymatic degradation, crucial for biotechnology applications and the development of treatments for various diseases by targeting genetic material at the molecular level.
