const { CLOUD_SYNC_BASE_URL, EDGE_ID } = require('./app');

function getFrpConfig() {
  return {
    enabled: Boolean(process.env.FRP_ENABLED === 'true'),
    edgeId: EDGE_ID,
    subdomain: EDGE_ID,
    publicUrl: `https://${EDGE_ID}.edgefolio.iotsoft.in`,
    cloudBaseUrl: CLOUD_SYNC_BASE_URL,
    note: 'Set FRP_ENABLED=true and configure frp-client-config.ini to expose EDGE over the internet.',
  };
}

module.exports = { getFrpConfig };
