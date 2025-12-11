import { test, expect } from '@playwright/test';

test.describe('Intentionally Broken Test', () => {
  test('this test should fail to verify CI failure reporting', async () => {
    // This test is intentionally broken to verify that:
    // 1. The ExitStatusReporter correctly records failure
    // 2. The global teardown reads the failure status
    // 3. CI correctly reports the build as failed
    expect(1 + 1).toBe(3);
  });
});
