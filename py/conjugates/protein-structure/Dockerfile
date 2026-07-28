# Use an official Ubuntu base image
FROM ubuntu:latest


# Set environment variables
ENV PSIPRED_HOME=/opt/psipred
ENV DISOPRED_HOME=/opt/disopred
ENV BLAST_DB=/data/blastdb
ENV PATH="${PSIPRED_HOME}/bin:${DISOPRED_HOME}:${PATH}"



# Install dependencies, including Vim
RUN apt-get update && apt-get install -y \
    wget \
    gcc \
    make \
    unzip \
    ncbi-blast+ \
    perl \
    vim \  
    && rm -rf /var/lib/apt/lists/*

# Create a directory for PSIPRED
RUN mkdir -p ${PSIPRED_HOME}

# Download PSIPRED
# Replace this URL with the actual URL to the PSIPRED version you're using
RUN wget -q -O /tmp/psipred4.0.tar.gz "http://bioinfadmin.cs.ucl.ac.uk/downloads/psipred/psipred.4.02.tar.gz"

# Extract PSIPRED
RUN tar -xzf /tmp/psipred4.0.tar.gz -C ${PSIPRED_HOME} --strip-components=1 && \
    rm /tmp/psipred4.0.tar.gz

# Compile PSIPRED
RUN mkdir -p ${PSIPRED_HOME} ${DISOPRED_HOME} ${BLAST_DB}

# Download example BLAST databases (replace or remove with your actual database)
# Note: This is for demonstration purposes. You should adjust this to download and set up your required BLAST databases.
RUN mkdir -p ${BLAST_DB} && \
    cd ${BLAST_DB} && \
    wget "ftp://ftp.ncbi.nlm.nih.gov/blast/db/FASTA/swissprot.gz" && \
    gunzip swissprot.gz && \
    makeblastdb -in swissprot -dbtype prot



# Download DISOPRED
# Replace this URL with the actual URL to the DISOPRED version you're using
RUN wget -q -O /tmp/disopred.tar.gz "http://bioinfadmin.cs.ucl.ac.uk/downloads/DISOPRED/DISOPRED3.16.tar.gz"
# http://bioinfadmin.cs.ucl.ac.uk/downloads/DISOPRED/DISOPRED3.16.tar.gz

# Extract DISOPRED
RUN tar -xzf /tmp/disopred.tar.gz -C ${DISOPRED_HOME} --strip-components=1 && \
    rm /tmp/disopred.tar.gz

# Compile DISOPRED (if necessary)
# Assume DISOPRED compile commands are here, if any

# Configure DISOPRED (update paths in config files, etc.)
# DISOPRED requires you to set the path to the PSIBLAST executable and the NR database in its config file
# RUN sed -i "s|/path/to/psiblast|$(which psiblast)|g" ${DISOPRED_HOME}/disopred_runners/*.pl
# RUN sed -i "s|${BLAST_DB}|g" ${DISOPRED_HOME}/disopred_runners/*.pl



# Copy all files in the current directory to /work in the container
COPY . /work

# Make /work the working directory
WORKDIR /work

# Define /work as a mountable volume
VOLUME /work


# Set working directory
WORKDIR ${PSIPRED_HOME}

# Set up entrypoint or default command
# This could be a script that runs PSIPRED or simply a shell to interact with the container
CMD ["/bin/bash"]
