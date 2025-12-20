function generateAdminId(db, callback) {
  db.query("SELECT id FROM admin ORDER BY id DESC LIMIT 1", (err, results) => {
    if (err) return callback(err);

    let newId;

    if (results.length === 0) {
      newId = "A001";
    } else {
      const lastId = results[0].id;
      const numPart = parseInt(lastId.slice(1), 10);
      const nextNum = numPart + 1;

      newId = "A" + nextNum.toString().padStart(3, "0");
    }

    callback(null, newId);
  });
}

module.exports = { generateAdminId };