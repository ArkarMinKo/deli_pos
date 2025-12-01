function generateMenuId(db, shopId, callback) {
  // Check latest category for this shop
  db.query(
    "SELECT id FROM menu WHERE shop_id = ? ORDER BY id DESC LIMIT 1",
    [shopId],
    (err, results) => {
      if (err) return callback(err);

      let newId;

      if (results.length === 0) {
        // First category for this shop
        newId = `${shopId}_M001`;
      } else {
        // Extract last number: S001_C008 → 008
        const lastId = results[0].id;
        const lastNum = parseInt(lastId.split("_M")[1], 10);
        const nextNum = lastNum + 1;

        newId = `${shopId}_M${nextNum.toString().padStart(3, "0")}`;
      }

      callback(null, newId);
    }
  );
}

module.exports = { generateMenuId };