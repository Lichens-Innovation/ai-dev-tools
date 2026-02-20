const os = require("os");

const collectUsername = () => {
  return os.userInfo().username;
};

if (require.main === module) {
  console.log(collectUsername());
} else {
  module.exports = { collectUsername };
  module.exports.default = collectUsername;
}
