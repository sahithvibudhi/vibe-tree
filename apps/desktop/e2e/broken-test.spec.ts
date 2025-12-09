import { test, expect } from '@playwright/test';

test.describe('Intentionally Broken Test', () => {
  test('this test should fail', async () => {
    // This test is intentionally broken to verify CI failure reporting
    expect(1 + 1).toBe(3);
  });
});
