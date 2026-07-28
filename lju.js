const crypto = require('crypto');

const [operation, userInput] = process.argv.slice(2);

const secretKeyHex = "A4BA8B43795566F988FF8FCBC3016E70";
console.log('Key length: ' + secretKeyHex.length);
const byteArray = Buffer.from(secretKeyHex, 'hex');

function createIVFromString(inputString) {

    const iv = crypto.createHash('md5').update(inputString).digest();
    return iv;
}
const iv = createIVFromString('powers');
function createIVFromString(inputString) {

    const iv = crypto.createHash('md5').update(inputString).digest();
    return iv;
}

function encodeEmail(email) {
    const cipher = crypto.createCipheriv('aes-256-cbc', byteArray.toString('hex'), iv);
    let encrypted = cipher.update(email, 'utf-8', 'hex');
    encrypted += cipher.final('hex');

    return encrypted;
}

function decodeEmail(encodedEmail) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', byteArray.toString('hex'), iv);
    let decrypted = decipher.update(encodedEmail, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
}

if (operation === 'encode') {
    const encoded = encodeEmail(userInput);
    console.log('Encoded:', encoded);
} else if (operation === 'decode') {
    const decoded = decodeEmail(userInput);
    console.log('Decoded:', decoded);
} else {
    console.log('Invalid operation. Use "encode" or "decode"');
}
