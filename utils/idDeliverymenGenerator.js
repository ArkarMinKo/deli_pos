function generateId(db, callback) {
  db.query("SELECT id FROM deliverymen ORDER BY id DESC LIMIT 1", (err, results) => {
    if (err) return callback(err);

    let newId;

    if (results.length === 0) {
      newId = "D001";
    } else {
      const lastId = results[0].id;
      const numPart = parseInt(lastId.slice(1), 10);
      const nextNum = numPart + 1;

      newId = "D" + nextNum.toString().padStart(3, "0");
    }

    callback(null, newId);
  });
}

module.exports = { generateId };