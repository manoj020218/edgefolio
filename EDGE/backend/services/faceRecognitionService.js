function enrollFaceTemplate(_employeeId, _imagePath) {
  return {
    ok: false,
    message: 'Face enrollment bridge is not wired yet in this build.',
  };
}

function verifyFaceTemplate(_employeeId, _imagePath) {
  return {
    ok: false,
    score: 0,
    message: 'Face verification bridge is not wired yet in this build.',
  };
}

module.exports = {
  enrollFaceTemplate,
  verifyFaceTemplate,
};
