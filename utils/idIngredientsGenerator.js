function generateIngredientsId(db, shopId, callback) {
  // Check latest category for this shop
  db.query(
    "SELECT id FROM ingredients WHERE shop_id = ? ORDER BY id DESC LIMIT 1",
    [shopId],
    (err, results) => {
      if (err) return callback(err);

      let newId;

      if (results.length === 0) {
        // First category for this shop
        newId = `${shopId}_I001`;
      } else {
        // Extract last number: S001_C008 → 008
        const lastId = results[0].id;
        const lastNum = parseInt(lastId.split("_I")[1], 10);
        const nextNum = lastNum + 1;

        newId = `${shopId}_I${nextNum.toString().padStart(3, "0")}`;
      }

      callback(null, newId);
    }
  );
}

module.exports = { generateIngredientsId };