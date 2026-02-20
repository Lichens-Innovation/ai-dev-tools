const os = require("os");

const collectOsInfos = () => {
  return {
    arch: os.arch(),
    type: os.type(),
  };
};

if (require.main === module) {
  console.log(JSON.stringify(collectOsInfos()));
} else {
  module.exports = { collectOsInfos };
  module.exports.default = collectOsInfos;
}
