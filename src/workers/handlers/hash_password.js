const crypto = require('crypto');

async function hash_password(payload) {
    const hash = crypto.pbkdf2Sync(payload.password,'salt',1000,64,'sha512').toString('hex');
    return {hash}
}

module.exports = hash_password;