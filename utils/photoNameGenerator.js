const path = require("path");

function generatePhotoName(id, originalName) {
  const ext = path.extname(originalName);
  return `${id}${ext}`;
}

module.exports = { generatePhotoName };
