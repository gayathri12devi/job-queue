const zlib = require('zlib');

async function compress_text(payload) {
    const compressed = zlib.gzipSync(payload.text);
    return {original_size: payload.text.length,compressed_size: compressed.length,ratio:(compressed.length/payload.text.length).toFixed(2)};
}

module.exports = compress_text;