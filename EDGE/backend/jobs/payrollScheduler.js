const {
  getPayrollOverview,
  runMonthlyPayroll,
} = require('../services/payrollEngine');
const logger = require('../utils/logger');

function monthKeyForDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function startPayrollScheduler({
  checkIntervalMinutes = 60,
  runDay = 1,
  runHour = 2,
} = {}) {
  const safeMinutes = Math.max(Number(checkIntervalMinutes) || 60, 1);
  const safeRunDay = Math.min(Math.max(Number(runDay) || 1, 1), 31);
  const safeRunHour = Math.min(Math.max(Number(runHour) || 2, 0), 23);
  const intervalMs = safeMinutes * 60 * 1000;

  let inFlight = false;
  let completedMonthKey = null;

  function shouldRunNow(now) {
    if (now.getDate() < safeRunDay) return false;
    if (now.getHours() < safeRunHour) return false;
    return true;
  }

  function runCycle(trigger) {
    if (inFlight) {
      logger.warn('Payroll scheduler cycle skipped because previous cycle is still running', {
        trigger,
      });
      return;
    }

    inFlight = true;
    const startedAt = Date.now();

    try {
      const now = new Date();
      const monthKey = monthKeyForDate(now);
      const runId = `PAY-${monthKey}`;

      if (!shouldRunNow(now)) {
        logger.info('Payroll scheduler check skipped due to run window', {
          trigger,
          monthKey,
          runDay: safeRunDay,
          runHour: safeRunHour,
        });
        return;
      }

      if (completedMonthKey === monthKey) {
        logger.info('Payroll scheduler already completed for current month', {
          trigger,
          monthKey,
        });
        return;
      }

      const existing = getPayrollOverview().some((row) => row.run_id === runId);
      const run = runMonthlyPayroll(monthKey, 'scheduler@edgefolio.local');
      completedMonthKey = monthKey;

      logger.info('Payroll scheduler cycle completed', {
        trigger,
        durationMs: Date.now() - startedAt,
        monthKey,
        runId: run.run_id,
        existedBeforeRun: existing,
      });
    } catch (error) {
      logger.error('Payroll scheduler cycle failed', {
        trigger,
        reason: error.message,
      });
    } finally {
      inFlight = false;
    }
  }

  const timer = setInterval(() => {
    runCycle('interval');
  }, intervalMs);
  timer.unref();

  // Run a non-intrusive startup check so first monthly run doesn't wait an hour.
  setTimeout(() => {
    runCycle('startup');
  }, 15000).unref();

  logger.info('Payroll scheduler started', {
    checkIntervalMinutes: safeMinutes,
    runDay: safeRunDay,
    runHour: safeRunHour,
  });

  return {
    name: 'payroll',
    runNow: () => runCycle('manual'),
    stop: () => {
      clearInterval(timer);
      logger.info('Payroll scheduler stopped');
    },
  };
}

module.exports = {
  startPayrollScheduler,
};
