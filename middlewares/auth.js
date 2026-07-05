const { verifyJWT } = require("../utils/jwtToken");

/**
 * Normal user (login ဖြစ်ထားရုံ)
 */
async function authUser(req, res, targetId = null) {
  try {
    const user = await verifyJWT(req);
    req.user = user;

    if (targetId && user.userId !== targetId) {
       res.writeHead(403, { "Content-Type": "application/json" });
       res.end(JSON.stringify({ message: "Access Denied" }));
       return false;
    }

    return true;
  } catch (err) {
    res.writeHead(err.status || 401, {
      "Content-Type": "application/json"
    });
    res.end(JSON.stringify({ message: err.message }));
    return false;
  }
}

/**
 *  Owner only
 */
async function authOwner(req, res) {
  try {
    const user = await verifyJWT(req);

    if (user.role !== "owner") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Owner only access" }));
      return false;
    }

    return true;
  } catch (err) {
    res.writeHead(err.status || 401, {
      "Content-Type": "application/json"
    });
    res.end(JSON.stringify({ message: err.message }));
    return false;
  }
}
/**
 *  Admin only
 */
async function authAdmin(req, res, targetId = null) {
  try {
    const user = await verifyJWT(req);

    if (user.role !== "owner" && user.role !== "manager" && user.role !== "shopmanager" && user.role !== "delimanager") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Admin Team only access" }));
      return false;
    }

    return true;
  } catch (err) {
    res.writeHead(err.status || 401, {
      "Content-Type": "application/json"
    });
    res.end(JSON.stringify({ message: err.message }));
    return false;
  }
}

function checkIsAdmin(user) {
    const adminRoles = ["owner", "manager", "seller", "chatmen"];
    return adminRoles.includes(user.role);
}

module.exports = { authUser, authOwner, authAdmin, checkIsAdmin };
