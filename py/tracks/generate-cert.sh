#!/bin/bash

# Define certificate details
CERT_NAME="my_ssl_cert"
CERT_DIR="./certs"
DAYS_VALID=365
COUNTRY="US"
STATE="California"
LOCALITY="San Diego"
ORGANIZATION="My Organization"
ORG_UNIT="IT"
COMMON_NAME="localhost"
EMAIL="admin@example.com"

# Create the directory for storing the certificate
mkdir -p ${CERT_DIR}

# Generate the private key
openssl genpkey -algorithm RSA -out ${CERT_DIR}/${CERT_NAME}.key -pkeyopt rsa_keygen_bits:2048

# Generate the certificate signing request (CSR)
openssl req -new -key ${CERT_DIR}/${CERT_NAME}.key -out ${CERT_DIR}/${CERT_NAME}.csr -subj "/C=${COUNTRY}/ST=${STATE}/L=${LOCALITY}/O=${ORGANIZATION}/OU=${ORG_UNIT}/CN=${COMMON_NAME}/emailAddress=${EMAIL}"

# Generate the self-signed certificate
openssl x509 -req -days ${DAYS_VALID} -in ${CERT_DIR}/${CERT_NAME}.csr -signkey ${CERT_DIR}/${CERT_NAME}.key -out ${CERT_DIR}/${CERT_NAME}.crt

# Output file paths
echo "Private Key: ${CERT_DIR}/${CERT_NAME}.key"
echo "Certificate: ${CERT_DIR}/${CERT_NAME}.crt"
echo "CSR: ${CERT_DIR}/${CERT_NAME}.csr"
