(async () => {
  try {
    for (const run of T.tests) await run();
    T.check('no application exceptions in tool regressions', T.errors.length === 0);
    window.TEST_RESULT = { passed: true, checks: T.checks };
  } catch (error) {
    window.TEST_RESULT = { passed: false, checks: T.checks, error: error.stack, errors: T.errors };
  }
  document.getElementById('result').textContent = JSON.stringify(window.TEST_RESULT, null, 2);
})();
