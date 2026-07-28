const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const secretKeyHex = "A4BA8B43795566F988FF8FCBC3016E70";
const byteArray = Buffer.from(secretKeyHex, 'hex');
const iv = createIVFromString('powers');

function createIVFromString(inputString) {
    return crypto.createHash('md5').update(inputString).digest();
}

function addSuffixAndDate(email) {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const formattedDate = futureDate.toISOString().split('T')[0];
    return `${email}_d${formattedDate}`;
}

function processEmailFile(inputFile) {
    try {
        const data = fs.readFileSync(inputFile, 'utf-8');
        const emails = data.split('\n').map(line => line.trim()).filter(line => line);
        const modifiedEmails = emails.map(email => addSuffixAndDate(email));

        fs.writeFileSync('processed_emails.txt', modifiedEmails.join('\n'), 'utf-8');
        console.log("Processed emails saved to processed_emails.txt");
    } catch (error) {
        console.error("Error processing email file:", error.message);
    }
}

const inputFile = process.argv[2];
if (!inputFile) {
    console.log("Usage: node process-emails.js <inputFile>");
    process.exit(1);
}

processEmailFile(inputFile);
