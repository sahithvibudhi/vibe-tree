import { test, expect } from '@playwright/test';

test.describe('Intentionally Broken Test', () => {
  test('this test should fail to prove CI detects failures', async () => {
    // This will fail: 1 + 1 is not 3
    expect(1 + 1).toBe(3);
  });
});
