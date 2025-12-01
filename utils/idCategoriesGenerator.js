function generateCategoryId(db, shopId, callback) {
  // Check latest category for this shop
  db.query(
    "SELECT id FROM categories WHERE shop_id = ? ORDER BY id DESC LIMIT 1",
    [shopId],
    (err, results) => {
      if (err) return callback(err);

      let newId;

      if (results.length === 0) {
        // First category for this shop
        newId = `${shopId}_C001`;
      } else {
        // Extract last number: S001_C008 → 008
        const lastId = results[0].id;
        const lastNum = parseInt(lastId.split("_C")[1], 10);
        const nextNum = lastNum + 1;

        newId = `${shopId}_C${nextNum.toString().padStart(3, "0")}`;
      }

      callback(null, newId);
    }
  );
}

module.exports = { generateCategoryId };