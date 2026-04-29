function sendSms({ to, message }) {
  return {
    queued: true,
    to,
    message,
    provider: 'stub',
    note: 'SMS provider is not configured yet.',
  };
}

module.exports = {
  sendSms,
};
