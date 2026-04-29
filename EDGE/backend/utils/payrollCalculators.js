function toNumber(value) {
  return Number(value || 0);
}

function calculateNetSalary({ basicSalary = 0, earnings = {}, deductions = {} }) {
  const gross = Object.values(earnings).reduce((sum, amount) => sum + toNumber(amount), 0);
  const totalDeductions = Object.values(deductions).reduce(
    (sum, amount) => sum + toNumber(amount),
    0,
  );
  return {
    gross,
    totalDeductions,
    netSalary: gross - totalDeductions,
  };
}

module.exports = {
  calculateNetSalary,
};
