import crypto from 'crypto';

// Function to encrypt text
function encrypt(text, secret) {
  const algorithm = 'aes-256-cbc';
  const iv = crypto.randomBytes(16); // Initialization vector
  const key = crypto.scryptSync(secret, 'salt', 32); // Generate key from secret

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Return the IV and encrypted text as a single string
  return iv.toString('hex') + ':' + encrypted;
}

// Function to decrypt text
function decrypt(encryptedText, secret) {
  const algorithm = 'aes-256-cbc';
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.scryptSync(secret, 'salt', 32); // Generate key from secret

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export { encrypt, decrypt };